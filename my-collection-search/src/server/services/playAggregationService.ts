import { playDetectionRepository } from "@/server/repositories/playDetectionRepository";
import { spinLoggingService } from "@/server/services/spinLoggingService";
import type { PlayDetectionRow } from "@/types/playDetection";

export const DEFAULT_PLAY_CONFIDENCE_FLOOR = Number(process.env.PLAY_CONFIDENCE_FLOOR ?? "0.75");
export const DEFAULT_PLAY_GAP_SECONDS = Number(process.env.PLAY_AGGREGATION_GAP_SECONDS ?? "45");

export type AggregatedPlay = { first: PlayDetectionRow; last: PlayDetectionRow; confidence: number };

/** What the grouping rule needs from one window, whatever it came from. */
export type GroupableWindow = {
  /** When the window starts, in milliseconds on any consistent clock. */
  at: number | null;
  track_id: string | null;
  friend_id: number | null;
  confidence: number | null;
  offset_seconds?: number | null;
};

export type WindowGroup<T> = { first: T; last: T; confidence: number; members: T[] };

export type GroupingOptions = {
  confidenceFloor?: number;
  gapSeconds?: number;
  /**
   * Split a run of one track when its offset stops keeping pace with the
   * clock by more than this many seconds — the same record dropped back to
   * the start, or played twice back to back. Off unless given: live listeners
   * (#279) do not need it, and set derivation (#282) does.
   */
  maxDriftSeconds?: number;
};

function timestamp(detection: PlayDetectionRow): number | null {
  if (!detection.window_start_at) return null;
  const value = new Date(detection.window_start_at).getTime();
  return Number.isFinite(value) ? value : null;
}

/** Where on the track this window says the recording started, in seconds. */
function anchor(window: GroupableWindow): number | null {
  if (window.offset_seconds == null || window.at == null) return null;
  return window.at / 1000 - window.offset_seconds;
}

/**
 * The grouping rule, shared by live play tracking (#279) and set derivation
 * (#282): consecutive confident windows of one track, no more than
 * `gapSeconds` apart, are one play. Windows arrive in capture order.
 */
export function groupWindows<T>(
  items: T[],
  view: (item: T) => GroupableWindow,
  {
    confidenceFloor = DEFAULT_PLAY_CONFIDENCE_FLOOR,
    gapSeconds = DEFAULT_PLAY_GAP_SECONDS,
    maxDriftSeconds,
  }: GroupingOptions = {}
): WindowGroup<T>[] {
  const groups: WindowGroup<T>[] = [];
  for (const item of items) {
    const window = view(item);
    const { at, confidence } = window;
    if (!window.track_id || !window.friend_id || confidence == null || confidence < confidenceFloor || at == null) continue;
    const current = groups.at(-1);
    const first = current ? view(current.first) : null;
    const lastAt = current ? view(current.last).at : null;
    const sameTrack = first?.track_id === window.track_id && first?.friend_id === window.friend_id;
    const withinGap = lastAt != null && at - lastAt <= gapSeconds * 1000;
    if (current && sameTrack && withinGap && !drifted(first, window, maxDriftSeconds)) {
      current.last = item;
      current.members.push(item);
      current.confidence = Math.max(current.confidence, confidence);
    } else {
      groups.push({ first: item, last: item, confidence, members: [item] });
    }
  }
  return groups;
}

function drifted(
  first: GroupableWindow | null,
  window: GroupableWindow,
  maxDriftSeconds: number | undefined
): boolean {
  if (maxDriftSeconds == null || !first) return false;
  const expected = anchor(first);
  const actual = anchor(window);
  if (expected == null || actual == null) return false;
  return Math.abs(actual - expected) > maxDriftSeconds;
}

/** Pure grouping rule: order by capture time, not queue arrival time. */
export function groupDetections(
  detections: PlayDetectionRow[],
  options: { confidenceFloor?: number; gapSeconds?: number } = {}
): AggregatedPlay[] {
  return groupWindows(
    detections,
    (d) => ({ at: timestamp(d), track_id: d.track_id, friend_id: d.friend_id, confidence: d.confidence }),
    options
  ).map(({ first, last, confidence }) => ({ first, last, confidence }));
}

/** Turns confidently matched windows into one automatic spin per contiguous play. */
export class PlayAggregationService {
  async aggregateSource(sourceId: string, since: Date | string, options: { confidenceFloor?: number; gapSeconds?: number } = {}): Promise<{ created: number; skipped: number }> {
    const detections = await playDetectionRepository.listRecentBySource(sourceId, since);
    let created = 0;
    let skipped = 0;
    for (const play of groupDetections(detections, options)) {
      if (await spinLoggingService.findAutomaticSessionByDetectionId(play.first.id)) { skipped++; continue; }
      await spinLoggingService.createAutomaticSpinSession({
        detection_id: play.first.id, source_id: sourceId, track_id: play.first.track_id!,
        friend_id: play.first.friend_id!, played_at: play.first.window_start_at!, confidence: play.confidence,
      });
      created++;
    }
    return { created, skipped };
  }

  /**
   * Read-only twin of `aggregateSource`: how many plays in this scope have not
   * yet been written to spins (#304). Never writes — for `vinyl status`, so a
   * silent backlog is visible without waiting on the next scheduled pass.
   */
  async countPending(sourceId: string, since: Date | string, options: { confidenceFloor?: number; gapSeconds?: number } = {}): Promise<number> {
    const detections = await playDetectionRepository.listRecentBySource(sourceId, since);
    let pending = 0;
    for (const play of groupDetections(detections, options)) {
      if (!(await spinLoggingService.findAutomaticSessionByDetectionId(play.first.id))) pending++;
    }
    return pending;
  }
}

export const playAggregationService = new PlayAggregationService();

/**
 * Scheduling for #304.
 *
 * `PlayAggregationService.aggregateSource` — the grouping/dedup logic #279
 * added — was never called from anywhere: no route, CLI command, or
 * scheduler. Detections piled up in `play_detections` and nothing ever turned
 * them into a spin. Two triggers close that gap, the same shape as #303's
 * fingerprint backfill:
 *
 * - `ingestLifecycleService.report()` calls `aggregateSource` for a source
 *   the moment it records a confident detection, for latency.
 * - This periodic pass is the backstop: it catches a source aggregated while
 *   the app was mid-deploy, or any activity that reaches `play_detections` by
 *   a path other than that one call site.
 *
 * Both share `aggregateLookbackMs` so a late scheduler pass and an on-the-spot
 * trigger consider the same window, and both are safe to run redundantly —
 * `aggregateSource`'s own dedup (`findAutomaticSessionByDetectionId`) is what
 * makes re-checking a source with nothing new to aggregate free.
 */

function positiveMinutes(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed * 60_000 : fallback * 60_000;
}

/** Minutes between aggregation passes. The scheduler still ticks every minute. */
export function aggregationIntervalMs(): number {
  return positiveMinutes(process.env.PLAY_AGGREGATION_INTERVAL_MINUTES, 5);
}

/**
 * How far back an aggregation pass looks, from either trigger.
 *
 * Wide enough to hold a single play's full run of windows (#279 does not cap
 * how long one track may play for) without scanning a source's entire
 * history on every tick.
 */
export function aggregationLookbackMs(): number {
  return positiveMinutes(process.env.PLAY_AGGREGATION_LOOKBACK_MINUTES, 60);
}

const GLOBAL_AGGREGATION_KEY = "__groovenetPlayAggregationStarted";

type GlobalWithAggregation = typeof globalThis & {
  [GLOBAL_AGGREGATION_KEY]?: boolean;
};

let lastAggregationAtMs = 0;

/** One scheduler tick: aggregate every recently-active source, if due. */
export async function aggregationTick(now: number = Date.now()): Promise<void> {
  if (now - lastAggregationAtMs < aggregationIntervalMs()) return;
  lastAggregationAtMs = now;

  const since = new Date(now - aggregationLookbackMs());
  try {
    const sourceIds = await playDetectionRepository.listActiveSourceIds(since);
    let created = 0;
    for (const sourceId of sourceIds) {
      try {
        const result = await playAggregationService.aggregateSource(sourceId, since);
        created += result.created;
      } catch (error) {
        // One source's failure must not block the rest.
        console.error(`[play-aggregation] source ${sourceId} failed:`, error);
      }
    }
    if (created > 0) {
      console.log(`[play-aggregation] created ${created} spin session(s)`);
    }
  } catch (error) {
    console.error("[play-aggregation] tick failed:", error);
  }
}

/** Exported for tests: the tick's interval bookkeeping is module state. */
export function resetAggregationClock(): void {
  lastAggregationAtMs = 0;
}

/** Start the aggregation scheduler, once per process. */
export function startPlayAggregation(): void {
  const g = globalThis as GlobalWithAggregation;
  if (g[GLOBAL_AGGREGATION_KEY]) return;
  g[GLOBAL_AGGREGATION_KEY] = true;

  void aggregationTick();
  setInterval(() => {
    void aggregationTick();
  }, 60_000);

  console.log("[play-aggregation] started");
}

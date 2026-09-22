import { playDetectionRepository } from "@/server/repositories/playDetectionRepository";
import { spinLoggingService } from "@/server/services/spinLoggingService";
import type { PlayDetectionRow } from "@/types/playDetection";

export const DEFAULT_PLAY_CONFIDENCE_FLOOR = Number(process.env.PLAY_CONFIDENCE_FLOOR ?? "0.75");
export const DEFAULT_PLAY_GAP_SECONDS = Number(process.env.PLAY_AGGREGATION_GAP_SECONDS ?? "45");

export type AggregatedPlay = { first: PlayDetectionRow; last: PlayDetectionRow; confidence: number };

function timestamp(detection: PlayDetectionRow): number | null {
  if (!detection.window_start_at) return null;
  const value = new Date(detection.window_start_at).getTime();
  return Number.isFinite(value) ? value : null;
}

/** Pure grouping rule: order by capture time, not queue arrival time. */
export function groupDetections(
  detections: PlayDetectionRow[],
  { confidenceFloor = DEFAULT_PLAY_CONFIDENCE_FLOOR, gapSeconds = DEFAULT_PLAY_GAP_SECONDS } = {}
): AggregatedPlay[] {
  const plays: AggregatedPlay[] = [];
  for (const detection of detections) {
    const at = timestamp(detection);
    if (!detection.track_id || !detection.friend_id || detection.confidence == null || detection.confidence < confidenceFloor || at == null) continue;
    const current = plays.at(-1);
    const currentAt = current ? timestamp(current.last) : null;
    if (current && current.first.track_id === detection.track_id && current.first.friend_id === detection.friend_id && currentAt != null && at - currentAt <= gapSeconds * 1000) {
      current.last = detection;
      current.confidence = Math.max(current.confidence, detection.confidence);
    } else {
      plays.push({ first: detection, last: detection, confidence: detection.confidence });
    }
  }
  return plays;
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

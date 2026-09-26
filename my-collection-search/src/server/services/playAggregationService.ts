import { logIngestEvent, msSince } from "@/lib/ingestLog";
import { playDetectionRepository } from "@/server/repositories/playDetectionRepository";
import { ingestMetricsService } from "@/server/services/ingestMetricsService";
import { spinLoggingService } from "@/server/services/spinLoggingService";
import type { PlayDetectionRow } from "@/types/playDetection";

export const DEFAULT_PLAY_CONFIDENCE_FLOOR = Number(process.env.PLAY_CONFIDENCE_FLOOR ?? "0.75");
export const DEFAULT_PLAY_GAP_SECONDS = Number(process.env.PLAY_AGGREGATION_GAP_SECONDS ?? "45");

/**
 * Windows a run needs before it is a play, and so a spin. One used to be
 * enough; real use showed every false spin was a single window at a track
 * boundary — run-out noise or an idle chain's hiss resembling a quiet stretch
 * of some reference track — while every real play ran four or more.
 */
export const DEFAULT_PLAY_MIN_WINDOWS = Number(process.env.PLAY_MIN_WINDOWS ?? "2");

/**
 * How fast a play's position in its track may advance per second of clock to
 * count as playing. Vinyl at pitch is 1.0; turntable pitch control reaches
 * about ±8%, and offsets are only as precise as a window's alignment. Noise
 * that keeps matching the same spot of a track advances at 0.
 */
export const PLAY_RATE_MIN = 0.75;
export const PLAY_RATE_MAX = 1.25;

export type AggregatedPlay = {
  first: PlayDetectionRow;
  last: PlayDetectionRow;
  confidence: number;
  /** Windows in the run. */
  windows: number;
  /**
   * Median seconds of track per second of clock between consecutive windows
   * with a known position; null with fewer than two. The median, so one
   * window that matched a repeat cannot sink a long play.
   */
  rate: number | null;
};

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
  /**
   * How many consecutive windows must agree on a *new* alignment before a
   * drift splits the play. Repetitive music matches a repeat of the same
   * section now and then — on #271's set, one or two windows at a time — and
   * a play must not break on that. A record really restarted holds its new
   * alignment for as long as it plays. Default 4, about a minute.
   */
  driftConfirmWindows?: number;
};

export const DEFAULT_DRIFT_CONFIRM_WINDOWS = 4;

function timestamp(detection: PlayDetectionRow): number | null {
  if (!detection.window_start_at) return null;
  const value = new Date(detection.window_start_at).getTime();
  return Number.isFinite(value) ? value : null;
}

/**
 * Where on the recording this window says the track started, in seconds.
 *
 * Unknown at an offset of 0: that is where the matcher clamps a window that
 * began before the track did, so it bounds the alignment without fixing it.
 * Treating it as exact put a play's reference a few seconds off.
 */
function anchor(window: GroupableWindow): number | null {
  if (window.offset_seconds == null || window.offset_seconds <= 0 || window.at == null) return null;
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
    driftConfirmWindows = DEFAULT_DRIFT_CONFIRM_WINDOWS,
  }: GroupingOptions = {}
): WindowGroup<T>[] {
  const groups: WindowGroup<T>[] = [];
  // The current play's established alignment: followed window by window,
  // not fixed at the first, whose offset is often clamped to 0 because the
  // window began before the needle dropped.
  let reference: number | null = null;
  // Windows of the current track that disagree with `reference`, held until
  // enough of them agree to be a restart, or the play resumes its line.
  let held: T[] = [];
  let lastAt: number | null = null;

  const add = (group: WindowGroup<T>, item: T) => {
    group.last = item;
    group.members.push(item);
    group.confidence = Math.max(group.confidence, view(item).confidence as number);
  };
  // Held windows that never became a restart were noise within this play.
  const release = (group: WindowGroup<T> | undefined) => {
    if (group) held.forEach((item) => add(group, item));
    held = [];
  };
  const begin = (first: T, rest: T[] = []) => {
    const group = { first, last: first, confidence: view(first).confidence as number, members: [first] };
    rest.forEach((item) => add(group, item));
    groups.push(group);
  };
  const agrees = (a: number | null, b: number | null) =>
    maxDriftSeconds == null || a == null || b == null || Math.abs(a - b) <= maxDriftSeconds;

  for (const item of items) {
    const window = view(item);
    const { at, confidence } = window;
    if (!window.track_id || !window.friend_id || confidence == null || confidence < confidenceFloor || at == null) continue;
    const current = groups.at(-1);
    const first = current ? view(current.first) : null;
    const sameTrack = first?.track_id === window.track_id && first?.friend_id === window.friend_id;
    const withinGap = lastAt != null && at - lastAt <= gapSeconds * 1000;
    const aligned = anchor(window);
    lastAt = at;

    if (!current || !sameTrack || !withinGap) {
      release(current);
      begin(item);
      reference = aligned;
      continue;
    }

    if (agrees(aligned, reference)) {
      release(current);
      add(current, item);
      reference = aligned ?? reference;
      continue;
    }

    // Off the line: join the held run if it agrees with it, else start one.
    if (held.length > 0 && agrees(aligned, anchor(view(held[0])))) {
      held.push(item);
    } else {
      release(current);
      held = [item];
    }
    if (held.length >= driftConfirmWindows) {
      // A restart's first window is usually at offset 0 — the needle drop —
      // so it went into the old play as alignment-unknown. Bring those back:
      // only the ones after the old play's last aligned window.
      const carried = trailingUnaligned(current, view);
      const [head, ...rest] = [...carried, ...held];
      held = [];
      begin(head, rest);
      reference = aligned;
    }
  }
  release(groups.at(-1));
  return groups;
}

/**
 * Remove and return the windows at the end of `group` whose alignment is
 * unknown, back to its last aligned window. Only called on a confirmed
 * restart, and a window is only ever held against an established reference —
 * which came from an aligned member — so the group always keeps at least one.
 */
function trailingUnaligned<T>(group: WindowGroup<T>, view: (item: T) => GroupableWindow): T[] {
  let cut = group.members.length;
  while (anchor(view(group.members[cut - 1])) == null) cut--;
  const carried = group.members.splice(cut);
  group.last = group.members[group.members.length - 1];
  group.confidence = Math.max(...group.members.map((item) => view(item).confidence as number));
  return carried;
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
  ).map(({ first, last, confidence, members }) => ({
    first,
    last,
    confidence,
    windows: members.length,
    rate: medianRate(members),
  }));
}

function medianRate(members: PlayDetectionRow[]): number | null {
  // A 0 offset is where the matcher clamps a window that began before the
  // track did: it says nothing about position, so it is left out.
  const known = members.filter((d) => (d.offset_seconds ?? 0) > 0 && timestamp(d) != null);
  const rates: number[] = [];
  for (let i = 1; i < known.length; i++) {
    const seconds = ((timestamp(known[i]) as number) - (timestamp(known[i - 1]) as number)) / 1000;
    if (seconds > 0) {
      rates.push(((known[i].offset_seconds as number) - (known[i - 1].offset_seconds as number)) / seconds);
    }
  }
  if (rates.length === 0) return null;
  rates.sort((x, y) => x - y);
  const mid = Math.floor(rates.length / 2);
  return rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2;
}

/**
 * Whether a run of windows is a play worth a spin.
 *
 * Enough windows, and — where positions are known — a position that advances
 * with the clock. Without known positions the window count decides alone.
 */
export function isRealPlay(
  play: Pick<AggregatedPlay, "windows" | "rate">,
  { minWindows = DEFAULT_PLAY_MIN_WINDOWS }: { minWindows?: number } = {}
): boolean {
  if (play.windows < minWindows) return false;
  if (play.rate === null) return true;
  return play.rate >= PLAY_RATE_MIN && play.rate <= PLAY_RATE_MAX;
}

type AggregationOptions = { confidenceFloor?: number; gapSeconds?: number; minWindows?: number };

/**
 * The end of the pipeline for one play (#280): a line, and a latency sample.
 *
 * Latency runs from the capture of the play's newest window — the one whose
 * arrival tipped it over into a play, on the immediate trigger — to now. A
 * spin made by the periodic backstop, or from a listener's backlog, reports
 * the delay honestly rather than hiding it.
 */
function recordConfirmedPlay(sourceId: string, play: AggregatedPlay): void {
  const latencyMs = msSince(play.last.window_start_at);
  ingestMetricsService.playConfirmed(latencyMs);
  logIngestEvent("play.confirmed", {
    ingest_id: play.last.ingest_id,
    source_id: sourceId,
    session_id: play.first.session_id,
    detection_id: play.first.id,
    track_id: play.first.track_id,
    friend_id: play.first.friend_id,
    confidence: play.confidence,
    windows: play.windows,
    captured_at: play.last.window_start_at ? new Date(play.last.window_start_at).toISOString() : null,
    latency_ms: latencyMs,
  });
}

/** Turns confidently matched windows into one automatic spin per contiguous play. */
export class PlayAggregationService {
  async aggregateSource(sourceId: string, since: Date | string, options: AggregationOptions = {}): Promise<{ created: number; skipped: number }> {
    const detections = await playDetectionRepository.listRecentBySource(sourceId, since);
    let created = 0;
    let skipped = 0;
    for (const play of groupDetections(detections, options).filter((p) => isRealPlay(p, options))) {
      if (await spinLoggingService.findAutomaticSessionByDetectionId(play.first.id)) { skipped++; continue; }
      await spinLoggingService.createAutomaticSpinSession({
        detection_id: play.first.id, source_id: sourceId, track_id: play.first.track_id!,
        friend_id: play.first.friend_id!, played_at: play.first.window_start_at!, confidence: play.confidence,
      });
      created++;
      recordConfirmedPlay(sourceId, play);
    }
    return { created, skipped };
  }

  /**
   * Read-only twin of `aggregateSource`: how many plays in this scope have not
   * yet been written to spins (#304). Never writes — for `vinyl status`, so a
   * silent backlog is visible without waiting on the next scheduled pass.
   */
  async countPending(sourceId: string, since: Date | string, options: AggregationOptions = {}): Promise<number> {
    const detections = await playDetectionRepository.listRecentBySource(sourceId, since);
    let pending = 0;
    for (const play of groupDetections(detections, options).filter((p) => isRealPlay(p, options))) {
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

import { groupWindows } from "@/server/services/playAggregationService";
import type {
  DerivedPlay,
  PlannedEntry,
  SetDiff,
  SetWindow,
} from "@/types/setDerivation";

/**
 * Turning a set's per-window matches into a tracklist, and a tracklist into a
 * diff against the plan (#282). Pure: the service resolves tracks and planned
 * entries from the database and hands them in.
 */

export type TracklistOptions = {
  confidenceFloor?: number;
  gapSeconds?: number;
  /**
   * A run of one track whose offset drifts from the recording's clock by more
   * than this is split: the record was dropped back, or played twice. Vinyl
   * at pitch drifts by well under a second over a whole side (#271 measured a
   * rate of 1.0013), so this only catches real jumps.
   */
  maxDriftSeconds?: number;
  /** Consecutive windows that must agree on a new alignment to split; see groupWindows. */
  driftConfirmWindows?: number;
};

export const DEFAULT_MAX_DRIFT_SECONDS = 20;

/**
 * An unmatched stretch shorter than this is a transition, not a record: two
 * windows either side of a mix routinely match neither track. #271's shortest
 * genuinely unidentified region was 90 s.
 */
export const DEFAULT_MIN_UNIDENTIFIED_SECONDS = 60;

type Located = { window: SetWindow; index: number };

/** Consecutive confident windows of one track, as plays in recording order. */
export function derivePlays(
  windows: SetWindow[],
  { maxDriftSeconds = DEFAULT_MAX_DRIFT_SECONDS, ...options }: TracklistOptions = {}
): Array<Omit<DerivedPlay, "track">> {
  const located: Located[] = windows
    .map((window, index) => ({ window, index }))
    .sort((a, b) => a.window.start_seconds - b.window.start_seconds);

  const groups = groupWindows(
    located,
    ({ window }) => {
      const best = window.candidates[0];
      return {
        at: window.start_seconds * 1000,
        track_id: best?.track_id ?? null,
        friend_id: best?.friend_id ?? null,
        confidence: best?.confidence ?? null,
        offset_seconds: best?.offset_seconds ?? null,
      };
    },
    { ...options, maxDriftSeconds }
  );

  return groups.map(({ first, last, confidence, members }) => {
    const head = first.window.candidates[0];
    const tail = last.window.candidates[0];
    const span = last.window.start_seconds - first.window.start_seconds;
    return {
      track_id: head.track_id,
      friend_id: head.friend_id,
      start_seconds: first.window.start_seconds,
      end_seconds: last.window.start_seconds + last.window.duration_seconds,
      confidence,
      windows: members.length,
      rate: span > 0 ? round((tail.offset_seconds - head.offset_seconds) / span, 4) : null,
    };
  });
}

/**
 * Stretches no play covers, longer than `minSeconds`, including before the
 * first play and after the last. Reported rather than dropped: an unmatched
 * stretch usually means a record outside the library, which is worth knowing.
 */
export function findUnidentified(
  plays: Array<Pick<DerivedPlay, "start_seconds" | "end_seconds">>,
  durationSeconds: number,
  minSeconds: number = DEFAULT_MIN_UNIDENTIFIED_SECONDS
): Array<{ start_seconds: number; end_seconds: number; before: number | null; after: number | null }> {
  const regions = [];
  let cursor = 0;
  let before: number | null = null;
  const bounds = [...plays.map((p, i) => ({ ...p, i })), { start_seconds: durationSeconds, end_seconds: durationSeconds, i: null }];
  for (const play of bounds) {
    if (play.start_seconds - cursor >= minSeconds) {
      regions.push({
        start_seconds: round(cursor, 2),
        end_seconds: round(play.start_seconds, 2),
        before,
        after: play.i,
      });
    }
    if (play.i !== null) before = play.i;
    cursor = Math.max(cursor, play.end_seconds);
  }
  return regions;
}

/** Seconds covered by at least one play. */
export function identifiedSeconds(
  plays: Array<Pick<DerivedPlay, "start_seconds" | "end_seconds">>
): number {
  let total = 0;
  let cursor = -Infinity;
  for (const play of [...plays].sort((a, b) => a.start_seconds - b.start_seconds)) {
    const start = Math.max(play.start_seconds, cursor);
    if (play.end_seconds > start) total += play.end_seconds - start;
    cursor = Math.max(cursor, play.end_seconds);
  }
  return round(total, 2);
}

type PlayRef = Pick<DerivedPlay, "track_id" | "friend_id"> & {
  track: { release_id: string | null } | null;
};

const keyOf = (ref: { track_id: string; friend_id: number }) => `${ref.track_id}\u0000${ref.friend_id}`;

/**
 * How the performance differed from the plan.
 *
 * - **played as planned** — the planned track, flagged `out_of_order` when it
 *   falls outside the longest run of plays that kept the plan's order. A
 *   track played in two stretches (split by a gap) is as-planned both times.
 * - **played instead of** — an unplanned play paired with an unplayed entry
 *   **on the same release**: the right record, the wrong track. All six #271
 *   substitutions are this shape, and reporting them as twelve unrelated
 *   events would bury the one fact that matters. When a release has several
 *   unplayed entries, the one nearest where the play happened wins.
 * - **played but not planned** / **planned but not played** — whatever is
 *   left.
 */
export function diffAgainstPlan(
  plays: PlayRef[],
  planned: PlannedEntry[],
  playlistId: number
): SetDiff {
  const plannedByKey = new Map<string, PlannedEntry[]>();
  for (const entry of planned) {
    const key = keyOf(entry);
    plannedByKey.set(key, [...(plannedByKey.get(key) ?? []), entry]);
  }

  const used = new Set<number>();
  const asPlanned: SetDiff["played_as_planned"] = [];
  const unplanned: number[] = [];
  // For each play, the planned index it was matched to, if any.
  const matchedIndex: Array<number | null> = plays.map(() => null);

  plays.forEach((play, i) => {
    const entries = plannedByKey.get(keyOf(play));
    if (!entries) {
      unplanned.push(i);
      return;
    }
    // A repeat of a planned track re-uses its entry rather than claiming a
    // second one: the same record resumed after a gap is still that slot.
    const entry = entries.find((e) => !used.has(e.index)) ?? entries[entries.length - 1];
    used.add(entry.index);
    matchedIndex[i] = entry.index;
    asPlanned.push({ play: i, planned: entry, out_of_order: false });
  });

  const inOrder = longestIncreasingRun(firstSightings(asPlanned));
  for (const item of asPlanned) {
    item.out_of_order = !inOrder.has(item.planned.index);
  }

  const unplayed = planned.filter((entry) => !used.has(entry.index));
  const insteadOf: SetDiff["played_instead_of"] = [];
  const notPlanned: SetDiff["played_not_planned"] = [];

  // A track already paired as played-instead-of keeps that pairing when it
  // shows up again: the same record resumed after a gap is still that slot,
  // exactly as a planned track played in two stretches is.
  const pairedByKey = new Map<string, PlannedEntry>();

  for (const i of unplanned) {
    const paired = pairedByKey.get(keyOf(plays[i]));
    if (paired) {
      matchedIndex[i] = paired.index;
      insteadOf.push({ play: i, planned: paired });
      continue;
    }
    const release = plays[i].track?.release_id ?? null;
    const expected = expectedIndex(matchedIndex, i);
    const candidates = release
      ? unplayed.filter((e) => e.release_id === release && e.friend_id === plays[i].friend_id)
      : [];
    if (candidates.length === 0) {
      notPlanned.push({ play: i });
      continue;
    }
    const chosen = candidates.reduce((best, e) =>
      Math.abs(e.index - expected) < Math.abs(best.index - expected) ? e : best
    );
    unplayed.splice(unplayed.indexOf(chosen), 1);
    matchedIndex[i] = chosen.index;
    pairedByKey.set(keyOf(plays[i]), chosen);
    insteadOf.push({ play: i, planned: chosen });
  }

  return {
    playlist_id: playlistId,
    played_as_planned: asPlanned,
    played_instead_of: insteadOf,
    played_not_planned: notPlanned,
    planned_not_played: unplayed,
  };
}

/** Planned indices in play order, each planned entry counted once. */
function firstSightings(asPlanned: SetDiff["played_as_planned"]): number[] {
  const seen = new Set<number>();
  const order: number[] = [];
  for (const { planned } of asPlanned) {
    if (seen.has(planned.index)) continue;
    seen.add(planned.index);
    order.push(planned.index);
  }
  return order;
}

/** The values in the longest strictly increasing subsequence. */
function longestIncreasingRun(values: number[]): Set<number> {
  const lengths = values.map(() => 1);
  const previous = values.map(() => -1);
  let best = -1;
  for (let i = 0; i < values.length; i++) {
    for (let j = 0; j < i; j++) {
      if (values[j] < values[i] && lengths[j] + 1 > lengths[i]) {
        lengths[i] = lengths[j] + 1;
        previous[i] = j;
      }
    }
    if (best === -1 || lengths[i] > lengths[best]) best = i;
  }
  const run = new Set<number>();
  for (let i = best; i !== -1; i = previous[i]) run.add(values[i]);
  return run;
}

/** Where in the plan play `i` would sit: just after the last matched play. */
function expectedIndex(matchedIndex: Array<number | null>, i: number): number {
  for (let j = i - 1; j >= 0; j--) {
    const index = matchedIndex[j];
    if (index !== null) return index + 1;
  }
  return 0;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

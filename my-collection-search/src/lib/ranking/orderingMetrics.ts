/**
 * How an ordering mixes, transition by transition (#1193). Pure, for profile
 * evaluation (#1196) to compare the orderings profiles produce. ga-service has
 * the same functions in `metrics.py`; both are pinned on
 * `ga-service/tests/fixtures/preset_orderings.json`.
 *
 * Every measure skips a transition where either side lacks the data, so a
 * missing BPM or key never reads as a smooth mix or a clash.
 */
import { camelotDistance } from "@/lib/playlistOrder";
import { camelotOf, parseBpm } from "@/lib/mixCompat";

export type MetricTrack = {
  bpm?: number | string | null;
  key?: string | null;
  /** The audio_vibe vector, as numbers or in pgvector's text form. */
  embedding?: readonly number[] | string | null;
};

export type OrderingMetrics = {
  transitions: number;
  /** Σ |ΔBPM| (to the nearest half or double with `halfDouble`). Lower is smoother tempo. */
  bpmJumps: number;
  /** Transitions more than one step apart on the Camelot wheel. */
  keyClashes: number;
  /** Σ (1 − cosine similarity) of the vibe vectors. Lower stays closer to the vibe. */
  vibeDistance: number;
};

const pairs = <T>(tracks: readonly T[]): Array<[T, T]> =>
  tracks.slice(1).map((track, i) => [tracks[i]!, track]);

function vector(value: MetricTrack["embedding"]): number[] | null {
  if (value === null || value === undefined) return null;
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  return parsed.map(Number);
}

export type BpmJumpOptions = {
  /**
   * Measure each jump to the nearest of the next track's tempo, double it or
   * half it, as a profile with half/double time mixes it (124 → 63 is 2).
   */
  halfDouble?: boolean;
};

export function bpmJumpTotal(
  tracks: readonly MetricTrack[],
  { halfDouble = false }: BpmJumpOptions = {},
): number {
  let total = 0;
  for (const [a, b] of pairs(tracks)) {
    const x = parseBpm(a.bpm);
    const y = parseBpm(b.bpm);
    if (x === null || y === null) continue;
    const tempos = halfDouble ? [y, y * 2, y / 2] : [y];
    total += Math.min(...tempos.map((tempo) => Math.abs(tempo - x)));
  }
  return total;
}

export function keyClashCount(tracks: readonly MetricTrack[]): number {
  let clashes = 0;
  for (const [a, b] of pairs(tracks)) {
    const x = camelotOf(a.key);
    const y = camelotOf(b.key);
    if (x && y && camelotDistance(x, y) > 1) clashes += 1;
  }
  return clashes;
}

export function vibeDistanceTotal(tracks: readonly MetricTrack[]): number {
  let total = 0;
  for (const [a, b] of pairs(tracks)) {
    const x = vector(a.embedding);
    const y = vector(b.embedding);
    if (!x || !y || x.length !== y.length) continue;
    const norm = Math.hypot(...x) * Math.hypot(...y);
    if (norm === 0) continue;
    total += 1 - x.reduce((sum, v, i) => sum + v * y[i]!, 0) / norm;
  }
  return total;
}

export function orderingMetrics(
  tracks: readonly MetricTrack[],
  options: BpmJumpOptions = {},
): OrderingMetrics {
  return {
    transitions: Math.max(tracks.length - 1, 0),
    bpmJumps: bpmJumpTotal(tracks, options),
    keyClashes: keyClashCount(tracks),
    vibeDistance: vibeDistanceTotal(tracks),
  };
}

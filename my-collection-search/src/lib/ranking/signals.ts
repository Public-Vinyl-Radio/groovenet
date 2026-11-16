/**
 * The signal registry (#1191): every signal the ranker computes, once per
 * candidate, normalised to [0, 1] (higher is a closer match) or null when
 * either side lacks the data. The similarity signals are normalised within
 * the candidate pool (#1218, see `poolRank`); every other signal has a fixed
 * scale. Profiles (#1192) key their weights on the ids
 * in `RANKING_SIGNAL_IDS` (`@groovenet/contracts`), so an id is never renamed.
 *
 * Every signal reuses an existing calculation: `describeMix`/`parseBpm` for
 * key and tempo, the pre-scorer's `calculateGenreOverlap` and
 * `areErasAdjacent`. To add one, add its id to `RANKING_SIGNAL_IDS` and an
 * entry here (the registry type makes it exhaustive), with tests for null,
 * edge and normal values. Registry order is summation order: keep new signals
 * after the existing ones, or today's float sums move.
 */
import type { RankingSignalId } from "@groovenet/contracts";
import { camelotOf, describeMix, parseBpm } from "@/lib/mixCompat";
import {
  areErasAdjacent,
  calculateGenreOverlap,
  EMPTY_GENRE_OVERLAP_CONTEXT,
  type GenreOverlapContext,
} from "@/lib/recommendation-pre-scorer";
import type { RankingCandidate, RankingTrack } from "./features";

export type SignalValue = { value: number | null; detail?: string };

export type SignalInput = {
  seed: RankingTrack;
  candidate: RankingCandidate;
  genreContext: GenreOverlapContext;
  /** The config's BPM window allows half and double time (#1192). */
  halfDouble?: boolean;
};

/** What a config tells the signals, beyond the two tracks. */
export type SignalOptions = { halfDouble?: boolean };

export type SignalDefinition = {
  id: RankingSignalId;
  /** Short label for a "why" line or a profile editor's slider. */
  label: string;
  compute: (input: SignalInput) => SignalValue;
  /**
   * `pool`: the computed value is a raw score whose scale means nothing on
   * its own, so the ranker replaces it with its rank within the request's
   * candidates (`poolRank`), keeping the raw value as the detail (#1218).
   */
  scale?: "pool";
};

export type KeyRelationDetail = "same" | "adjacent" | "relative" | "clash";

/** Same key 1, one step round the wheel or the relative major/minor 0.5, a clash 0. */
export const KEY_RELATION_VALUE: Record<KeyRelationDetail, number> = {
  same: 1,
  adjacent: 0.5,
  relative: 0.5,
  clash: 0,
};

function keyRelation({ seed, candidate }: SignalInput): SignalValue {
  const relation = describeMix(seed, candidate).keyRelation;
  if (relation === null) return { value: null };
  let detail: KeyRelationDetail = relation;
  if (relation === "adjacent") {
    // describeMix counts the relative major/minor as adjacent; name it apart
    // for the breakdown without changing its value.
    const a = camelotOf(seed.key)!;
    const b = camelotOf(candidate.key)!;
    if (parseInt(a, 10) === parseInt(b, 10)) detail = "relative";
  }
  return { value: KEY_RELATION_VALUE[detail], detail };
}

/**
 * 1 at the same tempo, falling linearly with the relative difference, 0 at
 * double. With half and double time allowed, the candidate is compared at
 * whichever of ×1, ×2 and ×½ is nearest, so a track at double time is as
 * close as one at the same tempo.
 */
function bpmDistance({ seed, candidate, halfDouble }: SignalInput): SignalValue {
  const baseBpm = parseBpm(seed.bpm);
  const candidateBpm = parseBpm(candidate.bpm);
  if (!baseBpm || !candidateBpm) return { value: null };
  const closeness = (tempo: number) => Math.max(0, 1 - Math.abs(tempo - baseBpm) / baseBpm);
  let value = closeness(candidateBpm);
  let multiple = "";
  if (halfDouble) {
    for (const [factor, label] of [
      [2, " (×2)"],
      [0.5, " (×½)"],
    ] as const) {
      const scaled = closeness(candidateBpm * factor);
      if (scaled > value) {
        value = scaled;
        multiple = label;
      }
    }
  }
  return { value, detail: `${baseBpm} → ${candidateBpm}${multiple}` };
}

function genreOverlap({ seed, candidate, genreContext }: SignalInput): SignalValue {
  const seedGenres = seed.genres ?? [];
  const candidateGenres = candidate.genres ?? [];
  if (seedGenres.length === 0 || candidateGenres.length === 0) return { value: null };
  return { value: calculateGenreOverlap(seedGenres, candidateGenres, genreContext) };
}

function era({ seed, candidate }: SignalInput): SignalValue {
  const a = seed.eraBucket;
  const b = candidate.eraBucket;
  if (!a || !b) return { value: null };
  if (a === b) return { value: 1, detail: "same" };
  if (areErasAdjacent(a, b)) return { value: 0.5, detail: "adjacent" };
  return { value: 0, detail: "apart" };
}

function closeness(a: number | null | undefined, b: number | null | undefined): SignalValue {
  if (a === null || a === undefined || b === null || b === undefined) return { value: null };
  return { value: Math.min(1, Math.max(0, 1 - Math.abs(a - b))) };
}

function similarity(value: number | null | undefined): SignalValue {
  return { value: value ?? null };
}

/** The candidate's own star rating out of 5; unrated (0 or null) is null. */
function rating({ candidate }: SignalInput): SignalValue {
  const stars = candidate.rating;
  if (!stars || stars <= 0) return { value: null };
  return { value: Math.min(1, stars / 5) };
}

/** In summation order. Exhaustive over `RankingSignalId`. */
export const SIGNAL_REGISTRY: readonly SignalDefinition[] = [
  {
    id: "identity_similarity",
    label: "Identity",
    compute: ({ candidate }) => similarity(candidate.identity),
    scale: "pool",
  },
  {
    id: "vibe_similarity",
    label: "Vibe",
    compute: ({ candidate }) => similarity(candidate.vibe),
    scale: "pool",
  },
  { id: "key_relation", label: "Key", compute: keyRelation },
  { id: "bpm_distance", label: "BPM", compute: bpmDistance },
  { id: "genre_overlap", label: "Genre", compute: genreOverlap },
  { id: "era", label: "Era", compute: era },
  {
    id: "energy",
    label: "Energy",
    compute: ({ seed, candidate }) => closeness(seed.energy, candidate.energy),
  },
  {
    id: "danceability",
    label: "Danceability",
    compute: ({ seed, candidate }) => closeness(seed.danceability, candidate.danceability),
  },
  { id: "rating", label: "Rating", compute: rating },
];

/**
 * Every signal's value for one candidate, computed once. Raw: the similarity
 * signals are as retrieved here; `computePoolSignals` normalises them.
 */
export function computeSignals(
  seed: RankingTrack,
  candidate: RankingCandidate,
  genreContext: GenreOverlapContext = EMPTY_GENRE_OVERLAP_CONTEXT,
  options: SignalOptions = {},
): Record<RankingSignalId, SignalValue> {
  const input = { seed, candidate, genreContext, halfDouble: options.halfDouble };
  return Object.fromEntries(
    SIGNAL_REGISTRY.map((signal) => [signal.id, signal.compute(input)]),
  ) as SignalValues;
}

export type SignalValues = Record<RankingSignalId, SignalValue>;

/**
 * Rank-normalise a pool's raw values (#1218): each value becomes the share of
 * the pool's *other* values it is at least as high as, so the pool spans
 * [0, 1] evenly whatever the raw scale. The best is 1 and the worst 0; tied
 * values share the higher rank (all equal, or a pool of one, is 1, as each
 * is as close as any); null stays null and isn't counted.
 *
 * Why ranks and not min–max: retrieval similarities (`1 − d/2` of cosine
 * distance) bunch within ~0.006 with long tails, so min–max lets one
 * outlier (a near-duplicate pressing, a stray far track) squeeze the rest
 * into a sliver, and its spread varies by seed. Ranks give every seed's pool
 * the same even spread, so a weight of 1 means "best to worst in the pool",
 * as on the [0, 1] signals beside it. The #1218 eval compares the two.
 */
export function poolRank(values: readonly (number | null)[]): (number | null)[] {
  const present = values
    .map((value, index) => ({ value, index }))
    .filter((entry): entry is { value: number; index: number } => entry.value !== null)
    .sort((a, b) => a.value - b.value);
  const out: (number | null)[] = values.map(() => null);
  const others = present.length - 1;
  let end = present.length - 1;
  // Walk from the top so a tie group knows its last (highest) position.
  for (let i = present.length - 1; i >= 0; i -= 1) {
    if (i < present.length - 1 && present[i].value !== present[i + 1].value) end = i;
    out[present[i].index] = others === 0 ? 1 : end / others;
  }
  return out;
}

const POOL_SIGNALS = SIGNAL_REGISTRY.filter((signal) => signal.scale === "pool").map(
  (signal) => signal.id,
);

/**
 * Every candidate's signals, with the pool-scaled ones normalised across
 * these candidates: once per request, over every candidate scored together
 * (before constraints, so a filter toggle never rescales the rest). The raw
 * value is kept as the detail.
 */
export function computePoolSignals(
  seed: RankingTrack,
  candidates: readonly RankingCandidate[],
  genreContext: GenreOverlapContext = EMPTY_GENRE_OVERLAP_CONTEXT,
  options: SignalOptions = {},
): SignalValues[] {
  const all = candidates.map((candidate) => computeSignals(seed, candidate, genreContext, options));
  for (const id of POOL_SIGNALS) {
    const ranked = poolRank(all.map((signals) => signals[id].value));
    all.forEach((signals, index) => {
      const raw = signals[id].value;
      signals[id] =
        raw === null ? { value: null } : { value: ranked[index], detail: `raw ${raw.toFixed(4)}` };
    });
  }
  return all;
}

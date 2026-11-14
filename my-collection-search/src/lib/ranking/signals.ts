/**
 * The signal registry (#1191): every signal the ranker computes, once per
 * candidate, normalised to [0, 1] (higher is a closer match) or null when
 * either side lacks the data. Profiles (#1192) key their weights on the ids
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
};

export type SignalDefinition = {
  id: RankingSignalId;
  /** Short label for a "why" line or a profile editor's slider. */
  label: string;
  compute: (input: SignalInput) => SignalValue;
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

/** 1 at the same tempo, falling linearly with the relative difference, 0 at double. */
function bpmDistance({ seed, candidate }: SignalInput): SignalValue {
  const baseBpm = parseBpm(seed.bpm);
  const candidateBpm = parseBpm(candidate.bpm);
  if (!baseBpm || !candidateBpm) return { value: null };
  return {
    value: Math.max(0, 1 - Math.abs(candidateBpm - baseBpm) / baseBpm),
    detail: `${baseBpm} → ${candidateBpm}`,
  };
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
  },
  { id: "vibe_similarity", label: "Vibe", compute: ({ candidate }) => similarity(candidate.vibe) },
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

/** Every signal's value for one candidate, computed once. */
export function computeSignals(
  seed: RankingTrack,
  candidate: RankingCandidate,
  genreContext: GenreOverlapContext = EMPTY_GENRE_OVERLAP_CONTEXT,
): Record<RankingSignalId, SignalValue> {
  const input = { seed, candidate, genreContext };
  return Object.fromEntries(
    SIGNAL_REGISTRY.map((signal) => [signal.id, signal.compute(input)]),
  ) as Record<RankingSignalId, SignalValue>;
}

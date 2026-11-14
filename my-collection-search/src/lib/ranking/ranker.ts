/**
 * The one ranker (#1191). Pure, so the server (recommendation breakdowns) and
 * the browser (suggestion panels) rank with the same code and config.
 *
 *   score = (prior ?? best weighted base signal) + Σ weight × value
 *
 * over the other signals, in registry order. Hard constraints never change a
 * score; they mark the candidate failed and say which.
 */
import type {
  CandidateRanking,
  RankingConfig,
  RankingConstraintId,
  RankingSignalBreakdown,
  RankingSignalId,
  RankingSurface,
} from "@groovenet/contracts";
import { camelotDistance } from "@/lib/playlistOrder";
import { camelotOf, parseBpm } from "@/lib/mixCompat";
import {
  calculateCamelotDistance,
  EMPTY_GENRE_OVERLAP_CONTEXT,
  type GenreOverlapContext,
} from "@/lib/recommendation-pre-scorer";
import type { RankingCandidate, RankingTrack } from "./features";
import { computeSignals, SIGNAL_REGISTRY, type SignalValue } from "./signals";

/** A single track, or a playlist ranked against its last track. */
export type RankingSeed = { track: RankingTrack } | { playlist: RankingTrack[] };

export type RankingContext = {
  surface: RankingSurface;
  /** Whose library is being ranked for; profiles are per friend (#1192). */
  friendId?: number | null;
  /** The genre similarity table and taxonomy, loaded once per request. Omitted: exact and parent/child genre matches only. */
  genreContext?: GenreOverlapContext;
};

export type RankInput = {
  seed: RankingSeed;
  candidates: RankingCandidate[];
  context: RankingContext;
  config: RankingConfig;
};

/** The contract every ranker meets, built-in or (later, #1197) a sandboxed plugin. */
export interface Ranker {
  /** One result per candidate, in input order. */
  rank(input: RankInput): CandidateRanking[];
}

/** The track a seed is scored against; null for an empty playlist. */
export function resolveSeed(seed: RankingSeed): RankingTrack | null {
  return "track" in seed ? seed.track : (seed.playlist.at(-1) ?? null);
}

function failedConstraints(
  config: RankingConfig,
  seed: RankingTrack,
  candidate: RankingCandidate,
  signals: Record<RankingSignalId, SignalValue>,
): RankingConstraintId[] {
  const failed: RankingConstraintId[] = [];
  const { bpm_window, key_rule, genre_floor } = config.constraints;

  if (bpm_window) {
    const baseBpm = parseBpm(seed.bpm);
    const candidateBpm = parseBpm(candidate.bpm);
    if (baseBpm !== null && candidateBpm !== null) {
      const delta = Math.abs(candidateBpm - baseBpm);
      const distance = bpm_window.unit === "ratio" ? delta / baseBpm : delta;
      if (distance > bpm_window.max) failed.push("bpm_window");
    }
  }

  if (key_rule) {
    let distance: number | null = null;
    if (key_rule.metric === "wheel") {
      const a = camelotOf(seed.key);
      const b = camelotOf(candidate.key);
      if (a && b) distance = camelotDistance(a, b);
    } else {
      distance = calculateCamelotDistance(seed.key ?? null, candidate.key ?? null);
    }
    if (distance !== null && distance > key_rule.max) failed.push("key_rule");
  }

  // No genres on either side is no overlap: the floor rejects it.
  if (genre_floor && (signals.genre_overlap.value ?? 0) < genre_floor.min) {
    failed.push("genre_floor");
  }

  return failed;
}

/** Score one candidate against a resolved seed. */
export function scoreCandidate(
  seed: RankingTrack,
  candidate: RankingCandidate,
  config: RankingConfig,
  genreContext: GenreOverlapContext = EMPTY_GENRE_OVERLAP_CONTEXT,
): CandidateRanking {
  const signals = computeSignals(seed, candidate, genreContext);
  const weightOf = (id: RankingSignalId) => config.weights[id] ?? 0;
  const baseIds = new Set(config.base?.signals ?? []);
  const prior = config.usePrior ? (candidate.prior ?? null) : null;

  // The base: a prior when there is one, else the best weighted base signal.
  let winner: RankingSignalId | null = null;
  let baseValue = 0;
  if (prior === null) {
    for (const id of config.base?.signals ?? []) {
      const weighted = weightOf(id) * (signals[id].value ?? 0);
      if (winner === null || weighted > baseValue) {
        winner = id;
        baseValue = weighted;
      }
    }
  }

  let score = prior ?? baseValue;
  const breakdown: Partial<Record<RankingSignalId, RankingSignalBreakdown>> = {};
  for (const { id } of SIGNAL_REGISTRY) {
    const { value, detail } = signals[id];
    const weight = weightOf(id);
    let contribution = 0;
    if (baseIds.has(id)) {
      if (id === winner) contribution = baseValue;
    } else if (weight !== 0 && value !== null) {
      contribution = weight * value;
      score += contribution;
    }
    breakdown[id] = { value, weight, contribution, ...(detail ? { detail } : {}) };
  }

  const failed = failedConstraints(config, seed, candidate, signals);
  return { score, passed: failed.length === 0, failed, prior, signals: breakdown };
}

export const defaultRanker: Ranker = {
  rank({ seed, candidates, context, config }) {
    const resolved = resolveSeed(seed) ?? {};
    return candidates.map((candidate) =>
      scoreCandidate(resolved, candidate, config, context.genreContext),
    );
  },
};

/** Candidates that passed, best first; ties keep input order. */
export function orderByRanking<T>(items: T[], rankings: CandidateRanking[]): T[] {
  return items
    .map((item, index) => ({ item, ranking: rankings[index] }))
    .filter(({ ranking }) => ranking.passed)
    .sort((a, b) => b.ranking.score - a.ranking.score)
    .map(({ item }) => item);
}

/**
 * The profile editor's pure parts (#1192): which sliders it draws, how a
 * constraint control writes back into a draft, and how a breakdown reads as a
 * "why" line. Kept apart from the component so each rule is tested on its own.
 */
import {
  keyRuleForMode,
  type CandidateRanking,
  type KeyRuleMode,
  type RankingConstraintId,
  type RankingProfileDraft,
  type RankingSignalId,
  type RecommendationsResponse,
} from "@groovenet/contracts";
import { SIGNAL_REGISTRY } from "./signals";

/** A slider per signal. Tempo's signal barely moves inside a window, so it gets more range. */
export const WEIGHT_SLIDERS: Array<{ id: RankingSignalId; label: string; max: number }> =
  SIGNAL_REGISTRY.map(({ id, label }) => ({ id, label, max: id === "bpm_distance" ? 5 : 2 }));

export const WEIGHT_STEP = 0.01;

type Constraints = RankingProfileDraft["constraints"];

export function withWeight(
  draft: RankingProfileDraft,
  id: RankingSignalId,
  weight: number,
): RankingProfileDraft {
  const weights = { ...draft.weights };
  if (weight === 0) delete weights[id];
  else weights[id] = Math.round(weight * 1000) / 1000;
  return { ...draft, weights };
}

export function withConstraint<K extends keyof Constraints>(
  draft: RankingProfileDraft,
  id: K,
  value: Constraints[K] | null,
): RankingProfileDraft {
  return { ...draft, constraints: { ...draft.constraints, [id]: value } };
}

export function withKeyRule(draft: RankingProfileDraft, mode: KeyRuleMode): RankingProfileDraft {
  return withConstraint(draft, "key_rule", keyRuleForMode(mode));
}

/** What a switched-on constraint starts as. */
export const CONSTRAINT_DEFAULTS = {
  bpm_window: { unit: "ratio" as const, max: 0.06 },
  genre_floor: { min: 0.05 },
  energy_range: { max_drop: 0.2, max_rise: 0.2 },
};

export const CONSTRAINT_FAILURE_LABELS: Record<RankingConstraintId, string> = {
  bpm_window: "Outside BPM window",
  key_rule: "Key clash",
  genre_floor: "Genre too far",
  energy_range: "Energy out of range",
};

const LABELS = new Map(SIGNAL_REGISTRY.map(({ id, label }) => [id, label]));
/** Similarity is the base a candidate starts from; every other signal is a boost. */
const SIMILARITY = new Set(["identity_similarity", "vibe_similarity"]);
const signed = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}`;

/**
 * The biggest contributions, largest first: "Vibe 0.71 · BPM +0.12 · Key
 * +0.08". Similarity reads as a plain number, the rest as boosts.
 */
export function whyLine(ranking: CandidateRanking, limit = 3): string {
  return Object.entries(ranking.signals)
    .filter(([, signal]) => signal && signal.contribution !== 0)
    .sort(([, a], [, b]) => Math.abs(b!.contribution) - Math.abs(a!.contribution))
    .slice(0, limit)
    .map(([id, signal]) => {
      const label = LABELS.get(id as RankingSignalId) ?? id;
      const value = signal!.contribution;
      return `${label} ${SIMILARITY.has(id) ? value.toFixed(2) : signed(value)}`;
    })
    .join(" · ");
}

export type PreviewRow = {
  key: string;
  title: string;
  artist: string;
  score: number;
  passed: boolean;
  failed: string[];
  why: string;
};

/**
 * A breakdown response as the preview lists it: passing candidates best
 * first, then the rest. The seed itself is never a suggestion for itself.
 */
export function previewRows(response: RecommendationsResponse, limit = 10): PreviewRow[] {
  return response.candidates
    .filter(
      (candidate) =>
        candidate.ranking &&
        !(
          candidate.trackId === response.seedTrackId && candidate.friendId === response.seedFriendId
        ),
    )
    .map((candidate) => {
      const ranking = candidate.ranking!;
      const metadata = candidate.metadata as { title?: unknown; artist?: unknown };
      return {
        key: `${candidate.trackId}:${candidate.friendId}`,
        title: typeof metadata.title === "string" ? metadata.title : candidate.trackId,
        artist: typeof metadata.artist === "string" ? metadata.artist : "",
        score: ranking.score,
        passed: ranking.passed,
        failed: ranking.failed.map((id) => CONSTRAINT_FAILURE_LABELS[id]),
        why: whyLine(ranking),
      };
    })
    .sort((a, b) => Number(b.passed) - Number(a.passed) || b.score - a.score)
    .slice(0, limit);
}

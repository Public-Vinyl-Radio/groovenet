/**
 * Playlist ordering by ranking profile (#1193, epic #1190). ga-service knows
 * nothing about profiles: the app resolves the library's `playlists` profile
 * and sends ga-service this translation of it, as `ranking` on `/optimize`.
 * Pure, so profile evaluation (#1196) can translate a profile the same way.
 *
 * The optimiser scores a transition A → B from its own terms, each in [0, 1]:
 *
 * | ga-service term | from the profile's weights                                  |
 * | --------------- | ----------------------------------------------------------- |
 * | `embedding`     | `vibe_similarity` and `identity_similarity` (one vector, audio_vibe): the larger of the two when both are `max` base signals, otherwise their sum |
 * | `metadata`      | `genre_overlap`                                             |
 * | `energy`        | `energy` + `danceability` (ga-service's energy blends both) |
 * | `bpm`           | `bpm_distance`                                              |
 * | `key`           | `key_relation`                                              |
 *
 * `era` and `rating` describe a track, not a transition, so they have no term.
 * Negative weights count as 0: a profile can ignore a term, not ask for clashes.
 * The weights are then scaled so they add up to the optimiser's own total
 * (0.93), which keeps them in balance with the parts of cohesive_blocks'
 * score that no profile weighs (the energy arc, the repeat penalty). The
 * same-artist and same-album penalties aren't ranker signals and keep their
 * values.
 *
 * Constraints can't drop a track from a playlist, so in ordering they are
 * penalties: each one a transition fails (B against A, A as the seed) costs
 * `CONSTRAINT_PENALTY`, more than the best transition can earn, so the
 * optimiser avoids a failing transition wherever the tracks allow. The BPM
 * window (with half/double time), the key rule and the energy range carry
 * over; `genre_floor` doesn't, because ga-service's genre term is a token
 * overlap, not the ranker's taxonomy overlap, so the floor's scale has no
 * meaning there. ga-service's energy range is on its own energy scale
 * (danceability and mood), which is close to but not the ranker's.
 *
 * Default orders as it always has: `optimizerRankingFor` sends no `ranking`
 * for it, so the request is byte for byte the one from before profiles.
 */
import { z } from "zod";
import {
  bpmWindowSchema,
  energyRangeSchema,
  keyRuleSchema,
  type RankingConfig,
  type RankingSignalId,
} from "@groovenet/contracts";

export const OPTIMIZER_RANKING_VERSION = 1;

/** ga-service's constants, which every request without `ranking` scores with. */
export const LEGACY_TRANSITION_WEIGHTS = {
  metadata: 0.36,
  embedding: 0.24,
  energy: 0.2,
  bpm: 0.08,
  key: 0.05,
  same_artist: 0.2,
  same_album: 0.12,
} as const;

/** What one failed constraint costs a transition: more than the best transition earns. */
export const CONSTRAINT_PENALTY = 1;

const weight = z.number().finite().min(0).max(10);

/** The `ranking` ga-service accepts; its pydantic model has the same bounds and is as strict. */
export const optimizerRankingSchema = z
  .object({
    version: z.literal(OPTIMIZER_RANKING_VERSION),
    weights: z
      .object({
        metadata: weight,
        embedding: weight,
        energy: weight,
        bpm: weight,
        key: weight,
        same_artist: weight,
        same_album: weight,
      })
      .strict(),
    constraints: z
      .object({
        bpm_window: bpmWindowSchema.nullable(),
        key_rule: keyRuleSchema.nullable(),
        energy_range: energyRangeSchema.nullable(),
      })
      .strict(),
    constraint_penalty: z.number().finite().min(0).max(10),
  })
  .strict();
export type OptimizerRanking = z.infer<typeof optimizerRankingSchema>;

type TermWeights = Omit<OptimizerRanking["weights"], "same_artist" | "same_album">;

const POSITIVE_TOTAL =
  LEGACY_TRANSITION_WEIGHTS.metadata +
  LEGACY_TRANSITION_WEIGHTS.embedding +
  LEGACY_TRANSITION_WEIGHTS.energy +
  LEGACY_TRANSITION_WEIGHTS.bpm +
  LEGACY_TRANSITION_WEIGHTS.key;

/** The embedding term's weight: vibe and identity share ga-service's one vector. */
function embeddingWeight(config: RankingConfig, w: (id: RankingSignalId) => number): number {
  const similarity: RankingSignalId[] = ["identity_similarity", "vibe_similarity"];
  const maxBase = config.base?.combine === "max" ? config.base.signals : [];
  const inBase = similarity.filter((id) => maxBase.includes(id));
  const added = similarity.filter((id) => !maxBase.includes(id));
  const base = inBase.length > 0 ? Math.max(...inBase.map(w)) : 0;
  return base + added.reduce((sum, id) => sum + w(id), 0);
}

/** A ranking config as ga-service's transition weights and constraints. */
export function toOptimizerRanking(config: RankingConfig): OptimizerRanking {
  const w = (id: RankingSignalId) => Math.max(0, config.weights[id] ?? 0);
  const raw: TermWeights = {
    metadata: w("genre_overlap"),
    embedding: embeddingWeight(config, w),
    energy: w("energy") + w("danceability"),
    bpm: w("bpm_distance"),
    key: w("key_relation"),
  };
  const total = raw.metadata + raw.embedding + raw.energy + raw.bpm + raw.key;
  const scale = total > 0 ? POSITIVE_TOTAL / total : 0;
  const { bpm_window, key_rule, energy_range } = config.constraints;
  return {
    version: OPTIMIZER_RANKING_VERSION,
    weights: {
      metadata: raw.metadata * scale,
      embedding: raw.embedding * scale,
      energy: raw.energy * scale,
      bpm: raw.bpm * scale,
      key: raw.key * scale,
      same_artist: LEGACY_TRANSITION_WEIGHTS.same_artist,
      same_album: LEGACY_TRANSITION_WEIGHTS.same_album,
    },
    constraints: {
      bpm_window: bpm_window ?? null,
      key_rule: key_rule ?? null,
      energy_range: energy_range ?? null,
    },
    constraint_penalty: CONSTRAINT_PENALTY,
  };
}

/**
 * The `ranking` to send for a resolved ranker (`id` is what it answers to: a
 * preset, a built-in config or a stored id): none for Default, or for a
 * profile that fell back to it, so Default's request is today's request.
 */
export function optimizerRankingFor(ranker: {
  id: string;
  config: RankingConfig;
  fallback: boolean;
}): OptimizerRanking | null {
  if (ranker.fallback || ranker.id === "default") return null;
  return toOptimizerRanking(ranker.config);
}

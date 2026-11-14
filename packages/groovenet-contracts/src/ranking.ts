import { z } from "zod";

// The ranker contract (#1191, epic #1190): a seed plus candidates in, a score
// per candidate out, with pass/fail on the hard constraints and what each
// signal contributed. Ranking profiles (#1192) are `RankingConfig`s stored and
// edited per friend; ga-service (#1193), search (#1194), sharing (#1195),
// evaluation (#1196) and plugins (#1197) read and write the same shapes.

/**
 * Every signal the ranker computes, by stable id. Profiles key their weights
 * on these, so an id is never renamed or reused; a new signal gets a new id.
 * Each value is normalised to [0, 1], higher meaning a closer match, or null
 * when either side lacks the data.
 */
export const RANKING_SIGNAL_IDS = [
  "identity_similarity",
  "vibe_similarity",
  "key_relation",
  "bpm_distance",
  "genre_overlap",
  "era",
  "energy",
  "danceability",
  "rating",
] as const;
export const rankingSignalIdSchema = z.enum(RANKING_SIGNAL_IDS);
export type RankingSignalId = z.infer<typeof rankingSignalIdSchema>;

/** Hard constraints, by stable id; a candidate that fails any is reported with which. */
export const RANKING_CONSTRAINT_IDS = ["bpm_window", "key_rule", "genre_floor"] as const;
export const rankingConstraintIdSchema = z.enum(RANKING_CONSTRAINT_IDS);
export type RankingConstraintId = z.infer<typeof rankingConstraintIdSchema>;

/** Where a ranking is shown. A profile can be chosen per surface (#1192). */
export const RANKING_SURFACES = ["suggestions", "related", "recommendations"] as const;
export const rankingSurfaceSchema = z.enum(RANKING_SURFACES);
export type RankingSurface = z.infer<typeof rankingSurfaceSchema>;

/** The built-in configs: today's behaviour, and the pre-scorer's three modes. */
export const RANKING_CONFIG_IDS = ["default", "blend", "mixable", "strict"] as const;
export const rankingConfigIdSchema = z.enum(RANKING_CONFIG_IDS);
export type RankingConfigId = z.infer<typeof rankingConfigIdSchema>;

const weight = z.number().finite().min(-10).max(10);

export const rankingConfigSchema = z
  .object({
    /** Schema version, for migrating stored and imported profiles. */
    version: z.literal(1),
    id: z.string().min(1).max(64),
    /**
     * Per-signal weights. A signal's contribution is `weight × value`; an
     * omitted signal weighs 0 and contributes nothing.
     */
    weights: z.partialRecord(rankingSignalIdSchema, weight),
    /**
     * Signals that form the base score by their best weighted value rather
     * than adding up (today: the better of identity and vibe similarity).
     * Omitted or empty, every weighted signal adds.
     */
    base: z
      .object({
        combine: z.literal("max"),
        signals: z.array(rankingSignalIdSchema).max(RANKING_SIGNAL_IDS.length),
      })
      .optional(),
    /**
     * When a candidate arrives with a precomputed score (a blended source or a
     * semantic search score), it replaces the base signals' contribution.
     */
    usePrior: z.boolean().default(false),
    constraints: z
      .object({
        /** Reject when both tempos are known and further apart than `max`. */
        bpm_window: z
          .object({
            unit: z.enum(["ratio", "bpm"]),
            max: z.number().finite().min(0).max(1000),
          })
          .nullable()
          .optional(),
        /**
         * Reject when both keys are known and further apart than `max`.
         * `wheel` counts steps round the Camelot wheel, relative major/minor
         * as one (same = 0, adjacent = 1); `camelot` is the pre-scorer's
         * distance, relative major/minor 0.5 and a mode change +0.5.
         */
        key_rule: z
          .object({
            metric: z.enum(["wheel", "camelot"]),
            max: z.number().finite().min(0).max(12),
          })
          .nullable()
          .optional(),
        /** Reject when genre overlap is below `min`, including tracks with no genres. */
        genre_floor: z
          .object({ min: z.number().finite().min(0).max(1) })
          .nullable()
          .optional(),
      })
      .default({}),
  })
  .strict();
export type RankingConfig = z.infer<typeof rankingConfigSchema>;
export type RankingConfigInput = z.input<typeof rankingConfigSchema>;

export const rankingSignalBreakdownSchema = z.object({
  /** Normalised to [0, 1]; null when either side lacks the data. */
  value: z.number().nullable(),
  weight: z.number(),
  /** What it added to the score: `weight × value`, or 0 for a base signal that didn't win. */
  contribution: z.number(),
  /** The raw relation behind a categorical value, e.g. `same` for a key. */
  detail: z.string().optional(),
});
export type RankingSignalBreakdown = z.infer<typeof rankingSignalBreakdownSchema>;

export const candidateRankingSchema = z.object({
  /** `prior` (when used) plus every signal's contribution. */
  score: z.number(),
  /** False when any hard constraint failed; the candidate is still scored. */
  passed: z.boolean(),
  failed: z.array(rankingConstraintIdSchema),
  /** The precomputed score that stood in for the base signals, when there was one. */
  prior: z.number().nullable(),
  signals: z.partialRecord(rankingSignalIdSchema, rankingSignalBreakdownSchema),
});
export type CandidateRanking = z.infer<typeof candidateRankingSchema>;

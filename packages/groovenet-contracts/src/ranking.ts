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
export const RANKING_CONSTRAINT_IDS = [
  "bpm_window",
  "key_rule",
  "genre_floor",
  "energy_range",
] as const;
export const rankingConstraintIdSchema = z.enum(RANKING_CONSTRAINT_IDS);
export type RankingConstraintId = z.infer<typeof rankingConstraintIdSchema>;

/**
 * Where a ranking is used. A profile can be chosen per surface (#1192);
 * `playlists` is the order the playlist optimiser builds (#1193).
 */
export const RANKING_SURFACES = ["suggestions", "related", "recommendations", "playlists"] as const;
export const rankingSurfaceSchema = z.enum(RANKING_SURFACES);
export type RankingSurface = z.infer<typeof rankingSurfaceSchema>;

/** The built-in configs: today's behaviour, and the pre-scorer's three modes. */
export const RANKING_CONFIG_IDS = ["default", "blend", "mixable", "strict"] as const;
export const rankingConfigIdSchema = z.enum(RANKING_CONFIG_IDS);
export type RankingConfigId = z.infer<typeof rankingConfigIdSchema>;

const weight = z.number().finite().min(-10).max(10);

export const bpmWindowSchema = z
  .object({
    unit: z.enum(["ratio", "bpm"]),
    max: z.number().finite().min(0).max(1000),
    /**
     * Also accept the candidate at half or double the seed's tempo (a 62 or
     * 248 BPM track against 124). Omitted or false: no such rule (today).
     * Only the window reads it; the `bpm_distance` signal is unchanged.
     */
    half_double: z.boolean().optional(),
  })
  .strict();
export type BpmWindow = z.infer<typeof bpmWindowSchema>;

export const keyRuleSchema = z
  .object({
    metric: z.enum(["wheel", "camelot"]),
    max: z.number().finite().min(0).max(12),
  })
  .strict();
export type KeyRule = z.infer<typeof keyRuleSchema>;

export const genreFloorSchema = z.object({ min: z.number().finite().min(0).max(1) }).strict();

/**
 * How far the candidate's energy may sit from the seed's, each way, on the
 * `energy` signal's 0-1 scale. Unknown energy on either side passes.
 */
export const energyRangeSchema = z
  .object({
    max_drop: z.number().finite().min(0).max(1),
    max_rise: z.number().finite().min(0).max(1),
  })
  .strict();
export type EnergyRange = z.infer<typeof energyRangeSchema>;

export const rankingConstraintsSchema = z
  .object({
    /** Reject when both tempos are known and further apart than `max`. */
    bpm_window: bpmWindowSchema.nullable().optional(),
    /**
     * Reject when both keys are known and further apart than `max`. A key
     * that is missing or not recognised on either side passes, under both
     * metrics. Keys are read case-insensitively with enharmonic spellings
     * (`C major`, `F# minor`, `Db major` = 3B).
     * `wheel` counts steps round the Camelot wheel, relative major/minor
     * as one (same = 0, adjacent = 1); `camelot` is the pre-scorer's
     * distance, relative major/minor 0.5 and a mode change +0.5.
     * `keyRuleForMode` builds the `same | adjacent | any` rules.
     */
    key_rule: keyRuleSchema.nullable().optional(),
    /** Reject when genre overlap is below `min`, including tracks with no genres. */
    genre_floor: genreFloorSchema.nullable().optional(),
    /** Reject when both energies are known and the candidate's is outside the range. */
    energy_range: energyRangeSchema.nullable().optional(),
  })
  .strict();
export type RankingConstraints = z.infer<typeof rankingConstraintsSchema>;

const rankingConfigShape = {
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
    .strict()
    .optional(),
  /**
   * When a candidate arrives with a precomputed score (a blended source or a
   * semantic search score), it replaces the base signals' contribution.
   */
  usePrior: z.boolean().default(false),
  constraints: rankingConstraintsSchema.default({}),
};

export const rankingConfigSchema = z.object(rankingConfigShape).strict();
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

/**
 * The profile a ranked result came from, as a response reports it. `fallback`
 * means the profile asked for couldn't be used, so Default stood in.
 */
export const rankingAppliedSchema = z.object({
  id: z.string(),
  name: z.string(),
  fallback: z.boolean(),
});
export type RankingApplied = z.infer<typeof rankingAppliedSchema>;

// ─── Key rule sugar ──────────────────────────────────────────────────────────

/** The key rules a profile editor offers, as `key_rule` data: no second mechanism. */
export const KEY_RULE_MODES = ["same", "adjacent", "any"] as const;
export const keyRuleModeSchema = z.enum(KEY_RULE_MODES);
export type KeyRuleMode = z.infer<typeof keyRuleModeSchema>;

/** `same` is wheel ≤ 0, `adjacent` wheel ≤ 1, `any` no key rule. */
export function keyRuleForMode(mode: KeyRuleMode): KeyRule | null {
  if (mode === "same") return { metric: "wheel", max: 0 };
  if (mode === "adjacent") return { metric: "wheel", max: 1 };
  return null;
}

/** The mode a key rule reads as; a rule no mode builds (camelot ≤ 2) is `custom`. */
export function keyRuleMode(rule: KeyRule | null | undefined): KeyRuleMode | "custom" {
  if (!rule) return "any";
  if (rule.metric === "wheel" && rule.max === 0) return "same";
  if (rule.metric === "wheel" && rule.max === 1) return "adjacent";
  return "custom";
}

// ─── Profiles (#1192) ────────────────────────────────────────────────────────

/** Built in, read-only and copyable. `default` is `DEFAULT_RANKING_CONFIG` unchanged. */
export const RANKING_PRESET_IDS = ["default", "beatmatcher", "selector"] as const;
export const rankingPresetIdSchema = z.enum(RANKING_PRESET_IDS);
export type RankingPresetId = z.infer<typeof rankingPresetIdSchema>;

export const RANKING_PROFILE_KINDS = ["preset", "custom"] as const;
export const rankingProfileKindSchema = z.enum(RANKING_PROFILE_KINDS);
export type RankingProfileKind = z.infer<typeof rankingProfileKindSchema>;

/** A friend may store this many profiles; presets don't count. */
export const MAX_RANKING_PROFILES_PER_FRIEND = 50;

/** A stored profile's id: its database id, as a decimal string within int4. */
export const storedRankingProfileIdSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,9}$/)
  .refine((value) => Number(value) <= 2147483647, "Profile id out of range");

/**
 * Anything that names a ranking: a preset, a built-in config (`blend`,
 * `mixable`, `strict`) or a stored profile's id.
 */
export const rankingRefSchema = z.union([
  rankingPresetIdSchema,
  rankingConfigIdSchema,
  storedRankingProfileIdSchema,
]);
export type RankingRef = z.infer<typeof rankingRefSchema>;

const uniqueSurfaces = (surfaces: readonly string[]) => new Set(surfaces).size === surfaces.length;

/** What a profile adds to a config: who it's for, and where it can be chosen. */
const rankingProfileMeta = {
  author: z.string().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(""),
  /** The surfaces it can be chosen for. */
  surfaces: z
    .array(rankingSurfaceSchema)
    .min(1)
    .max(RANKING_SURFACES.length)
    .refine(uniqueSurfaces, "Surfaces must be unique"),
};

/**
 * A ranking profile: a `RankingConfig` plus its name, description, surfaces
 * and kind. The one definition for the API, storage and (#1195) import. A
 * profile is itself a valid ranker input; `toRankingConfig` drops the rest.
 */
export const rankingProfileSchema = z
  .object({
    ...rankingConfigShape,
    id: z.union([rankingPresetIdSchema, storedRankingProfileIdSchema]),
    ...rankingProfileMeta,
    kind: rankingProfileKindSchema,
  })
  .strict();
export type RankingProfile = z.infer<typeof rankingProfileSchema>;
export type RankingProfileInput = z.input<typeof rankingProfileSchema>;

/** A profile as a client writes it: everything but the id and kind the server assigns. */
export const rankingProfileDraftSchema = rankingProfileSchema.omit({ id: true, kind: true });
export type RankingProfileDraft = z.infer<typeof rankingProfileDraftSchema>;
export type RankingProfileDraftInput = z.input<typeof rankingProfileDraftSchema>;

/** The ranker config inside a profile. */
export function toRankingConfig(profile: RankingProfile): RankingConfig {
  const { version, id, weights, base, usePrior, constraints } = profile;
  return { version, id, weights, ...(base ? { base } : {}), usePrior, constraints };
}

/**
 * A listed profile. `invalid` marks a stored profile that no longer parses
 * (a schema change, a hand-edited row): it is shown with Default's config
 * and ranks as Default until it is saved again or deleted.
 */
export const rankingProfileEntrySchema = rankingProfileSchema
  .extend({
    invalid: z.boolean().optional(),
    origin: z.enum(["file", "friend"]).optional(),
    source_handle: z.string().max(64).optional(),
  })
  .strict();
export type RankingProfileEntry = z.infer<typeof rankingProfileEntrySchema>;

/** The profile id chosen for each surface; `default` where nothing was chosen. */
export const rankingActiveProfilesSchema = z
  .object({
    suggestions: z.string(),
    related: z.string(),
    recommendations: z.string(),
    playlists: z.string(),
  })
  .strict();
export type RankingActiveProfiles = z.infer<typeof rankingActiveProfilesSchema>;

export const rankingProfilesQuerySchema = z.object({ friend_id: z.number().int() });

export const rankingProfilesResponseSchema = z.object({
  friend_id: z.number().int(),
  /** Presets first, then the friend's stored profiles, oldest first. */
  profiles: z.array(rankingProfileEntrySchema),
  active: rankingActiveProfilesSchema,
});
export type RankingProfilesResponse = z.infer<typeof rankingProfilesResponseSchema>;

export const rankingProfileCreateSchema = z
  .object({ friend_id: z.number().int(), profile: rankingProfileDraftSchema })
  .strict();
export type RankingProfileCreate = z.input<typeof rankingProfileCreateSchema>;

export const rankingProfileUpdateSchema = z.object({ profile: rankingProfileDraftSchema }).strict();
export type RankingProfileUpdate = z.input<typeof rankingProfileUpdateSchema>;

export const rankingProfileCopySchema = z
  .object({
    friend_id: z.number().int(),
    /** Omitted: "<name> copy". */
    name: rankingProfileMeta.name.optional(),
  })
  .strict();
export type RankingProfileCopy = z.input<typeof rankingProfileCopySchema>;

export const rankingActiveUpdateSchema = z
  .object({
    friend_id: z.number().int(),
    /** A preset id or a stored profile's id. */
    profile_id: z.union([rankingPresetIdSchema, storedRankingProfileIdSchema]),
    /** Omitted: every surface the profile applies to. */
    surfaces: rankingProfileMeta.surfaces.optional(),
  })
  .strict();
export type RankingActiveUpdate = z.input<typeof rankingActiveUpdateSchema>;

export const rankingActiveResponseSchema = z.object({
  friend_id: z.number().int(),
  active: rankingActiveProfilesSchema,
});
export type RankingActiveResponse = z.infer<typeof rankingActiveResponseSchema>;

export const rankingProfileDeleteResponseSchema = z.object({
  deleted: z.literal(true),
  id: z.string(),
});
export type RankingProfileDeleteResponse = z.infer<typeof rankingProfileDeleteResponseSchema>;

// Portable files deliberately have neither local ids nor collection data.
export const MAX_RANKING_FILE_BYTES = 32 * 1024;
export const rankingProfileFileSchema = rankingProfileDraftSchema
  .extend({
    format: z.literal("groovenet-ranking-profile"),
  })
  .strict();
export type RankingProfileFile = z.infer<typeof rankingProfileFileSchema>;

export class RankingImportError extends Error {}

/** Bound traversal before Zod, including parsed objects JSON cannot represent. */
function inspectRankingInput(value: unknown, depth = 0, path = "$", budget = { nodes: 0 }): void {
  if (depth > 8) throw new RankingImportError(`Object too deeply nested at ${path}`);
  if (++budget.nodes > 2048) throw new RankingImportError("Too many fields in ranking file");
  if (typeof value === "number" && !Number.isFinite(value))
    throw new RankingImportError(`Non-finite number at ${path}`);
  if (typeof value === "string" && value.length > 1000)
    throw new RankingImportError(`String too long at ${path}`);
  if (value && typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== Array.prototype && proto !== null)
      throw new RankingImportError(`Invalid object prototype at ${path}`);
    for (const key of Object.keys(value)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype")
        throw new RankingImportError(`Forbidden field ${path}.${key}`);
      inspectRankingInput(
        (value as Record<string, unknown>)[key],
        depth + 1,
        `${path}.${key}`,
        budget,
      );
    }
  }
}

/** Each step migrates vN to vN+1; no historical file versions exist yet. */
export type RankingFileMigration = (
  file: Readonly<Record<string, unknown>>,
) => Record<string, unknown>;
export function migrateRankingFile(
  file: Record<string, unknown>,
  steps: Readonly<Record<number, RankingFileMigration>> = {},
): Record<string, unknown> {
  let current = file;
  const version = current.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0)
    throw new RankingImportError("Invalid schema version");
  if (version > 1)
    throw new RankingImportError(`Future schema version ${version}; supported version is 1`);
  for (let v = version; v < 1; v++) {
    const step = steps[v];
    if (!step) throw new RankingImportError(`No migration for schema version ${v}`);
    current = step(current);
    if (current.version !== v + 1)
      throw new RankingImportError(`Invalid migration for version ${v}`);
  }
  return current;
}

/** Pure parser shared by HTTP and CLI. Only signal ids are forward compatible. */
export function parseRankingProfileFile(input: unknown): {
  file: RankingProfileFile;
  warnings: string[];
} {
  let value: unknown = input;
  if (typeof input === "string") {
    if (new TextEncoder().encode(input).length > MAX_RANKING_FILE_BYTES)
      throw new RankingImportError(`Ranking file exceeds ${MAX_RANKING_FILE_BYTES} bytes`);
    try {
      value = JSON.parse(input);
    } catch {
      throw new RankingImportError("Invalid JSON in ranking file");
    }
  }
  inspectRankingInput(value);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new RankingImportError("Ranking file must be an object");
  const migrated = migrateRankingFile(value as Record<string, unknown>);
  const warnings: string[] = [];
  const known = (signal: string) => {
    if ((RANKING_SIGNAL_IDS as readonly string[]).includes(signal)) return true;
    warnings.push(`Dropped unknown signal: ${signal}`);
    return false;
  };
  const cleaned = { ...migrated };
  if (cleaned.weights && typeof cleaned.weights === "object" && !Array.isArray(cleaned.weights))
    cleaned.weights = Object.fromEntries(
      Object.entries(cleaned.weights).filter(([key]) => known(key)),
    );
  if (cleaned.base && typeof cleaned.base === "object" && !Array.isArray(cleaned.base)) {
    const base = cleaned.base as Record<string, unknown>;
    cleaned.base = {
      ...base,
      ...(Array.isArray(base.signals)
        ? {
            signals: base.signals.filter((id: unknown) => typeof id !== "string" || known(id)),
          }
        : {}),
    };
  }
  const result = rankingProfileFileSchema.safeParse(cleaned);
  if (!result.success)
    throw new RankingImportError(
      result.error.issues
        .map((issue) => `${issue.path.join(".") || "$"}: ${issue.message}`)
        .join("; "),
    );
  return { file: result.data, warnings: [...new Set(warnings)] };
}

/** Fixed field order makes export → import → export byte-identical. */
export function exportRankingProfileFile(profile: RankingProfile): RankingProfileFile {
  const { name, description, author, version, surfaces, weights, base, usePrior, constraints } =
    profile;
  return rankingProfileFileSchema.parse({
    format: "groovenet-ranking-profile",
    version,
    name,
    description,
    ...(author === undefined ? {} : { author }),
    surfaces,
    weights: Object.fromEntries(Object.entries(weights).sort(([a], [b]) => a.localeCompare(b))),
    ...(base ? { base } : {}),
    usePrior,
    constraints,
  });
}

export const rankingProfileImportSchema = z
  .object({
    friend_id: z.number().int().positive(),
    // Raw file text allows size checks before parsing and warnings for unknown signals.
    file: z.string().max(MAX_RANKING_FILE_BYTES),
  })
  .strict();
export const rankingProfileImportResponseSchema = z.object({
  profile: rankingProfileEntrySchema,
  warnings: z.array(z.string()),
});
export type RankingProfileImportResponse = z.infer<typeof rankingProfileImportResponseSchema>;
export const rankingProfileFriendCopySchema = z
  .object({
    friend_id: z.number().int().positive(),
    source_friend_id: z.number().int().positive(),
  })
  .strict();
export type RankingProfileFriendCopy = z.infer<typeof rankingProfileFriendCopySchema>;

export const rankingJsonSchemas = {
  RankingProfileFile: z.toJSONSchema(rankingProfileFileSchema),
  RankingProfileImportRequest: z.toJSONSchema(rankingProfileImportSchema),
  RankingProfileImportResponse: z.toJSONSchema(rankingProfileImportResponseSchema),
  RankingProfileFriendCopyRequest: z.toJSONSchema(rankingProfileFriendCopySchema),
  RankingConfig: z.toJSONSchema(rankingConfigSchema, { io: "input" }),
  RankingProfile: z.toJSONSchema(rankingProfileEntrySchema),
  RankingProfileDraft: z.toJSONSchema(rankingProfileDraftSchema, { io: "input" }),
  RankingProfilesResponse: z.toJSONSchema(rankingProfilesResponseSchema),
  RankingProfileCreateRequest: z.toJSONSchema(rankingProfileCreateSchema, { io: "input" }),
  RankingProfileUpdateRequest: z.toJSONSchema(rankingProfileUpdateSchema, { io: "input" }),
  RankingProfileCopyRequest: z.toJSONSchema(rankingProfileCopySchema, { io: "input" }),
  RankingActiveUpdateRequest: z.toJSONSchema(rankingActiveUpdateSchema, { io: "input" }),
  RankingActiveResponse: z.toJSONSchema(rankingActiveResponseSchema),
  RankingProfileDeleteResponse: z.toJSONSchema(rankingProfileDeleteResponseSchema),
} as const;

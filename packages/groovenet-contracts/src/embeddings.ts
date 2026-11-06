import { z } from "zod";

// Embedding generation, backfill runs, the embedding queue and the model
// settings (#1020). The routes keep their own text coercion and refinements'
// error paths; these are the wire shapes.

export const EMBEDDING_KINDS = ["identity", "audio_vibe", "context"] as const;
/** `context` is the natural-language retrieval embedding (#408). */
export const embeddingKindSchema = z.enum(EMBEDDING_KINDS);
export type EmbeddingKind = z.infer<typeof embeddingKindSchema>;

export const EMBEDDING_BACKFILL_SCOPES = ["missing", "all", "release", "track"] as const;
export const embeddingBackfillScopeSchema = z.enum(EMBEDDING_BACKFILL_SCOPES);
export type EmbeddingBackfillScope = z.infer<typeof embeddingBackfillScopeSchema>;

// ─── Backfill (#388) ─────────────────────────────────────────────────────────

/**
 * Which tracks to resolve. `scope: "track"` needs `track_ids` and `scope:
 * "release"` needs `release_id`; see `refineEmbeddingsBackfillBody`. A plain
 * object so consumers can `.extend()` it with their own coercion.
 */
export const embeddingsBackfillObjectSchema = z.object({
  scope: embeddingBackfillScopeSchema.default("missing"),
  types: z.array(embeddingKindSchema).min(1).optional(),
  friend_id: z.number().int().optional(),
  release_id: z.string().min(1).optional(),
  track_ids: z.array(z.string().min(1)).min(1).optional(),
  limit: z.number().int().optional(),
  force: z.boolean().optional().meta({
    description:
      "Orthogonal to scope: even `release` and `track` only fill what is missing by default. `all` implies it.",
  }),
  dry_run: z.boolean().optional().meta({ description: "Report counts and enqueue nothing." }),
});

/** Cross-field rules the JSON Schema cannot express; run at runtime only. */
export function refineEmbeddingsBackfillBody(
  value: Pick<z.infer<typeof embeddingsBackfillObjectSchema>, "scope" | "track_ids" | "release_id">,
  ctx: z.RefinementCtx,
): void {
  if (value.scope === "track" && !value.track_ids?.length) {
    ctx.addIssue({ code: "custom", message: "scope 'track' requires track_ids" });
  }
  if (value.scope === "release" && !value.release_id) {
    ctx.addIssue({ code: "custom", message: "scope 'release' requires release_id" });
  }
}

export const embeddingsBackfillBodySchema = embeddingsBackfillObjectSchema.superRefine(
  refineEmbeddingsBackfillBody,
);
export type EmbeddingsBackfillRequest = z.input<typeof embeddingsBackfillObjectSchema>;

export const embeddingsBackfillRunSchema = z.object({
  run_id: z.string(),
  queued: z.number().int(),
  success: z.number().int(),
  skipped: z.number().int(),
  failed: z.number().int(),
  errors: z.array(z.string()),
  started_at: z.number().int(),
  updated_at: z.number().int(),
  complete: z.boolean(),
});
export type EmbeddingsBackfillRun = z.infer<typeof embeddingsBackfillRunSchema>;

export const embeddingsBackfillDryRunSchema = z.object({
  dry_run: z.literal(true),
  total: z.number().int(),
  by_type: z.object({
    identity: z.number().int(),
    audio_vibe: z.number().int(),
    context: z.number().int(),
  }),
});
export type EmbeddingsBackfillDryRun = z.infer<typeof embeddingsBackfillDryRunSchema>;

export const embeddingsBackfillResponseSchema = z.union([
  embeddingsBackfillRunSchema,
  embeddingsBackfillDryRunSchema,
]);
export type EmbeddingsBackfillResponse = z.infer<typeof embeddingsBackfillResponseSchema>;

// ─── Status ──────────────────────────────────────────────────────────────────

export const embeddingModelCoverageSchema = z.object({
  model: z.string(),
  dims: z.number().int(),
  template_version: z.number().int(),
  count: z.number().int(),
});
export type EmbeddingModelCoverage = z.infer<typeof embeddingModelCoverageSchema>;

export const embeddingsStatusSchema = z.object({
  total_tracks: z.number().int(),
  /** Tracks with no row at the target model and current template version (#407). */
  missing: z.object({
    identity: z.number().int(),
    audio_vibe: z.number().int(),
    context: z.number().int(),
  }),
  /** Row counts per model and template version, for watching a switch's backfill reach coverage (#386, #407). */
  by_model: z.object({
    identity: z.array(embeddingModelCoverageSchema),
    audio_vibe: z.array(embeddingModelCoverageSchema),
    context: z.array(embeddingModelCoverageSchema),
  }),
});
export type EmbeddingsStatus = z.infer<typeof embeddingsStatusSchema>;

export const embeddingsStatusQuerySchema = z.object({
  friend_id: z.number().int().optional(),
});
export type EmbeddingsStatusQuery = z.infer<typeof embeddingsStatusQuerySchema>;

// ─── Queue (#451) ────────────────────────────────────────────────────────────

export const embeddingQueueLaneDepthsSchema = z.object({
  interactive: z.number().int(),
  sync: z.number().int(),
  bulk: z.number().int(),
});
export type EmbeddingQueueLaneDepths = z.infer<typeof embeddingQueueLaneDepthsSchema>;

export const embeddingQueueKindCountsSchema = z.object({
  identity: z.number().int(),
  audio_vibe: z.number().int(),
  context: z.number().int(),
});
export type EmbeddingQueueKindCounts = z.infer<typeof embeddingQueueKindCountsSchema>;

/** A still-running backfill run, as it shows up in the queue view. */
export const embeddingQueueActiveRunSchema = z.object({
  run_id: z.string(),
  queued: z.number().int(),
  success: z.number().int(),
  skipped: z.number().int(),
  failed: z.number().int(),
  started_at: z.number().int(),
  updated_at: z.number().int(),
});
export type EmbeddingQueueActiveRun = z.infer<typeof embeddingQueueActiveRunSchema>;

/** One entry from `embedding_queue:failed`, with a stable `id` for the retry action. */
export const embeddingQueueFailedJobSchema = z.object({
  id: z.string(),
  track_id: z.string(),
  friend_id: z.number().int(),
  kind: embeddingKindSchema,
  run_id: z.string().optional(),
  attempts: z.number().int(),
  error: z.string(),
  failed_at: z.number().int(),
});
export type EmbeddingQueueFailedJob = z.infer<typeof embeddingQueueFailedJobSchema>;

export const embeddingQueueStatusSchema = z.object({
  lanes: embeddingQueueLaneDepthsSchema,
  retrying: z.number().int(),
  failed_count: z.number().int(),
  paused: z.boolean(),
  pause_reason: z.string().optional(),
  last_error: z.string().optional(),
  interval_seconds: z.number().int(),
  batch_size: z.number().int(),
  drain_rate_per_minute: z.number().meta({ description: "Jobs/minute while draining; 0 paused." }),
  eta_seconds: z.number().int().nullable().meta({
    description: "Null while paused (nothing draining); 0 when the backlog is empty.",
  }),
  by_kind: embeddingQueueKindCountsSchema,
  by_kind_sampled: z
    .boolean()
    .meta({ description: "True when a lane was longer than the sample taken to build `by_kind`." }),
  active_backfill_runs: z.array(embeddingQueueActiveRunSchema),
  failed: z.array(embeddingQueueFailedJobSchema),
});
export type EmbeddingQueueStatus = z.infer<typeof embeddingQueueStatusSchema>;

export const embeddingQueueRetryBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});
export type EmbeddingQueueRetryBody = z.infer<typeof embeddingQueueRetryBodySchema>;

export const embeddingQueueRetryResponseSchema = z.object({
  retried: z.array(z.string()),
  not_found: z.array(z.string()),
});
export type EmbeddingQueueRetryResponse = z.infer<typeof embeddingQueueRetryResponseSchema>;

// ─── Model settings (#386) ───────────────────────────────────────────────────

export const EMBEDDING_MODEL_FIELDS = ["target", "serving"] as const;
export const embeddingModelFieldSchema = z.enum(EMBEDDING_MODEL_FIELDS);

export const embeddingModelSettingsSchema = z.object({
  embedding_type: embeddingKindSchema,
  target_model: z.string(),
  target_dims: z.number().int(),
  serving_model: z.string(),
  serving_dims: z.number().int(),
  serving_template_version: z.number().int(),
});
export type EmbeddingModelSettings = z.infer<typeof embeddingModelSettingsSchema>;

export const embeddingModelSettingsListSchema = z.array(embeddingModelSettingsSchema);

/** A plain object so consumers can `.extend()` it with their own coercion. */
export const embeddingModelUpdateObjectSchema = z.object({
  embedding_type: embeddingKindSchema,
  field: embeddingModelFieldSchema,
  model: z.string().min(1),
  dims: z.number().positive(),
  template_version: z.number().int().positive().optional().meta({
    description:
      "Serving only: the template version reads switch to (#407). Omit to keep the current one.",
  }),
});

/** `template_version` only applies to the serving step. */
export const requireServingForTemplateVersion = [
  (body: { field: "target" | "serving"; template_version?: number | undefined }) =>
    body.field === "serving" || body.template_version === undefined,
  {
    message: "template_version only applies to field: serving",
    path: ["template_version"] as string[],
  },
] as const;

export const embeddingModelUpdateBodySchema = embeddingModelUpdateObjectSchema.refine(
  ...requireServingForTemplateVersion,
);
export type EmbeddingModelUpdate = z.input<typeof embeddingModelUpdateObjectSchema>;

export const embeddingJsonSchemas = {
  EmbeddingKind: z.toJSONSchema(embeddingKindSchema),
  EmbeddingBackfillRequest: z.toJSONSchema(embeddingsBackfillObjectSchema, { io: "input" }),
  EmbeddingBackfillRun: z.toJSONSchema(embeddingsBackfillRunSchema),
  EmbeddingBackfillDryRun: z.toJSONSchema(embeddingsBackfillDryRunSchema),
  EmbeddingBackfillResponse: z.toJSONSchema(embeddingsBackfillResponseSchema),
  EmbeddingModelCoverage: z.toJSONSchema(embeddingModelCoverageSchema),
  EmbeddingStatus: z.toJSONSchema(embeddingsStatusSchema),
  EmbeddingQueueStatus: z.toJSONSchema(embeddingQueueStatusSchema),
  EmbeddingQueueFailedJob: z.toJSONSchema(embeddingQueueFailedJobSchema),
  EmbeddingQueueRetryRequest: z.toJSONSchema(embeddingQueueRetryBodySchema, { io: "input" }),
  EmbeddingQueueRetryResponse: z.toJSONSchema(embeddingQueueRetryResponseSchema),
  EmbeddingModelSettings: z.toJSONSchema(embeddingModelSettingsSchema),
  EmbeddingModelSettingsList: z.toJSONSchema(embeddingModelSettingsListSchema),
  EmbeddingModelUpdateRequest: z.toJSONSchema(embeddingModelUpdateObjectSchema, { io: "input" }),
} as const;

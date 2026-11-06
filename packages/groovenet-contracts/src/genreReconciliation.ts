import { z } from "zod";

export const genreProposalActionSchema = z.enum(["map", "new_genre", "descriptor", "drop"]);
export const genreProposalMethodSchema = z.enum(["exact", "ai", "manual"]);
export const genreProposalStatusSchema = z.enum(["pending", "accepted", "rejected", "edited"]);

export const genreReconciliationRunRequestSchema = z
  .object({
    ai: z.boolean().optional(),
    new_genre_min_tracks: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).nullable().optional(),
    refresh: z.boolean().optional(),
    friend_id: z.number().int().min(1).nullable().optional(),
  })
  .strict();
export const genreReconciliationRunSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["running", "completed", "failed"]),
  options: z.object({
    ai: z.boolean(),
    new_genre_min_tracks: z.number().int(),
    limit: z.number().int().nullable(),
    refresh: z.boolean(),
    friend_id: z.number().int().nullable().default(null),
  }),
  model: z.string().nullable(),
  distinct_values: z.number().int(),
  exact_matches: z.number().int(),
  kept: z.number().int(),
  ai_pending: z.number().int(),
  ai_proposed: z.number().int(),
  ai_failed: z.number().int(),
  ai_batches: z.number().int(),
  input_tokens: z.number().int(),
  output_tokens: z.number().int(),
  cost_usd: z.number(),
  error: z.string().nullable(),
  started_at: z.string().meta({ format: "date-time" }),
  updated_at: z.string().meta({ format: "date-time" }),
  finished_at: z.string().meta({ format: "date-time" }).nullable(),
});
export const genreProposalSchema = z.object({
  id: z.string().uuid(),
  value_normalized: z.string(),
  raw_examples: z.array(z.string()),
  track_count: z.number().int(),
  action: genreProposalActionSchema,
  target_genre_ids: z.array(z.string().uuid()),
  target_genres: z.array(
    z.object({ id: z.string().uuid(), name: z.string(), parent_name: z.string().nullable() }),
  ),
  proposed_genre_name: z.string().nullable(),
  proposed_parent_id: z.string().uuid().nullable(),
  proposed_parent_name: z.string().nullable(),
  confidence: z.number().nullable(),
  method: genreProposalMethodSchema,
  status: genreProposalStatusSchema,
  run_id: z.string().uuid().nullable(),
  created_genre_id: z.string().uuid().nullable(),
  applied_at: z.string().meta({ format: "date-time" }).nullable(),
  created_at: z.string().meta({ format: "date-time" }),
  updated_at: z.string().meta({ format: "date-time" }),
});
export const genreProposalQuerySchema = z.object({
  status: genreProposalStatusSchema.optional(),
  action: genreProposalActionSchema.optional(),
  method: genreProposalMethodSchema.optional(),
  min_tracks: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
});
export const genreProposalListResponseSchema = z.object({
  proposals: z.array(genreProposalSchema),
  total: z.number().int(),
});
export const genreProposalChangeFields = {
  status: genreProposalStatusSchema.optional(),
  action: genreProposalActionSchema.optional(),
  target_genres: z.array(z.string().trim().min(1)).max(10).optional(),
  proposed_genre_name: z.string().nullable().optional(),
  proposed_parent_id: z.string().uuid().nullable().optional(),
};
export const hasGenreProposalChange = (value: Record<string, unknown>) =>
  Object.entries(value).some(([key, field]) => key !== "id" && field !== undefined);
export const genreProposalUpdateSchema = z
  .object(genreProposalChangeFields)
  .strict()
  .refine(hasGenreProposalChange, { message: "Nothing to update" });
export const genreProposalDecisionRequestSchema = z
  .object({
    decisions: z
      .array(
        z
          .object({ id: z.string().uuid(), ...genreProposalChangeFields })
          .strict()
          .refine(hasGenreProposalChange, { message: "Nothing to update" }),
      )
      .min(1)
      .max(500),
  })
  .strict();
export const genreProposalSnapshotSchema = z.object({
  id: z.string().uuid(),
  status: genreProposalStatusSchema,
  action: genreProposalActionSchema,
  target_genre_ids: z.array(z.string().uuid()),
  proposed_genre_name: z.string().nullable(),
  proposed_parent_id: z.string().uuid().nullable(),
  method: genreProposalMethodSchema,
});
export const genreProposalDecisionResponseSchema = z.object({
  proposals: z.array(genreProposalSchema),
  previous: z.array(genreProposalSnapshotSchema),
});
export const genreProposalRestoreRequestSchema = z
  .object({ snapshots: z.array(genreProposalSnapshotSchema.strict()).min(1).max(500) })
  .strict();
export const genreProposalRestoreResponseSchema = z.object({ restored: z.number().int() });
export const genreProposalTracksResponseSchema = z.object({
  tracks: z.array(
    z.object({
      track_id: z.string(),
      friend_id: z.number().int(),
      title: z.string(),
      artist: z.string(),
      album: z.string().nullable(),
      styles: z.array(z.string()),
    }),
  ),
});
export const genreProposalApplyRequestSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).optional(),
    friend_id: z.number().int().min(1).optional(),
  })
  .strict();
export const genreProposalApplyResponseSchema = z.object({
  proposals_applied: z.number().int(),
  tracks_linked: z.number().int(),
  descriptors_added: z.number().int(),
  aliases_added: z.number().int(),
  genres_created: z.number().int(),
  skipped: z.array(z.object({ id: z.string().uuid(), value: z.string(), reason: z.string() })),
});
const countsOf = <T extends string>(keys: readonly T[]) =>
  z.object(
    Object.fromEntries(keys.map((key) => [key, z.number().int()])) as Record<T, z.ZodNumber>,
  );
export const genreReconciliationCoverageSchema = z.object({
  tracks: z.object({
    with_local_tags: z.number().int(),
    with_genres: z.number().int(),
    descriptors_only: z.number().int(),
    no_genre: z.number().int(),
    unresolved: z.number().int(),
  }),
  values: z.object({
    distinct: z.number().int(),
    proposed: z.number().int(),
    exact: z.number().int(),
    exact_share: z.number(),
    by_status: countsOf(genreProposalStatusSchema.options),
    by_action: countsOf(genreProposalActionSchema.options),
  }),
});

export type GenreProposalAction = z.infer<typeof genreProposalActionSchema>;
export type GenreProposalMethod = z.infer<typeof genreProposalMethodSchema>;
export type GenreProposalStatus = z.infer<typeof genreProposalStatusSchema>;
export type GenreReconciliationRequest = z.infer<typeof genreReconciliationRunRequestSchema>;
export type GenreReconciliationRun = z.infer<typeof genreReconciliationRunSchema>;
export type GenreProposal = z.infer<typeof genreProposalSchema>;
export type GenreProposalQuery = z.infer<typeof genreProposalQuerySchema>;
export type GenreProposalListResponse = z.infer<typeof genreProposalListResponseSchema>;
export type GenreProposalUpdate = z.infer<typeof genreProposalUpdateSchema>;
export type GenreProposalDecision = z.infer<
  typeof genreProposalDecisionRequestSchema
>["decisions"][number];
export type GenreProposalSnapshot = z.infer<typeof genreProposalSnapshotSchema>;
export type GenreProposalDecisionResult = z.infer<typeof genreProposalDecisionResponseSchema>;
export type GenreProposalTrack = z.infer<
  typeof genreProposalTracksResponseSchema
>["tracks"][number];
export type GenreProposalApplyResult = z.infer<typeof genreProposalApplyResponseSchema>;
export type GenreReconciliationCoverage = z.infer<typeof genreReconciliationCoverageSchema>;

const registry = z.registry<{ id: string }>();
const schemas = {
  GenreProposalAction: genreProposalActionSchema,
  GenreProposalMethod: genreProposalMethodSchema,
  GenreProposalStatus: genreProposalStatusSchema,
  GenreReconciliationRunRequest: genreReconciliationRunRequestSchema,
  GenreReconciliationRun: genreReconciliationRunSchema,
  GenreProposal: genreProposalSchema,
  GenreProposalQuery: genreProposalQuerySchema,
  GenreProposalListResponse: genreProposalListResponseSchema,
  GenreProposalUpdate: genreProposalUpdateSchema,
  GenreProposalDecisionRequest: genreProposalDecisionRequestSchema,
  GenreProposalSnapshot: genreProposalSnapshotSchema,
  GenreProposalDecisionResponse: genreProposalDecisionResponseSchema,
  GenreProposalRestoreRequest: genreProposalRestoreRequestSchema,
  GenreProposalRestoreResponse: genreProposalRestoreResponseSchema,
  GenreProposalTracksResponse: genreProposalTracksResponseSchema,
  GenreProposalApplyRequest: genreProposalApplyRequestSchema,
  GenreProposalApplyResponse: genreProposalApplyResponseSchema,
  GenreReconciliationCoverage: genreReconciliationCoverageSchema,
};
for (const [id, schema] of Object.entries(schemas)) registry.add(schema, { id });
const jsonSchemas = z.toJSONSchema(registry, {
  io: "input",
  uri: (id) => `#/components/schemas/${id}`,
}).schemas;
export const genreReconciliationJsonSchemas = Object.fromEntries(
  Object.entries(jsonSchemas).map(([name, schema]) => [
    name,
    Object.fromEntries(Object.entries(schema).filter(([key]) => key !== "$id")),
  ]),
);

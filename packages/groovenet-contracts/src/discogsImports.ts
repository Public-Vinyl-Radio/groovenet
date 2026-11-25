import { z } from "zod";

/** A Discogs import run as a background job (#1274). */
export const discogsImportStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "interrupted",
]);
export const discogsImportPhaseSchema = z.enum([
  "queued",
  "listing",
  "fetching",
  "ingesting",
  "done",
]);

export const discogsImportSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  status: discogsImportStatusSchema.meta({
    description:
      "`queued` and `running` are active (at most one per username). `interrupted`: stopped after repeated restarts; queue a new import to resume.",
  }),
  phase: discogsImportPhaseSchema,
  found: z.number().int().nonnegative().meta({ description: "Releases in the collection." }),
  total: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .meta({ description: "Releases to fetch; null until the collection is listed." }),
  fetched: z.number().int().nonnegative(),
  added: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
  failed_releases: z.number().int().nonnegative(),
  last_error: z.string().nullable(),
  attempts: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: "Times a worker took it up: more than 1 means it resumed." }),
  stalled: z.boolean().meta({
    description:
      "Running, but the process holding it stopped renewing its lease (a restart); it resumes shortly.",
  }),
  created_at: z.string(),
  started_at: z.string().nullable(),
  updated_at: z.string(),
  finished_at: z.string().nullable(),
});

export const discogsImportCreateSchema = z.object({
  username: z.string().trim().min(1).max(100).optional(),
});

export const discogsImportCreateResponseSchema = z.object({
  import: discogsImportSchema,
  created: z.boolean().meta({
    description:
      "False when an import for this username was already active and is returned instead.",
  }),
});

export const discogsImportResponseSchema = z.object({ import: discogsImportSchema });

export const discogsImportListResponseSchema = z.object({
  imports: z.array(discogsImportSchema),
});

export const discogsImportLogResponseSchema = z.object({
  lines: z.array(z.object({ id: z.number().int(), line: z.string() })),
  /** Pass as `after` to read on from here. */
  next_after: z.number().int(),
});

export type DiscogsImportStatus = z.infer<typeof discogsImportStatusSchema>;
export type DiscogsImportPhase = z.infer<typeof discogsImportPhaseSchema>;
export type DiscogsImport = z.infer<typeof discogsImportSchema>;
export type DiscogsImportCreate = z.infer<typeof discogsImportCreateSchema>;
export type DiscogsImportCreateResponse = z.infer<typeof discogsImportCreateResponseSchema>;
export type DiscogsImportResponse = z.infer<typeof discogsImportResponseSchema>;
export type DiscogsImportListResponse = z.infer<typeof discogsImportListResponseSchema>;
export type DiscogsImportLogResponse = z.infer<typeof discogsImportLogResponseSchema>;

/** Whether an import still has work ahead of it. */
export function isDiscogsImportActive(status: DiscogsImportStatus): boolean {
  return status === "queued" || status === "running";
}

export const discogsImportJsonSchemas = {
  DiscogsImport: z.toJSONSchema(discogsImportSchema),
  DiscogsImportCreate: z.toJSONSchema(discogsImportCreateSchema, { io: "input" }),
  DiscogsImportCreateResponse: z.toJSONSchema(discogsImportCreateResponseSchema),
  DiscogsImportResponse: z.toJSONSchema(discogsImportResponseSchema),
  DiscogsImportListResponse: z.toJSONSchema(discogsImportListResponseSchema),
  DiscogsImportLogResponse: z.toJSONSchema(discogsImportLogResponseSchema),
};

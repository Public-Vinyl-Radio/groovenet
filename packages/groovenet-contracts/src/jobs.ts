import { z } from "zod";

// Background download/analysis jobs (#985). The job entity is shared by the
// list and detail responses and by the events the SSE stream carries.

export const JOB_STATES = ["waiting", "active", "completed", "failed"] as const;
export const JOB_STATE_FILTERS = ["all", ...JOB_STATES] as const;
export const jobStateSchema = z.enum(JOB_STATES);
export const jobStateFilterSchema = z.enum(JOB_STATE_FILTERS);
export type JobState = z.infer<typeof jobStateSchema>;
export type JobStateFilter = z.infer<typeof jobStateFilterSchema>;

const jobDataShape = z.object({
  track_id: z.string(),
  friend_id: z.number().int(),
  release_id: z.string().nullable().optional(),
  job_type: z.string().optional(),
  apple_music_url: z.string().optional(),
  youtube_url: z.string().optional(),
  soundcloud_url: z.string().optional(),
  title: z.string().nullable().optional(),
  artist: z.string().nullable().optional(),
  album: z.string().nullable().optional(),
  year: z.union([z.string(), z.number()]).nullable().optional(),
  album_thumbnail: z.string().nullable().optional(),
  discogs_url: z.string().nullable().optional(),
  local_audio_url: z.string().nullable().optional(),
  library_identifier: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  downloader: z.string().nullable().optional(),
  source_url_key: z.string().nullable().optional(),
});
export const jobDataSchema = jobDataShape
  .passthrough()
  .meta({ description: "The job payload. Extra keys vary by job_type." });
export type JobData = z.infer<typeof jobDataShape>;

const jobShape = z.object({
  id: z.string().meta({ example: "job_8f21c4" }),
  name: z.string().meta({ example: "download-audio" }),
  state: jobStateSchema.meta({ example: "completed" }),
  progress: z.number().meta({ example: 100 }),
  data: jobDataSchema,
  returnvalue: z.unknown().optional(),
  finishedOn: z.number().optional().meta({ description: "Epoch milliseconds." }),
  failedReason: z.string().optional(),
  attemptsMade: z.number().int(),
  processedOn: z.number().optional().meta({ description: "Epoch milliseconds." }),
  queue: z.string().meta({
    description: 'Always "download"; this API exposes one queue.',
    example: "download",
  }),
});
export const jobSchema = jobShape.passthrough();
export type Job = z.infer<typeof jobShape>;

const jobDetailsShape = jobShape.extend({
  delay: z.number().optional(),
  timestamp: z
    .number()
    .optional()
    .meta({ description: "Epoch milliseconds when the job was enqueued." }),
  opts: z.record(z.string(), z.unknown()).optional(),
  logs: z.array(z.unknown()).optional(),
});
export const jobDetailsSchema = jobDetailsShape.passthrough();
export type JobDetails = z.infer<typeof jobDetailsShape>;

/** What a client may send; the app adds its text coercion, clamping and defaults. */
export const jobsListQuerySchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
  state: jobStateFilterSchema.optional(),
});
export type JobsListQuery = z.infer<typeof jobsListQuerySchema>;

export const jobsSummarySchema = z.object({
  total: z.number().int(),
  waiting: z.number().int(),
  active: z.number().int(),
  completed: z.number().int(),
  failed: z.number().int(),
});
export type JobsSummary = z.infer<typeof jobsSummarySchema>;

export const jobsPaginationSchema = z.object({
  limit: z.number().int(),
  offset: z.number().int(),
  total_filtered: z.number().int(),
  has_more: z.boolean(),
});
export type JobsPagination = z.infer<typeof jobsPaginationSchema>;

export const jobsListResponseSchema = z.object({
  jobs: z.array(jobSchema),
  summary: jobsSummarySchema,
  pagination: jobsPaginationSchema.optional(),
});
export type JobsListResponse = z.infer<typeof jobsListResponseSchema>;

export const jobsClearResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type JobsClearResponse = z.infer<typeof jobsClearResponseSchema>;

export const jobLogsResponseSchema = z.object({ logs: z.array(z.string()) });
export type JobLogsResponse = z.infer<typeof jobLogsResponseSchema>;

export const jobOutcomeResponseSchema = z.object({
  reported: z.boolean().meta({
    description: "False for a job already reported, or one that downloaded nothing.",
    example: true,
  }),
});
export type JobOutcomeResponse = z.infer<typeof jobOutcomeResponseSchema>;

/** One `data:` payload on `GET /api/jobs/events` (after the initial `connected`). */
export const jobEventSchema = z.object({
  type: z.enum(["job_completed", "error"]),
  job_id: z.string().optional(),
  track_id: z.string().optional(),
  friend_id: z.number().int().optional(),
  result: z.unknown().optional(),
  message: z.string().optional(),
  timestamp: z.number().int().meta({ description: "Epoch milliseconds." }),
});
export type JobEvent = z.infer<typeof jobEventSchema>;

export const jobJsonSchemas = {
  JobState: z.toJSONSchema(jobStateSchema),
  JobData: z.toJSONSchema(jobDataSchema),
  Job: z.toJSONSchema(jobSchema),
  JobDetails: z.toJSONSchema(jobDetailsSchema),
  JobsSummary: z.toJSONSchema(jobsSummarySchema),
  JobsPagination: z.toJSONSchema(jobsPaginationSchema),
  JobsListResponse: z.toJSONSchema(jobsListResponseSchema),
  JobsClearResponse: z.toJSONSchema(jobsClearResponseSchema),
  JobLogsResponse: z.toJSONSchema(jobLogsResponseSchema),
  JobOutcomeResponse: z.toJSONSchema(jobOutcomeResponseSchema),
  JobEvent: z.toJSONSchema(jobEventSchema),
} as const;

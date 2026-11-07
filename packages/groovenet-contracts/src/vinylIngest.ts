import { z } from "zod";

/**
 * Vinyl ingest, detections and reference fingerprints (epic #281).
 *
 * `POST /api/audio/ingest` takes `multipart/form-data` from the Raspberry Pi
 * listener (fields `audio`, `source_id`, optional `session_id`, `sequence`,
 * `captured_at`), so only its response and rejection vocabulary are shared
 * here. `fingerprint-service` posts the JSON bodies below through
 * `packages/groovenet-python`; they validate unchanged.
 */

const dateTime = { format: "date-time" } as const;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

// ─── Ingest endpoint (#275) ───────────────────────────────────────────────────

export const acceptedIngestSchema = z.object({
  status: z.literal("accepted"),
  ingest_id: z.string().meta({ format: "uuid" }),
  source_id: z.string(),
  duration_seconds: z.number(),
  sample_rate: z.number().nullable(),
  channels: z.number().nullable(),
  captured_at: z.string().meta(dateTime).nullable(),
});
export type AcceptedIngest = z.infer<typeof acceptedIngestSchema>;

export const INGEST_ERROR_CODES = [
  "missing_audio_file",
  "missing_source_id",
  "unsupported_audio_format",
  "invalid_audio_stream",
  "audio_too_large",
  "audio_too_short",
  "audio_too_long",
  "internal_error",
] as const;
export const ingestErrorCodeSchema = z.enum(INGEST_ERROR_CODES);
export type IngestErrorCode = z.infer<typeof ingestErrorCodeSchema>;

/**
 * The rejection vocabulary, as the listener device reads it. These strings are
 * part of the contract — a Pi with no screen uses them to tell "this chunk is
 * bad, drop it" from "retry later", so they must not be reworded.
 */
export const ingestErrorSchema = z.object({
  error: ingestErrorCodeSchema,
  message: z.string(),
});
export type IngestError = z.infer<typeof ingestErrorSchema>;

// ─── Ingest lifecycle (#276) ──────────────────────────────────────────────────

export const INGEST_STATUSES = ["received", "processing", "processed", "failed"] as const;
export const ingestStatusSchema = z.enum(INGEST_STATUSES);
export type IngestStatus = z.infer<typeof ingestStatusSchema>;

/** One candidate the matcher proposed for a window. */
export const ingestMatchCandidateSchema = z.object({
  track_id: z.string().min(1),
  friend_id: z.number().int(),
  confidence: z.number(),
  offset_seconds: z.number(),
});
export type IngestMatchCandidate = z.infer<typeof ingestMatchCandidateSchema>;

/**
 * The callback body from `fingerprint-service`.
 *
 * `ingest_id` is optional because the path carries it; a body naming a
 * different ingest is ignored rather than honoured. `candidates` is list-shaped
 * but only ever holds zero or one entry; an empty list with `status:
 * "processed"` is a recorded no-match window, not a failure.
 */
export const ingestResultBodyObjectSchema = z.object({
  ingest_id: z.string().optional(),
  source_id: z.string().optional(),
  session_id: z.string().nullable().optional(),
  sequence: z.number().nullable().optional(),
  status: z.enum(["processed", "failed"]),
  error: z.string().nullable().optional(),
  /** Where `fingerprint-service` failed (#280): parse, resolve, decode or match. */
  error_stage: z.string().nullable().optional(),
  window_start_at: z.string().meta(dateTime).nullable().optional(),
  duration_seconds: z.number().nullable().optional(),
  sample_rate: z.number().nullable().optional(),
  level_dbfs: z.number().nullable().optional().meta({
    description: "RMS level of the window, dBFS",
  }),
  fingerprint_type: z.string().nullable().optional(),
  fingerprint_version: z.string().nullable().optional(),
  candidates: z.array(ingestMatchCandidateSchema).default([]).meta({
    description:
      "Zero or one entry. An empty list with status `processed` is a recorded no-match window, not a failure.",
  }),
});
export type IngestResultBody = z.infer<typeof ingestResultBodyObjectSchema>;

export const ingestClaimResponseSchema = z.object({
  ingest_id: z.string().meta({ format: "uuid" }),
  status: z.enum(["processing", "processed", "failed"]),
});
export type IngestClaimResponse = z.infer<typeof ingestClaimResponseSchema>;

export const ingestResultResponseSchema = z.object({
  ingest_id: z.string().meta({ format: "uuid" }),
  status: z.enum(["processed", "failed"]),
  detections: z.number().int(),
});
export type IngestResultResponse = z.infer<typeof ingestResultResponseSchema>;

// ─── Retention (#269) ─────────────────────────────────────────────────────────

export const ingestRetentionPolicySchema = z.object({
  maxAgeHours: z.number().positive(),
  maxBytes: z.number().positive(),
  orphanGraceMinutes: z.number().positive(),
  sweepIntervalMinutes: z.number().positive(),
});
export type IngestRetentionPolicy = z.infer<typeof ingestRetentionPolicySchema>;

export const ingestRetentionStatusSchema = z.object({
  files: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  /** Files the next sweep would delete. */
  sweepable: z.number().int().nonnegative(),
  /** Files with no record, past the grace period. */
  orphans: z.number().int().nonnegative(),
  inFlight: z.number().int().nonnegative().meta({
    description:
      "Files held by a received/processing record. Never swept until they exceed the max age.",
  }),
  lastSweptAt: z.string().meta(dateTime).nullable(),
  policy: ingestRetentionPolicySchema,
});
export type IngestRetentionStatus = z.infer<typeof ingestRetentionStatusSchema>;

// ─── Vinyl pipeline debug reads (#299) ────────────────────────────────────────

export const ingestRecordSchema = z.object({
  ingest_id: z.string(),
  source_id: z.string(),
  session_id: z.string().nullable(),
  sequence: z.number().int().nullable(),
  status: ingestStatusSchema,
  error: z.string().nullable(),
  duration_seconds: z.number().nullable(),
  sample_rate: z.number().int().nullable(),
  channels: z.number().int().nullable(),
  codec: z.string().nullable(),
  file_path: z.string().nullable().meta({
    description:
      "Non-null in a terminal state means the raw audio is still on the volume, worth a look.",
  }),
  captured_at: z.string().meta(dateTime).nullable(),
  received_at: z.string().meta(dateTime),
  updated_at: z.string().meta(dateTime),
});
export type IngestRecord = z.infer<typeof ingestRecordSchema>;

export const ingestRecentResponseSchema = z.object({
  ingests: z.array(ingestRecordSchema),
  count: z.number().int().nonnegative(),
});
export type IngestListResponse = z.infer<typeof ingestRecentResponseSchema>;

export const ingestRecentQuerySchema = z.object({
  source_id: z.string().optional(),
  session_id: z.string().optional(),
  status: ingestStatusSchema.optional(),
  limit: z.number().int().optional(),
  offset: z.number().int().optional(),
});
export type IngestRecentQuery = z.infer<typeof ingestRecentQuerySchema>;

/** One matched or no-match matcher window (#279 finds play boundaries in the gaps). */
export const detectionWindowSchema = z.object({
  id: z.string(),
  ingest_id: z.string(),
  source_id: z.string(),
  session_id: z.string().nullable(),
  window_start_at: z.string().meta(dateTime).nullable(),
  /** False means the window was recorded and matched nothing — a real state. */
  matched: z.boolean().meta({
    description: "False is a recorded no-match window, not an absence.",
  }),
  track_id: z.string().nullable(),
  friend_id: z.number().int().nullable(),
  title: z.string().nullable(),
  artist: z.string().nullable(),
  album: z.string().nullable(),
  confidence: z.number().nullable(),
  offset_seconds: z.number().nullable(),
  level_dbfs: z.number().nullable().meta({
    description: "RMS level of the window, dBFS; null on older rows",
  }),
  fingerprint_type: z.string().nullable(),
  fingerprint_version: z.string().nullable(),
  created_at: z.string().meta(dateTime),
});
export type DetectionWindow = z.infer<typeof detectionWindowSchema>;

export const detectionsRecentResponseSchema = z.object({
  detections: z.array(detectionWindowSchema),
  count: z.number().int().nonnegative(),
});
export type DetectionListResponse = z.infer<typeof detectionsRecentResponseSchema>;

export const detectionsRecentQuerySchema = z.object({
  source_id: z.string().optional(),
  session_id: z.string().optional(),
  matched: z.boolean().optional(),
  since: z.string().meta(dateTime).optional(),
  limit: z.number().int().optional(),
  offset: z.number().int().optional(),
});
export type DetectionQuery = z.infer<typeof detectionsRecentQuerySchema>;

const countBandSchema = z.object({
  band: z.string(),
  count: z.number().int().nonnegative(),
});

/** Counters for the ingest pipeline that Postgres cannot answer (#280). */
export const ingestCountersSchema = z.object({
  bucket_minutes: z.number().int(),
  chunks: z.object({
    /** Every upload that reached the route, whatever became of it. */
    received: z.number().int().nonnegative(),
    /** New chunks stored and queued. */
    accepted: z.number().int().nonnegative(),
    /** Retries answered with the original `ingest_id`. */
    duplicate: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    rejected_by_reason: z.array(
      z.object({ reason: z.string(), count: z.number().int().nonnegative() }),
    ),
    /** Uploads the app itself failed on (500), by the stage that failed. */
    failed_by_stage: z.array(
      z.object({ stage: z.string(), count: z.number().int().nonnegative() }),
    ),
    enqueue_failed: z.number().int().nonnegative(),
  }),
  plays: z.object({
    /** Spin sessions created from detections. */
    confirmed: z.number().int().nonnegative(),
    /** From the capture of the window that confirmed a play to its spin. */
    latency_ms_avg: z.number().int().nullable(),
    latency_bands: z.array(countBandSchema),
  }),
});
export type IngestCounters = z.infer<typeof ingestCountersSchema>;

/**
 * Whether the pipeline is working at all (#299).
 *
 * `index.empty` is stated outright rather than left to be inferred from a
 * zero: an empty reference index makes every other number here look healthy
 * while nothing can ever match.
 */
export const ingestPipelineStatsSchema = z.object({
  since: z.string().meta(dateTime),
  window_minutes: z.number().int(),
  source_id: z.string().nullable(),
  ingest_writable: z.boolean().meta({
    description: "False means every upload fails with EACCES — check this first.",
  }),
  index: z.object({
    engine_registered: z.boolean(),
    fingerprint_type: z.string().nullable(),
    fingerprint_version: z.string().nullable(),
    indexed_tracks: z.number().int().nonnegative(),
    empty: z.boolean().meta({
      description: "True means nothing can ever match, however healthy the rest looks.",
    }),
    /** Tracks with `local_audio_url` set but no row for the active engine (#303). */
    missing_fingerprint_tracks: z.number().int().nonnegative(),
  }),
  queue_depth: z.number().int().nullable().meta({
    description: "Null when redis is unreachable — different from a genuine 0.",
  }),
  ingests: z.object({
    by_status: z.record(z.string(), z.number().int()),
    failures: z.array(z.object({ error: z.string(), count: z.number().int().nonnegative() })),
    oldest_in_flight: z
      .object({
        ingest_id: z.string(),
        status: z.string(),
        received_at: z.string().meta(dateTime),
      })
      .nullable(),
  }),
  detections: z.object({
    windows: z.number().int().nonnegative(),
    matched: z.number().int().nonnegative(),
    no_match: z.number().int().nonnegative(),
    match_rate: z.number().nullable().meta({
      description: "Null when the window recorded no detections at all.",
    }),
    confidence_bands: z.array(countBandSchema),
  }),
  spins: z.object({
    pending: z.number().int().nullable().meta({
      description:
        "Confidently-detected plays not yet aggregated into a spin session (#304). Null when it could not be computed.",
    }),
  }),
  /**
   * What leaves no row behind (#280), from Redis: across all sources, rounded
   * out to whole buckets. Null when Redis could not be reached. Optional so a
   * client built against this schema still reads an app from before #280.
   */
  counters: ingestCountersSchema.nullable().optional(),
});
export type IngestPipelineStats = z.infer<typeof ingestPipelineStatsSchema>;

export const ingestStatsQuerySchema = z.object({
  minutes: z.number().int().optional(),
  source_id: z.string().optional(),
});
export type IngestStatsQuery = z.infer<typeof ingestStatsQuerySchema>;

// ─── Reference fingerprints (#277) ────────────────────────────────────────────

const sha256Schema = z.string().regex(SHA256_PATTERN, "must be a hex sha256");

/**
 * One reference fingerprint, as `fingerprint-service` posts it after indexing a
 * library track. `fingerprint_data` is base64 because JSON has no bytes, and
 * null when the engine stores no payload — which is what the stub does.
 */
export const fingerprintUpsertBodyObjectSchema = z.object({
  track_id: z.string().min(1),
  friend_id: z.number().int(),
  fingerprint_type: z.string().min(1).max(50),
  fingerprint_version: z.string().min(1).max(50),
  fingerprint_data: z.string().base64().nullable().optional().meta({
    description: "Base64 engine payload, or null when the engine stores none.",
  }),
  audio_sha256: sha256Schema,
  audio_duration_seconds: z.number().positive().nullable().optional(),
  audio_size_bytes: z.number().int().nonnegative().nullable().optional().meta({
    description: "Size of the audio file fingerprinted, for cheap re-checks (#303)",
  }),
  audio_mtime_ms: z.number().int().nonnegative().nullable().optional().meta({
    description: "Its modification time, epoch milliseconds",
  }),
});
export type FingerprintUpsertBody = z.infer<typeof fingerprintUpsertBodyObjectSchema>;

/** `fingerprint-service` recording that a fingerprint's audio is unchanged (#303). */
export const fingerprintFileStatsBodyObjectSchema = z.object({
  track_id: z.string().min(1),
  friend_id: z.number().int(),
  fingerprint_type: z.string().min(1).max(50),
  fingerprint_version: z.string().min(1).max(50),
  audio_sha256: sha256Schema.meta({
    description: "Only recorded if this still matches the stored hash",
  }),
  audio_size_bytes: z.number().int().nonnegative(),
  audio_mtime_ms: z.number().int().nonnegative().meta({ description: "Epoch milliseconds" }),
});
export type FingerprintFileStatsBody = z.infer<typeof fingerprintFileStatsBodyObjectSchema>;

export const fingerprintFileStatsResponseSchema = z.object({
  updated: z.boolean().meta({
    description: "`false` when the stored hash no longer matches — re-fingerprinted meanwhile",
  }),
});
export type FingerprintFileStatsResponse = z.infer<typeof fingerprintFileStatsResponseSchema>;

export const fingerprintUpsertResponseSchema = z.object({
  track_id: z.string(),
  friend_id: z.number().int(),
  fingerprint_type: z.string(),
  fingerprint_version: z.string(),
  audio_sha256: z.string(),
  audio_duration_seconds: z.number().nullable(),
  updated_at: z.string().meta(dateTime),
});
export type FingerprintUpsertResponse = z.infer<typeof fingerprintUpsertResponseSchema>;

/** One reference fingerprint as the matcher loads it (#278). */
export const fingerprintListItemSchema = z.object({
  track_id: z.string(),
  friend_id: z.number().int(),
  fingerprint_type: z.string(),
  fingerprint_version: z.string(),
  fingerprint_data: z.string().nullable(),
  audio_sha256: z.string(),
  audio_duration_seconds: z.number().nullable(),
});
export type FingerprintListItem = z.infer<typeof fingerprintListItemSchema>;

export const fingerprintListResponseSchema = z.object({
  fingerprints: z.array(fingerprintListItemSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});
export type FingerprintListResponse = z.infer<typeof fingerprintListResponseSchema>;

export const fingerprintListQuerySchema = z.object({
  fingerprint_type: z.string(),
  fingerprint_version: z.string(),
  friend_id: z.number().int().optional(),
  limit: z.number().int().optional(),
  offset: z.number().int().optional(),
});
export type FingerprintListQuery = z.infer<typeof fingerprintListQuerySchema>;

export const FINGERPRINT_INDEX_SCOPES = ["missing", "changed", "all", "track", "release"] as const;
export const fingerprintIndexScopeSchema = z.enum(FINGERPRINT_INDEX_SCOPES);
export type FingerprintIndexScope = z.infer<typeof fingerprintIndexScopeSchema>;

/**
 * Which slice of the library to index. Exactly one scope, so `--missing --all`
 * is rejected rather than silently resolved to one of them. The `track` and
 * `release` scopes also need `track_id` / `release_id`, which JSON Schema
 * cannot say; `refineFingerprintIndexBody` enforces it at runtime.
 */
export const fingerprintIndexBodyObjectSchema = z.object({
  scope: fingerprintIndexScopeSchema,
  track_id: z.string().min(1).optional(),
  release_id: z.string().min(1).optional(),
  friend_id: z.number().int().optional(),
  force: z.boolean().optional(),
});
export type FingerprintIndexRequest = z.infer<typeof fingerprintIndexBodyObjectSchema>;

export const refineFingerprintIndexBody = (
  value: Pick<FingerprintIndexRequest, "scope" | "track_id" | "release_id">,
  ctx: z.RefinementCtx,
) => {
  if (value.scope === "track" && !value.track_id) {
    ctx.addIssue({ code: "custom", message: "scope 'track' requires track_id" });
  }
  if (value.scope === "release" && !value.release_id) {
    ctx.addIssue({ code: "custom", message: "scope 'release' requires release_id" });
  }
};

/**
 * Counters for one indexing run.
 *
 * The four the CLI reports are `indexed` / `skipped` / `failed` / `unindexable`.
 * The last is not a failure: `tracks.local_audio_url` is nullable, so only part
 * of a library can be fingerprinted at all, and those tracks are counted at
 * resolve time and never queued.
 */
export const fingerprintIndexRunSchema = z.object({
  run_id: z.string(),
  scope: z.string(),
  fingerprint_type: z.string(),
  fingerprint_version: z.string(),
  /** Candidates queued — excludes unindexable tracks, which are never queued. */
  queued: z.number().int(),
  /** Tracks with no `local_audio_url`: reported, never treated as failures. */
  unindexable: z.number().int(),
  indexed: z.number().int(),
  skipped: z.number().int(),
  failed: z.number().int(),
  errors: z.array(z.string()),
  started_at: z.number().int().meta({ description: "Epoch milliseconds" }),
  updated_at: z.number().int().meta({ description: "Epoch milliseconds" }),
  /** True once every queued track has reached a terminal state. */
  complete: z.boolean(),
});
export type FingerprintIndexRun = z.infer<typeof fingerprintIndexRunSchema>;

export const vinylIngestJsonSchemas = {
  AcceptedIngest: z.toJSONSchema(acceptedIngestSchema),
  IngestError: z.toJSONSchema(ingestErrorSchema),
  IngestStatus: z.toJSONSchema(ingestStatusSchema),
  IngestMatchCandidate: z.toJSONSchema(ingestMatchCandidateSchema),
  IngestResultBody: z.toJSONSchema(ingestResultBodyObjectSchema, { io: "input" }),
  IngestClaimResponse: z.toJSONSchema(ingestClaimResponseSchema),
  IngestResultResponse: z.toJSONSchema(ingestResultResponseSchema),
  IngestRetentionStatus: z.toJSONSchema(ingestRetentionStatusSchema),
  IngestRecord: z.toJSONSchema(ingestRecordSchema),
  IngestListResponse: z.toJSONSchema(ingestRecentResponseSchema),
  DetectionWindow: z.toJSONSchema(detectionWindowSchema),
  DetectionListResponse: z.toJSONSchema(detectionsRecentResponseSchema),
  IngestCounters: z.toJSONSchema(ingestCountersSchema),
  IngestPipelineStats: z.toJSONSchema(ingestPipelineStatsSchema),
  FingerprintUpsertBody: z.toJSONSchema(fingerprintUpsertBodyObjectSchema, { io: "input" }),
  FingerprintUpsertResponse: z.toJSONSchema(fingerprintUpsertResponseSchema),
  FingerprintFileStatsBody: z.toJSONSchema(fingerprintFileStatsBodyObjectSchema, { io: "input" }),
  FingerprintFileStatsResponse: z.toJSONSchema(fingerprintFileStatsResponseSchema),
  FingerprintListItem: z.toJSONSchema(fingerprintListItemSchema),
  FingerprintListResponse: z.toJSONSchema(fingerprintListResponseSchema),
  FingerprintIndexScope: z.toJSONSchema(fingerprintIndexScopeSchema),
  FingerprintIndexRequest: z.toJSONSchema(fingerprintIndexBodyObjectSchema, { io: "input" }),
  FingerprintIndexRun: z.toJSONSchema(fingerprintIndexRunSchema),
} as const;

import { z } from "zod";
import { ingestMatchCandidateSchema } from "./vinylIngest.js";

/**
 * Tracklists derived from whole set recordings (#282).
 *
 * `PUT /api/set-recordings/{sha256}` takes the raw recording bytes
 * (`application/octet-stream`), so only its response is shared here; `GET` and
 * `HEAD` on the same path stream or probe the file and stay exceptions.
 */

const dateTime = { format: "date-time" } as const;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export const setRecordingSchema = z.object({
  sha256: z.string(),
  file_path: z.string(),
  original_filename: z.string().nullable(),
  format_name: z.string().nullable(),
  duration_seconds: z.number().nullable(),
  /** `bigint` columns arrive from the driver as strings. */
  size_bytes: z.union([z.number().int(), z.string()]),
  created_at: z.string().meta(dateTime),
});
export type SetRecording = z.infer<typeof setRecordingSchema>;

export const SET_DERIVATION_STATUSES = ["queued", "processing", "processed", "failed"] as const;
export const setDerivationStatusSchema = z.enum(SET_DERIVATION_STATUSES);
export type SetDerivationStatus = z.infer<typeof setDerivationStatusSchema>;

export const setDerivationSchema = z.object({
  id: z.string().meta({ format: "uuid" }),
  recording_sha256: z.string(),
  fingerprint_type: z.string(),
  fingerprint_version: z.string(),
  window_seconds: z.number(),
  step_seconds: z.number(),
  status: setDerivationStatusSchema,
  error: z.string().nullable(),
  duration_seconds: z.number().nullable(),
  created_at: z.string().meta(dateTime),
  updated_at: z.string().meta(dateTime),
  completed_at: z.string().meta(dateTime).nullable(),
});
export type SetDerivation = z.infer<typeof setDerivationSchema>;

/** `POST /api/set-derivations` also says whether it reused an equivalent run. */
export const setDerivationCreateResponseSchema = setDerivationSchema.extend({
  reused: z.boolean().optional(),
});
export type SetDerivationCreateResponse = z.infer<typeof setDerivationCreateResponseSchema>;

export const setDerivationCreateBodyObjectSchema = z.object({
  recording_sha256: z.string().regex(SHA256_PATTERN, "expected a lowercase hex sha256"),
  window_seconds: z.number().positive().optional().meta({ default: 15 }),
  step_seconds: z.number().positive().optional().meta({ default: 15 }),
  force: z.boolean().optional().meta({
    description: "Start a new run even if an equivalent one exists",
  }),
  live_set_id: z.number().int().nullable().optional().meta({
    description: "Also list the recording in this live set's media",
  }),
});
export type SetDerivationRequest = z.infer<typeof setDerivationCreateBodyObjectSchema>;

/** One window of the recording. An empty `candidates` is unidentified audio. */
export const setWindowSchema = z.object({
  start_seconds: z.number(),
  duration_seconds: z.number(),
  candidates: z.array(ingestMatchCandidateSchema).default([]),
});
export type SetWindow = z.infer<typeof setWindowSchema>;

/** The callback body from `fingerprint-set-worker`. */
export const setDerivationResultBodyObjectSchema = z.object({
  derivation_id: z.string().optional(),
  status: z.enum(["processed", "failed"]),
  error: z.string().nullable().optional(),
  fingerprint_type: z.string().nullable().optional(),
  fingerprint_version: z.string().nullable().optional(),
  sample_rate: z.number().nullable().optional(),
  duration_seconds: z.number().nullable().optional(),
  window_seconds: z.number().optional(),
  step_seconds: z.number().optional(),
  windows: z.array(setWindowSchema).default([]).meta({
    description: "Every window; an empty candidates list is unidentified audio",
  }),
});
export type SetDerivationResultBody = z.infer<typeof setDerivationResultBodyObjectSchema>;

export const setDerivationClaimResponseSchema = z.object({
  derivation_id: z.string().meta({ format: "uuid" }),
  status: setDerivationStatusSchema,
});
export type SetDerivationClaimResponse = z.infer<typeof setDerivationClaimResponseSchema>;

export const setDerivationResultResponseSchema = z.object({
  derivation_id: z.string().meta({ format: "uuid" }),
  status: setDerivationStatusSchema,
  windows: z.number().int(),
});
export type SetDerivationResultResponse = z.infer<typeof setDerivationResultResponseSchema>;

export const setDerivationViewQuerySchema = z.object({
  playlist_id: z.number().int().optional().meta({ description: "Diff against this playlist" }),
  live_set_id: z
    .number()
    .int()
    .optional()
    .meta({ description: "Diff against this live set's playlist" }),
});
export type SetDerivationViewQuery = z.infer<typeof setDerivationViewQuerySchema>;

/** Enough of a track to print a tracklist line and pair by release. */
export const setTrackRefSchema = z.object({
  track_id: z.string(),
  friend_id: z.number().int(),
  title: z.string().nullable(),
  artist: z.string().nullable(),
  release_id: z.string().nullable(),
  position: z.string().nullable(),
});
export type SetTrackRef = z.infer<typeof setTrackRefSchema>;

/** Consecutive confident windows of one track: one play. */
export const derivedPlaySchema = z.object({
  track_id: z.string(),
  friend_id: z.number().int(),
  start_seconds: z.number(),
  end_seconds: z.number(),
  confidence: z.number(),
  windows: z.number().int(),
  rate: z.number().nullable().meta({
    description: "Track seconds per recording second; ~1.0 is a record at pitch",
  }),
  track: setTrackRefSchema.nullable(),
});
export type DerivedPlay = z.infer<typeof derivedPlaySchema>;

export const unidentifiedRegionSchema = z.object({
  start_seconds: z.number(),
  end_seconds: z.number(),
  /**
   * Tracks on the releases played either side of the gap that have no
   * fingerprint, so could not have been recognised. Often the answer.
   */
  unindexed_neighbours: z.array(setTrackRefSchema),
});
export type UnidentifiedRegion = z.infer<typeof unidentifiedRegionSchema>;

export const plannedEntrySchema = setTrackRefSchema.extend({
  index: z.number().int().meta({ description: "0-based position in the playlist" }),
  fingerprinted: z.boolean().meta({
    description: "Whether this track is in the reference index at all",
  }),
});
export type PlannedEntry = z.infer<typeof plannedEntrySchema>;

/** `play` indexes into the view's `tracklist`. */
export const setDiffSchema = z.object({
  playlist_id: z.number().int(),
  played_as_planned: z.array(
    z.object({ play: z.number().int(), planned: plannedEntrySchema, out_of_order: z.boolean() }),
  ),
  played_instead_of: z.array(z.object({ play: z.number().int(), planned: plannedEntrySchema })),
  played_not_planned: z.array(z.object({ play: z.number().int() })),
  planned_not_played: z.array(plannedEntrySchema),
});
export type SetDiff = z.infer<typeof setDiffSchema>;

export const setDerivationSummarySchema = z.object({
  plays: z.number().int(),
  duration_seconds: z.number().nullable(),
  identified_seconds: z.number(),
  identified_fraction: z.number().nullable(),
});
export type SetDerivationSummary = z.infer<typeof setDerivationSummarySchema>;

export const setDerivationViewSchema = z.object({
  derivation: setDerivationSchema,
  recording: setRecordingSchema,
  summary: setDerivationSummarySchema.nullable(),
  tracklist: z.array(derivedPlaySchema),
  unidentified: z.array(unidentifiedRegionSchema),
  diff: setDiffSchema.nullable().meta({
    description: "Present when playlist_id or live_set_id is given. `play` indexes into tracklist.",
  }),
});
export type SetDerivationView = z.infer<typeof setDerivationViewSchema>;

export const setDerivationJsonSchemas = {
  SetRecording: z.toJSONSchema(setRecordingSchema),
  SetDerivationStatus: z.toJSONSchema(setDerivationStatusSchema),
  SetDerivation: z.toJSONSchema(setDerivationSchema),
  SetDerivationCreateResponse: z.toJSONSchema(setDerivationCreateResponseSchema),
  SetDerivationRequest: z.toJSONSchema(setDerivationCreateBodyObjectSchema, { io: "input" }),
  SetDerivationResultBody: z.toJSONSchema(setDerivationResultBodyObjectSchema, { io: "input" }),
  SetDerivationClaimResponse: z.toJSONSchema(setDerivationClaimResponseSchema),
  SetDerivationResultResponse: z.toJSONSchema(setDerivationResultResponseSchema),
  SetTrackRef: z.toJSONSchema(setTrackRefSchema),
  DerivedPlay: z.toJSONSchema(derivedPlaySchema),
  UnidentifiedRegion: z.toJSONSchema(unidentifiedRegionSchema),
  PlannedEntry: z.toJSONSchema(plannedEntrySchema),
  SetDiff: z.toJSONSchema(setDiffSchema),
  SetDerivationView: z.toJSONSchema(setDerivationViewSchema),
} as const;

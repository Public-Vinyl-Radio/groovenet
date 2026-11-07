import { z } from "zod";

/** A file under the audio volume that no track's `local_audio_url` resolves to. */
export const orphanFileSchema = z.object({
  /** Path relative to the audio directory. */
  path: z.string(),
  size_bytes: z.number().int().nonnegative(),
  modified_at: z.string(),
});

/** A track whose `local_audio_url` does not resolve to a file on disk. */
export const missingFileTrackSchema = z.object({
  track_id: z.string(),
  username: z.string().nullable(),
  title: z.string(),
  artist: z.string(),
  local_audio_url: z.string(),
});

function pageSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  });
}

/** What the last finished scan found, without the lists. */
export const orphanScanSummarySchema = z.object({
  scanned_at: z.string(),
  duration_ms: z.number().int().nonnegative(),
  orphan_file_count: z.number().int().nonnegative(),
  orphan_file_bytes: z.number().int().nonnegative(),
  missing_track_count: z.number().int().nonnegative(),
});

export const orphansQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(10),
  files_offset: z.coerce.number().int().min(0).default(0),
  tracks_offset: z.coerce.number().int().min(0).default(0),
});

/** `GET /api/system/storage/orphans`: the latest scan, paged. */
export const orphansResponseSchema = z.object({
  /** True while a scan is running in the app right now. */
  running: z.boolean(),
  /** Null until a scan has finished. */
  last_scan: orphanScanSummarySchema.nullable(),
  /** The last scan's error, when it failed; its results are then the previous ones. */
  last_error: z.string().nullable(),
  files: pageSchema(orphanFileSchema),
  tracks: pageSchema(missingFileTrackSchema),
});

/** `POST /api/system/storage/orphans/scan`. */
export const orphanScanStartResponseSchema = z.object({
  /** False when a scan was already running; that one carries on. */
  started: z.boolean(),
  running: z.literal(true),
});

export type OrphanFile = z.infer<typeof orphanFileSchema>;
export type MissingFileTrack = z.infer<typeof missingFileTrackSchema>;
export type OrphanScanSummary = z.infer<typeof orphanScanSummarySchema>;
export type OrphansQuery = {
  limit?: number;
  files_offset?: number;
  tracks_offset?: number;
};
export type OrphansResponse = z.infer<typeof orphansResponseSchema>;
export type OrphanScanStartResponse = z.infer<typeof orphanScanStartResponseSchema>;

export const storageJsonSchemas = {
  OrphansResponse: z.toJSONSchema(orphansResponseSchema),
  OrphanScanStartResponse: z.toJSONSchema(orphanScanStartResponseSchema),
} as const;

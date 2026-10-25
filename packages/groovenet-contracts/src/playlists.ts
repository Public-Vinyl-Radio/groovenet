import { z } from "zod";
import { liveSetSummarySchema } from "./liveSets.js";

export const playlistOptimizerModeSchema = z.enum(["genetic", "greedy", "cohesive_blocks"]);

/** A playlist entry as the API returns it: a reference to a track, not the track itself. */
export const playlistTrackRefSchema = z.object({
  track_id: z.string(),
  friend_id: z.number().int(),
  position: z.number().int(),
});

/** A track supplied when creating or replacing a playlist's contents. */
export const playlistTrackInputSchema = z
  .object({
    track_id: z.string(),
    friend_id: z.number().int().optional(),
    username: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    artist: z.string().nullable().optional(),
    album: z.string().nullable().optional(),
    year: z.union([z.string(), z.number()]).nullable().optional(),
    styles: z.array(z.string()).nullable().optional(),
    genres: z.array(z.string()).nullable().optional(),
    duration: z.string().nullable().optional(),
    duration_seconds: z.number().nullable().optional(),
    position: z.union([z.string(), z.number()]).nullable().optional(),
    discogs_url: z.string().nullable().optional(),
    apple_music_url: z.string().nullable().optional(),
    youtube_url: z.string().nullable().optional(),
    spotify_url: z.string().nullable().optional(),
    soundcloud_url: z.string().nullable().optional(),
    album_thumbnail: z.string().nullable().optional(),
    local_tags: z.string().nullable().optional(),
    bpm: z.union([z.number(), z.string()]).nullable().optional(),
    key: z.string().nullable().optional(),
    danceability: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
    star_rating: z.number().nullable().optional(),
    release_id: z.string().nullable().optional(),
    mood_happy: z.number().nullable().optional(),
    mood_sad: z.number().nullable().optional(),
    mood_relaxed: z.number().nullable().optional(),
    mood_aggressive: z.number().nullable().optional(),
    local_audio_url: z.string().nullable().optional(),
  })
  .passthrough();

export const playlistSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    created_at: z.string(),
    total_duration_seconds: z.number().optional(),
    tracks: z.array(playlistTrackRefSchema),
    /** Album art of the first four tracks that have one, in position order. List endpoint only. */
    cover_urls: z.array(z.string()).optional(),
    set: liveSetSummarySchema.optional(),
  })
  .passthrough();

export const playlistCreateSchema = z
  .object({
    name: z.string(),
    tracks: z.array(playlistTrackInputSchema).optional().default([]),
    default_friend_id: z.number().int().optional(),
  })
  .passthrough();

/** Bare track ids keep the entry's existing friend; objects can carry one. */
export const playlistUpdateSchema = z
  .object({
    id: z.number().int(),
    name: z.string().optional(),
    tracks: z.array(z.union([z.string(), playlistTrackInputSchema])).optional(),
    default_friend_id: z.number().int().optional(),
  })
  .passthrough();

export const playlistDetailSchema = z.object({
  playlist_id: z.number().int(),
  playlist_name: z.string().nullable().optional(),
  tracks: z.array(playlistTrackRefSchema),
});

export const playlistDeleteResponseSchema = z.object({ success: z.literal(true) });

export const playlistSpinsInputSchema = z
  .object({
    performed_at: z
      .string()
      .min(1)
      .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid timestamp")
      .optional(),
    performance_id: z.number().int().positive().optional(),
    derivation_id: z.string().uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.performed_at != null && value.performance_id != null) {
      ctx.addIssue({
        code: "custom",
        message: "Provide either performed_at or performance_id, not both",
      });
    }
  });

export const playlistSpinsResultSchema = z.object({
  playlist_id: z.number().int(),
  performance_id: z.number().int().nullable(),
  performed_at: z.string(),
  created: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

export const playlistGeneticTrackSchema = z
  .object({
    track_id: z.string().min(1),
    friend_id: z.number().int().optional(),
    bpm: z.union([z.number(), z.string()]).nullable().optional(),
  })
  .passthrough();

export const playlistGeneticRequestSchema = z.object({
  playlist: z.array(playlistGeneticTrackSchema).min(1),
  mode: playlistOptimizerModeSchema.optional(),
});

export const playlistGeneticResultTrackSchema = z
  .object({ track_id: z.string().min(1) })
  .passthrough();

export const playlistGeneticResponseSchema = z
  .object({
    mode: playlistOptimizerModeSchema.optional(),
    result: z.union([
      z.array(playlistGeneticResultTrackSchema),
      z.record(z.string(), playlistGeneticResultTrackSchema),
    ]),
  })
  .passthrough();

export const playlistGeneticInvalidItemSchema = z.object({
  track_id: z.string().optional(),
  reason: z.string(),
});

export const playlistGeneticValidationErrorSchema = z.object({
  error: z.string(),
  invalid: z.array(playlistGeneticInvalidItemSchema),
  invalid_count: z.number().int(),
});

export type PlaylistOptimizerMode = z.infer<typeof playlistOptimizerModeSchema>;
export type PlaylistTrackRef = z.infer<typeof playlistTrackRefSchema>;
export type PlaylistTrackInput = z.infer<typeof playlistTrackInputSchema>;
export type Playlist = z.infer<typeof playlistSchema>;
export type PlaylistCreate = z.input<typeof playlistCreateSchema>;
export type PlaylistUpdate = z.infer<typeof playlistUpdateSchema>;
export type PlaylistDetail = z.infer<typeof playlistDetailSchema>;
export type PlaylistDeleteResponse = z.infer<typeof playlistDeleteResponseSchema>;
export type PlaylistSpinsInput = z.infer<typeof playlistSpinsInputSchema>;
export type PlaylistSpinsResult = z.infer<typeof playlistSpinsResultSchema>;
export type PlaylistGeneticRequest = z.infer<typeof playlistGeneticRequestSchema>;
export type PlaylistGeneticResponse = z.infer<typeof playlistGeneticResponseSchema>;
export type PlaylistGeneticValidationError = z.infer<typeof playlistGeneticValidationErrorSchema>;

export const playlistJsonSchemas = {
  PlaylistOptimizerMode: z.toJSONSchema(playlistOptimizerModeSchema),
  PlaylistTrackRef: z.toJSONSchema(playlistTrackRefSchema),
  PlaylistTrackInput: z.toJSONSchema(playlistTrackInputSchema),
  Playlist: z.toJSONSchema(playlistSchema),
  PlaylistCreate: z.toJSONSchema(playlistCreateSchema, { io: "input" }),
  PlaylistUpdate: z.toJSONSchema(playlistUpdateSchema),
  PlaylistDetail: z.toJSONSchema(playlistDetailSchema),
  PlaylistDeleteResponse: z.toJSONSchema(playlistDeleteResponseSchema),
  PlaylistSpinsInput: z.toJSONSchema(playlistSpinsInputSchema, { io: "input" }),
  PlaylistSpinsResult: z.toJSONSchema(playlistSpinsResultSchema),
  PlaylistGeneticRequest: z.toJSONSchema(playlistGeneticRequestSchema),
  PlaylistGeneticResponse: z.toJSONSchema(playlistGeneticResponseSchema),
  PlaylistGeneticValidationError: z.toJSONSchema(playlistGeneticValidationErrorSchema),
};

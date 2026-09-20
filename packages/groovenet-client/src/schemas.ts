// Subset of Zod schemas relevant to external consumers.
// Copied from my-collection-search/src/api-contract/schemas.ts — Next.js app is source of truth.

import { z } from "zod";

const toInt = (value: unknown): unknown => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return value;
};

export const intFromInputSchema = z.preprocess(toInt, z.number().int());
export const nonNegativeIntFromInputSchema = z.preprocess(
  toInt,
  z.number().int().min(0)
);

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

export type PlaylistTrackInput = z.infer<typeof playlistTrackInputSchema>;

export const trackEntitySchema = z
  .object({
    track_id: z.string(),
    friend_id: z.number().int(),
    title: z.string(),
    artist: z.string(),
    album: z.string(),
    year: z.union([z.string(), z.number()]).nullable().optional(),
    duration: z.string().optional(),
    duration_seconds: z.number().nullable().optional(),
    position: z.union([z.string(), z.number()]).optional(),
    release_id: z.string().nullable().optional(),
    library_identifier: z.string().nullable().optional(),
  })
  .passthrough();

export const trackSearchGetQuerySchema = z.object({
  q: z.string().optional().default(""),
  limit: nonNegativeIntFromInputSchema.optional().default(20),
  offset: nonNegativeIntFromInputSchema.optional().default(0),
  filter: z.string().optional(),
});

export const trackSearchGetResponseSchema = z.object({
  estimatedTotalHits: z.number().int(),
  offset: z.number().int(),
  limit: z.number().int(),
  processingTimeMs: z.number().int(),
  hits: z.array(z.unknown()),
});

export const playlistGeneticBodySchema = z.object({
  playlist: z
    .array(
      z
        .object({
          track_id: z.string().min(1),
          friend_id: z.number().int().optional(),
          bpm: z.union([z.number(), z.string()]).nullable().optional(),
          embedding: z
            .union([z.string(), z.array(z.number())])
            .nullable()
            .optional(),
        })
        .passthrough()
    )
    .min(1),
});

export const playlistGeneticResponseSchema = z
  .object({
    result: z.union([
      z.array(z.object({ track_id: z.string().min(1) }).passthrough()),
      z.record(z.string(), z.object({ track_id: z.string().min(1) }).passthrough()),
    ]),
  })
  .passthrough();

export const jobInfoSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    state: z.enum(["waiting", "active", "completed", "failed"]),
    progress: z.number(),
    data: z.object({}).passthrough(),
    returnvalue: z.unknown().optional(),
    finishedOn: z.number().optional(),
    failedReason: z.string().optional(),
    attemptsMade: z.number().int(),
    processedOn: z.number().optional(),
    queue: z.string(),
  })
  .passthrough();

export const localPlaybackControlBodySchema = z.object({
  action: z.enum(["play", "pause", "resume", "stop", "seek", "volume"]),
  filename: z.string().optional(),
  seconds: z.number().optional(),
  volume: z.number().optional(),
});

export const localPlaybackControlResponseSchema = z.object({
  success: z.boolean(),
  status: z.unknown().optional(),
  volume: z.number().optional(),
});

export const albumEntitySchema = z
  .object({
    release_id: z.string(),
    friend_id: z.number().int(),
    username: z.string().optional(),
    title: z.string(),
    artist: z.string(),
    year: z.string().optional(),
    genres: z.array(z.string()).optional(),
    styles: z.array(z.string()).optional(),
    album_thumbnail: z.string().optional(),
    audio_file_album_art_url: z.string().optional(),
    discogs_url: z.string().optional(),
    date_added: z.string().optional(),
    date_changed: z.string().optional(),
    track_count: z.number().int(),
    album_rating: z.number().optional(),
    album_notes: z.string().optional(),
    purchase_price: z.number().optional(),
    condition: z.string().optional(),
    label: z.string().optional(),
    catalog_number: z.string().optional(),
    country: z.string().optional(),
    format: z.string().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    library_identifier: z.string().nullable().optional(),
  })
  .passthrough();

export const albumPlayableStructureTrackSchema = z
  .object({
    track_id: z.string(),
    friend_id: z.number().int(),
    position: z.union([z.string(), z.number()]).nullable().optional(),
    title: z.string(),
    artist: z.string(),
  })
  .passthrough();

export const albumPlayableStructureSideSchema = z.object({
  side_key: z.string(),
  side_label: z.string(),
  ordinal: z.number().int(),
  track_count: z.number().int(),
  tracks: z.array(albumPlayableStructureTrackSchema),
});

export const albumPlayableStructureResponseSchema = z.object({
  album: albumEntitySchema,
  sides: z.array(albumPlayableStructureSideSchema),
});

export const spinTrackRefSchema = z.object({
  track_id: z.string().min(1),
  friend_id: z.number().int(),
});

export const spinSessionSchema = z.object({
  id: z.number().int(),
  friend_id: z.number().int(),
  release_id: z.string(),
  medium: z.literal("vinyl"),
  selection_mode: z.enum(["sides", "tracks"]),
  played_at: z.string(),
  note: z.string().nullable().optional(),
  context_type: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const spinSelectionSchema = z.object({
  id: z.number().int().optional(),
  session_id: z.number().int().optional(),
  ordinal: z.number().int(),
  selection_type: z.enum(["side", "track"]),
  side_key: z.string().nullable().optional(),
  track_id: z.string().nullable().optional(),
  friend_id: z.number().int().nullable().optional(),
  position_snapshot: z.string().nullable().optional(),
  created_at: z.string().optional(),
});

export const trackSpinEventSchema = z.object({
  id: z.number().int().optional(),
  session_id: z.number().int().optional(),
  friend_id: z.number().int(),
  release_id: z.string(),
  track_id: z.string(),
  played_at: z.string(),
  ordinal: z.number().int(),
  side_key: z.string().nullable().optional(),
  position_snapshot: z.string().nullable().optional(),
  title_snapshot: z.string().optional(),
  artist_snapshot: z.string().optional(),
  album_snapshot: z.string().optional(),
  created_at: z.string().optional(),
});

export const spinDerivedSchema = z.object({
  is_full_album_spin: z.boolean(),
  selected_side_count: z.number().int(),
  album_side_count: z.number().int(),
  track_count: z.number().int(),
});

export const spinCreateBodySchema = z
  .object({
    friend_id: intFromInputSchema,
    release_id: z.string().min(1),
    played_at: z.string().min(1),
    note: z.string().nullable().optional(),
    context_type: z.string().nullable().optional(),
    side_keys: z.array(z.string().min(1)).optional(),
    track_refs: z.array(spinTrackRefSchema).optional(),
  })
  .superRefine((value, ctx) => {
    const hasSides = Array.isArray(value.side_keys) && value.side_keys.length > 0;
    const hasTracks = Array.isArray(value.track_refs) && value.track_refs.length > 0;

    if (hasSides === hasTracks) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of side_keys or track_refs",
      });
    }
  });

export const spinCreateResponseSchema = z.object({
  session: spinSessionSchema,
  selections: z.array(spinSelectionSchema),
  expanded_tracks: z.array(trackSpinEventSchema),
  derived: spinDerivedSchema,
});

export const spinListQuerySchema = z.object({
  friend_id: intFromInputSchema,
  release_id: z.string().optional(),
  track_id: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: nonNegativeIntFromInputSchema.optional().default(50),
  offset: nonNegativeIntFromInputSchema.optional().default(0),
});

export const spinListItemSchema = z.object({
  session: spinSessionSchema,
  selections: z.array(spinSelectionSchema),
  track_events: z.array(trackSpinEventSchema),
  derived: spinDerivedSchema,
});

export const spinListResponseSchema = z.object({
  items: z.array(spinListItemSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});

export const spinDeleteResponseSchema = z.object({
  success: z.boolean(),
  session: spinSessionSchema,
});

export const spinTopTracksQuerySchema = z.object({
  friend_id: intFromInputSchema,
  release_id: z.string().optional(),
  limit: nonNegativeIntFromInputSchema.optional().default(20),
  offset: nonNegativeIntFromInputSchema.optional().default(0),
});

export const spinTopTrackItemSchema = z.object({
  friend_id: z.number().int(),
  release_id: z.string(),
  track_id: z.string(),
  play_count: z.number().int(),
  last_played_at: z.string(),
  title_snapshot: z.string(),
  artist_snapshot: z.string(),
  album_snapshot: z.string(),
  side_key: z.string().nullable().optional(),
  position_snapshot: z.string().nullable().optional(),
});

export const spinTopTracksResponseSchema = z.object({
  items: z.array(spinTopTrackItemSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});

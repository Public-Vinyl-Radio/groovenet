import { z } from "zod";

/** A taxonomy genre as linked to a track, with its parent for display (#371). */
export const trackGenreSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  parent_id: z.string().uuid().nullable(),
  parent_name: z.string().nullable(),
});

/** A genre a widened search filter added (#485): the removable "+ Chicha, Porro" chip. */
export const genreFilterRefSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
});

export const trackSearchModeSchema = z.enum(["lexical", "semantic", "hybrid"]);

/**
 * The full track entity. Only the identifying fields are required on the wire;
 * the database may return more columns, so unknown keys pass through.
 */
const trackShape = z.object({
  id: z.number().int().optional(),
  track_id: z.string(),
  friend_id: z.number().int(),
  isrc: z.string().nullable().optional(),
  title: z.string(),
  artist: z.string(),
  album: z.string().nullable(),
  year: z.union([z.string(), z.number()]).nullable().optional(),
  styles: z.array(z.string()).nullable().optional(),
  genres: z.array(z.string()).nullable().optional(),
  album_genres: z.array(z.string()).optional(),
  album_styles: z.array(z.string()).optional(),
  duration: z.string().nullable().optional(),
  duration_seconds: z.number().nullable().optional(),
  position: z.union([z.string(), z.number()]).nullable().optional(),
  discogs_url: z.string().nullable().optional(),
  apple_music_url: z.string().nullable().optional(),
  youtube_url: z.string().nullable().optional(),
  spotify_url: z.string().nullable().optional(),
  soundcloud_url: z.string().nullable().optional(),
  album_thumbnail: z.string().nullable().optional(),
  /** Raw free-text genres; superseded by track_genres once reconciled (#371). */
  local_tags: z.string().nullable().optional(),
  /** Track-level DJ genres: links to the canonical taxonomy (#371). */
  track_genres: z.array(trackGenreSchema).optional(),
  /** Normalised mood and description words, kept out of genres (#371). */
  descriptors: z.array(z.string()).optional(),
  composer: z.string().nullable().optional(),
  bpm: z.union([z.string(), z.number()]).nullable().optional(),
  key: z.string().nullable().optional(),
  /** Confidence (0-1) of the EDMA key estimate stored in `key` (#524). */
  key_confidence: z.number().nullable().optional(),
  /** Margin (0-1) between the first and second beat-histogram peaks behind `bpm` (#531). */
  bpm_confidence: z.number().nullable().optional(),
  danceability: z.union([z.number(), z.string()]).nullable().optional(),
  mood_happy: z.number().nullable().optional(),
  mood_sad: z.number().nullable().optional(),
  mood_relaxed: z.number().nullable().optional(),
  mood_aggressive: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  local_audio_url: z.string().nullable().optional(),
  audio_file_album_art_url: z.string().nullable().optional(),
  star_rating: z.number().nullable().optional(),
  username: z.string().optional(),
  release_id: z.string().nullable().optional(),
  library_identifier: z.string().nullable().optional(),
  hasVectors: z.boolean().optional(),
  deleted_at: z.string().nullable().optional(),
});
export const trackSchema = trackShape.passthrough();

const searchMetaShape = {
  estimatedTotalHits: z.number().int(),
  offset: z.number().int(),
  limit: z.number().int(),
  processingTimeMs: z.number().int(),
};

/** Wire shape of `GET /api/tracks/search` query params once coerced from strings. */
export const trackSearchQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.number().int().min(0).optional(),
  offset: z.number().int().min(0).optional(),
  friend_id: z.number().int().optional(),
  filter: z.string().optional(),
  mode: trackSearchModeSchema.optional(),
  bpm_min: z.number().optional(),
  bpm_max: z.number().optional(),
  key: z.string().optional(),
  star_rating: z.number().int().min(0).max(5).optional(),
  genre: z.array(z.string()).max(20).optional(),
  include_similar: z.boolean().optional(),
  similar_limit: z.number().int().min(0).optional(),
  similar_exclude: z.array(z.string()).max(20).optional(),
});

export const trackSearchResponseSchema = z.object({
  ...searchMetaShape,
  hits: z.array(trackSchema),
  /** Genres `include_similar` added beyond the plain `genre` filter (#485). */
  added_genres: z.array(genreFilterRefSchema).optional(),
  /** The mode that ranked these hits; omitted for a plain lexical request. */
  mode: trackSearchModeSchema.optional(),
  /** Hybrid fell back to lexical alone because the semantic leg failed. */
  degraded: z.boolean().optional(),
});

export const trackPlaylistCountRefSchema = z.object({
  track_id: z.string().min(1),
  friend_id: z.number().int(),
});
export const trackPlaylistCountsRequestSchema = z.object({
  track_refs: z.array(trackPlaylistCountRefSchema),
});
export const trackPlaylistCountsResponseSchema = z.record(z.string(), z.number().int());

export const trackPlaylistMembershipSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  position: z.number().int(),
});
export const trackPlaylistsResponseSchema = z.object({
  playlists: z.array(trackPlaylistMembershipSchema).optional(),
});

export const trackAudioMetadataEmbeddedCoverSchema = z
  .object({
    index: z.number().int(),
    codec_name: z.string().optional(),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
    pix_fmt: z.string().optional(),
  })
  .passthrough();

export const trackAudioMetadataSchema = z.object({
  track_id: z.string(),
  friend_id: z.number().int(),
  local_audio_url: z.string(),
  audio_file_album_art_url: z.string().nullable().optional(),
  has_embedded_cover: z.boolean(),
  embedded_cover: trackAudioMetadataEmbeddedCoverSchema.nullable().optional(),
  probe: z.unknown(),
});

export const trackExtractEmbeddedCoverResponseSchema = z
  .object({
    success: z.boolean(),
    audio_file_album_art_url: z.string(),
    message: z.string(),
  })
  .passthrough();

export const trackEssentiaSchema = z.object({
  track_id: z.string(),
  friend_id: z.number().int(),
  file_path: z.string(),
  data: z.unknown(),
});

export const trackDeleteResponseSchema = z.object({
  success: z.boolean(),
  track_id: z.string(),
  friend_id: z.number().int(),
});

/** `POST /api/tracks/{id}/restore`: the restored row, with its deleted_at cleared. */
export const trackRestoreResponseSchema = z.object({
  success: z.boolean(),
  track_id: z.string(),
  friend_id: z.number().int(),
  track: trackSchema,
});

/** `POST /api/tracks/{id}/audio-metadata` body: which friend's copy to extract the cover for. */
export const trackExtractEmbeddedCoverRequestSchema = z.object({
  friend_id: z.number().int(),
});

/** Which text an embedding preview renders (`type` query parameter). */
export const trackEmbeddingPreviewTypeSchema = z.enum(["identity", "audio_vibe", "context"]);

export const trackIdentityEmbeddingDataSchema = z.object({
  title: z.string(),
  artist: z.string(),
  album: z.string(),
  era: z.string(),
  country: z.string(),
  labels: z.array(z.string()),
  composers: z.array(z.string()),
  genres: z.array(z.string()),
  styles: z.array(z.string()),
  tags: z.array(z.string()),
});

export const trackAudioVibeEmbeddingDataSchema = z.object({
  bpm: z.string(),
  bpmRange: z.string(),
  key: z.string(),
  camelot: z.string(),
  danceability: z.string(),
  energy: z.string(),
  dominantMood: z.string(),
  moodProfile: z.string(),
  vibeDescriptors: z.array(z.string()),
  acoustic: z.string().optional(),
  vocalPresence: z.string().optional(),
  percussiveness: z.string().optional(),
  partyMood: z.string().optional(),
});

export const trackIdentityEmbeddingPreviewSchema = z.object({
  type: z.literal("identity"),
  text: z.string(),
  data: trackIdentityEmbeddingDataSchema,
});

export const trackAudioVibeEmbeddingPreviewSchema = z.object({
  type: z.literal("audio_vibe"),
  text: z.string(),
  data: trackAudioVibeEmbeddingDataSchema,
});

/** Built from the same normalized data as identity, rendered for retrieval (#408). */
export const trackContextEmbeddingPreviewSchema = z.object({
  type: z.literal("context"),
  text: z.string(),
  data: trackIdentityEmbeddingDataSchema,
});

export const trackEmbeddingPreviewSchema = z.discriminatedUnion("type", [
  trackIdentityEmbeddingPreviewSchema,
  trackAudioVibeEmbeddingPreviewSchema,
  trackContextEmbeddingPreviewSchema,
]);

/** Downloaders `analyze-async` can ask the worker to prefer. */
export const trackPreferredDownloaderSchema = z.enum(["freyr", "spotdl", "yt-dlp", "scdl"]);

/**
 * `POST /api/tracks/analyze-async` body. At least one URL is required; that
 * rule is checked by the route (it is not expressible in JSON Schema).
 */
export const trackAnalyzeAsyncRequestSchema = z.object({
  track_id: z.string().min(1),
  friend_id: z.number().int(),
  apple_music_url: z.string().nullish(),
  youtube_url: z.string().nullish(),
  soundcloud_url: z.string().nullish(),
  preferred_downloader: trackPreferredDownloaderSchema.optional(),
  title: z.string().optional(),
  artist: z.string().optional(),
});

export const trackAnalyzeAsyncResponseSchema = z.object({
  success: z.boolean(),
  jobId: z.string(),
  message: z.string(),
});

/** `POST /api/tracks/fix-duration` body. */
export const trackFixDurationRequestSchema = z.object({
  track_id: z.string().min(1),
  friend_id: z.number().int(),
  local_audio_url: z.string().nullish(),
});

export const trackFixDurationResponseSchema = z.object({
  success: z.boolean(),
  jobId: z.string(),
});

/** Per-genre track counts for the current search, subgenres included (#375). */
export const trackGenreFacetsResponseSchema = z.object({
  genres: z.array(
    z.object({
      id: z.string().meta({ format: "uuid" }),
      track_count: z.number().int(),
    }),
  ),
});

export type TrackGenre = z.infer<typeof trackGenreSchema>;
export type GenreFilterRef = z.infer<typeof genreFilterRefSchema>;
export type TrackSearchMode = z.infer<typeof trackSearchModeSchema>;
/** Declared fields only; the schema itself passes unknown columns through. */
export type TrackEntity = z.infer<typeof trackShape>;
export type TrackSearchQuery = z.infer<typeof trackSearchQuerySchema>;
export type TrackSearchResponse = z.infer<typeof trackSearchResponseSchema>;
export type TrackPlaylistCountsRequest = z.infer<typeof trackPlaylistCountsRequestSchema>;
export type TrackPlaylistCountsResponse = z.infer<typeof trackPlaylistCountsResponseSchema>;
export type TrackPlaylistMembership = z.infer<typeof trackPlaylistMembershipSchema>;
export type TrackPlaylistsResponse = z.infer<typeof trackPlaylistsResponseSchema>;
export type TrackAudioMetadata = z.infer<typeof trackAudioMetadataSchema>;
export type TrackExtractEmbeddedCoverResponse = z.infer<
  typeof trackExtractEmbeddedCoverResponseSchema
>;
export type TrackEssentia = z.infer<typeof trackEssentiaSchema>;
export type TrackDeleteResponse = z.infer<typeof trackDeleteResponseSchema>;

export type TrackRestoreResponse = z.infer<typeof trackRestoreResponseSchema>;
export type TrackExtractEmbeddedCoverRequest = z.infer<
  typeof trackExtractEmbeddedCoverRequestSchema
>;
export type TrackEmbeddingPreviewType = z.infer<typeof trackEmbeddingPreviewTypeSchema>;
export type TrackIdentityEmbeddingData = z.infer<typeof trackIdentityEmbeddingDataSchema>;
export type TrackAudioVibeEmbeddingData = z.infer<typeof trackAudioVibeEmbeddingDataSchema>;
export type TrackEmbeddingPreview = z.infer<typeof trackEmbeddingPreviewSchema>;
export type TrackPreferredDownloader = z.infer<typeof trackPreferredDownloaderSchema>;
export type TrackAnalyzeAsyncRequest = z.infer<typeof trackAnalyzeAsyncRequestSchema>;
export type TrackAnalyzeAsyncResponse = z.infer<typeof trackAnalyzeAsyncResponseSchema>;
export type TrackFixDurationRequest = z.infer<typeof trackFixDurationRequestSchema>;
export type TrackFixDurationResponse = z.infer<typeof trackFixDurationResponseSchema>;
export type TrackGenreFacetsResponse = z.infer<typeof trackGenreFacetsResponseSchema>;

export const trackJsonSchemas = {
  TrackGenre: z.toJSONSchema(trackGenreSchema),
  GenreFilterRef: z.toJSONSchema(genreFilterRefSchema),
  TrackSearchMode: z.toJSONSchema(trackSearchModeSchema),
  Track: z.toJSONSchema(trackSchema),
  TrackSearchResponse: z.toJSONSchema(trackSearchResponseSchema),
  TrackPlaylistCountsRequest: z.toJSONSchema(trackPlaylistCountsRequestSchema),
  TrackPlaylistCountsResponse: z.toJSONSchema(trackPlaylistCountsResponseSchema),
  TrackPlaylistsResponse: z.toJSONSchema(trackPlaylistsResponseSchema),
  TrackAudioMetadata: z.toJSONSchema(trackAudioMetadataSchema),
  TrackExtractEmbeddedCoverResponse: z.toJSONSchema(trackExtractEmbeddedCoverResponseSchema),
  TrackEssentia: z.toJSONSchema(trackEssentiaSchema),
  TrackDeleteResponse: z.toJSONSchema(trackDeleteResponseSchema),
  TrackRestoreResponse: z.toJSONSchema(trackRestoreResponseSchema),
  TrackExtractEmbeddedCoverRequest: z.toJSONSchema(trackExtractEmbeddedCoverRequestSchema, {
    io: "input",
  }),
  TrackEmbeddingPreviewType: z.toJSONSchema(trackEmbeddingPreviewTypeSchema),
  TrackEmbeddingPreview: z.toJSONSchema(trackEmbeddingPreviewSchema),
  TrackAnalyzeAsyncRequest: z.toJSONSchema(trackAnalyzeAsyncRequestSchema, { io: "input" }),
  TrackAnalyzeAsyncResponse: z.toJSONSchema(trackAnalyzeAsyncResponseSchema),
  TrackFixDurationRequest: z.toJSONSchema(trackFixDurationRequestSchema, { io: "input" }),
  TrackFixDurationResponse: z.toJSONSchema(trackFixDurationResponseSchema),
  TrackGenreFacetsResponse: z.toJSONSchema(trackGenreFacetsResponseSchema),
};

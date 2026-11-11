import { z } from "zod";
import {
  artistCreditsFieldSchema,
  artistFilterQueryShape,
  artistFilterResponseShape,
} from "./artistCredits.js";

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

/** Provenance of the local audio file, independent of its available remote links. */
export const audioSourceSchema = z.enum([
  "apple_music",
  "youtube",
  "soundcloud",
  "upload",
  "unknown",
]);

export const trackAudioFileFieldsSchema = z.object({
  audio_source: audioSourceSchema.nullish(),
  audio_codec: z.string().nullish(),
  audio_container: z.string().nullish(),
  audio_sample_rate: z.number().int().positive().nullish(),
  audio_bit_depth: z.number().int().positive().nullish(),
  audio_bitrate: z.number().int().positive().nullish(),
  audio_channels: z.number().int().positive().nullish(),
  // pg returns bigint columns as decimal strings.
  audio_size_bytes: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).nullish(),
  audio_lossless: z.boolean().nullish(),
  audio_probed_at: z.string().nullish(),
});
export type TrackAudioFileFields = z.infer<typeof trackAudioFileFieldsSchema>;

/** Which tracks a backfill probes: everything unless narrowed to one friend's library. */
export const audioMetadataBackfillRequestSchema = z.object({
  friend_id: z.number().int().optional(),
  /** Probe again even when the track was probed after its file last changed. */
  force: z.boolean().optional(),
});
export type AudioMetadataBackfillRequest = z.infer<typeof audioMetadataBackfillRequestSchema>;

/**
 * Progress and report for one audio-metadata backfill (#1049).
 *
 * Every candidate lands in exactly one of `probed`, `skipped`, `missing_files`
 * or `probe_failures`; `complete` is true once they add up to `total`.
 */
export const audioMetadataBackfillRunSchema = z.object({
  run_id: z.string(),
  /** Tracks with a `local_audio_url`, whether or not they need probing. */
  total: z.number().int(),
  probed: z.number().int(),
  /** Already probed after the file's mtime (never with `force`). */
  skipped: z.number().int(),
  /** `local_audio_url` set but no such file in the audio directory. */
  missing_files: z.number().int(),
  probe_failures: z.number().int(),
  /** Source of each track probed in this run. */
  sources: z.object({
    apple_music: z.number().int(),
    youtube: z.number().int(),
    soundcloud: z.number().int(),
    upload: z.number().int(),
    unknown: z.number().int(),
  }),
  /** Subset of `sources.unknown`: Opus/WebM with no URL tag, a weak YouTube hint. */
  weak_youtube_hints: z.number().int(),
  errors: z.array(z.string()),
  started_at: z.number().int().meta({ description: "Epoch milliseconds" }),
  updated_at: z.number().int().meta({ description: "Epoch milliseconds" }),
  complete: z.boolean(),
});
export type AudioMetadataBackfillRun = z.infer<typeof audioMetadataBackfillRunSchema>;

/** Which tracks an embedded-tags backfill reads: everything unless narrowed to one friend. */
export const embeddedTagsBackfillRequestSchema = z.object({
  friend_id: z.number().int().optional(),
  /** Read again even when the track was read after its file last changed. */
  force: z.boolean().optional(),
});
export type EmbeddedTagsBackfillRequest = z.infer<typeof embeddedTagsBackfillRequestSchema>;

/**
 * Progress and report for one embedded-tags backfill (#673).
 *
 * Every candidate lands in exactly one of `read`, `skipped`, `missing_files` or
 * `read_failures`; `complete` is true once they add up to `total`. The `with_*`
 * counts say how many of the tracks read carried each tag, so a library of
 * instrumentals reads as zero lyrics rather than as a failure.
 */
export const embeddedTagsBackfillRunSchema = z.object({
  run_id: z.string(),
  /** Tracks with a `local_audio_url`, whether or not they need reading. */
  total: z.number().int(),
  read: z.number().int(),
  /** Already read after the file's mtime (never with `force`). */
  skipped: z.number().int(),
  missing_files: z.number().int(),
  read_failures: z.number().int(),
  with_composer: z.number().int(),
  with_genre: z.number().int(),
  with_lyrics: z.number().int(),
  /**
   * Tracks whose composer this run filled, queued for new identity and context
   * embeddings (#1169). A composer already set, or a forced re-read that
   * changes nothing, queues nothing.
   */
  queued_embeddings: z.number().int(),
  errors: z.array(z.string()),
  started_at: z.number().int().meta({ description: "Epoch milliseconds" }),
  updated_at: z.number().int().meta({ description: "Epoch milliseconds" }),
  complete: z.boolean(),
});
export type EmbeddedTagsBackfillRun = z.infer<typeof embeddedTagsBackfillRunSchema>;

/** Which tracks an ISRC backfill resolves: everything unless narrowed to one friend or capped. */
export const isrcBackfillRequestSchema = z.object({
  friend_id: z.number().int().optional(),
  /** Ask Apple again even for a track that already has an ISRC or was already checked. */
  force: z.boolean().optional(),
  /** Resolve at most this many tracks; the rest are left for the next run. */
  limit: z.number().int().positive().optional(),
  /** Resolve and report, but store nothing. */
  dry_run: z.boolean().optional(),
});
export type IsrcBackfillRequest = z.infer<typeof isrcBackfillRequestSchema>;

/**
 * Progress and report for one ISRC backfill (#1156).
 *
 * Every track in scope lands in exactly one of `filled`, `skipped`, `no_link`,
 * `not_found` or `failed`; `complete` is true once they add up to `total`. With
 * `dry_run`, `filled` counts the ISRCs that would have been stored.
 */
export const isrcBackfillRunSchema = z.object({
  run_id: z.string(),
  /** Tracks in scope: live tracks, or the ones a `limit` kept. */
  total: z.number().int(),
  filled: z.number().int(),
  /** Already has an ISRC, or was checked and Apple had none (never with `force`). */
  skipped: z.number().int(),
  /** No Apple Music link, or one that names no song (an album link). */
  no_link: z.number().int(),
  /** Apple returned the song without an ISRC, or did not return it. */
  not_found: z.number().int(),
  /** The lookup failed (rate limit, outage); the track is retried on the next run. */
  failed: z.number().int(),
  dry_run: z.boolean(),
  errors: z.array(z.string()),
  started_at: z.number().int().meta({ description: "Epoch milliseconds" }),
  updated_at: z.number().int().meta({ description: "Epoch milliseconds" }),
  complete: z.boolean(),
});
export type IsrcBackfillRun = z.infer<typeof isrcBackfillRunSchema>;

/**
 * The full track entity. Only the identifying fields are required on the wire;
 * the database may return more columns, so unknown keys pass through.
 */
const trackShape = z.object({
  ...trackAudioFileFieldsSchema.shape,
  id: z.number().int().optional(),
  track_id: z.string(),
  friend_id: z.number().int(),
  /** 12 characters, upper case, no hyphens (#1156). */
  isrc: z.string().nullable().optional(),
  title: z.string(),
  artist: z.string(),
  artists: artistCreditsFieldSchema,
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
  /**
   * Genre names the audio file declares (Apple/ID3 taxonomy). Evidence only:
   * never mixed into `local_tags` or `track_genres`, the DJ's own genres (#673).
   */
  audio_file_genre: z.array(z.string()).nullable().optional(),
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
  ...artistFilterQueryShape,
});

export const trackSearchResponseSchema = z.object({
  ...searchMetaShape,
  hits: z.array(trackSchema),
  /** Genres `include_similar` added beyond the plain `genre` filter (#485). */
  added_genres: z.array(genreFilterRefSchema).optional(),
  ...artistFilterResponseShape,
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

/**
 * Who wrote a track's lyrics (#1171): `embedded` came from the audio file and
 * a re-read refreshes it; `user` was typed in and a re-read never touches it.
 */
export const trackLyricsSourceSchema = z.enum(["embedded", "user"]);

/** `GET /api/tracks/{id}/lyrics`: owner-only, 404 when the track has none. */
export const trackLyricsSchema = z.object({
  text: z.string(),
  source: trackLyricsSourceSchema,
  updated_at: z.string().meta({ description: "ISO 8601 timestamp" }),
});

/**
 * `PUT /api/tracks/{id}/lyrics` stores the text as `source = 'user'`. Blank text
 * is refused: clearing is `DELETE`, which drops the row so the next tag read can
 * fill it from the file again.
 */
export const trackLyricsUpdateRequestSchema = z.object({
  text: z
    .string()
    .max(100_000)
    .refine((text) => text.trim().length > 0, {
      message: "text must not be blank; DELETE clears lyrics",
    }),
});

/** `DELETE /api/tracks/{id}/lyrics`: `deleted` is false when there was nothing to clear. */
export const trackLyricsDeleteResponseSchema = z.object({
  deleted: z.boolean(),
});

export type TrackLyricsSource = z.infer<typeof trackLyricsSourceSchema>;
export type TrackLyrics = z.infer<typeof trackLyricsSchema>;
export type TrackLyricsUpdateRequest = z.infer<typeof trackLyricsUpdateRequestSchema>;
export type TrackLyricsDeleteResponse = z.infer<typeof trackLyricsDeleteResponseSchema>;

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
  TrackLyrics: z.toJSONSchema(trackLyricsSchema),
  TrackLyricsUpdateRequest: z.toJSONSchema(trackLyricsUpdateRequestSchema, { io: "input" }),
  TrackLyricsDeleteResponse: z.toJSONSchema(trackLyricsDeleteResponseSchema),
  TrackAudioMetadata: z.toJSONSchema(trackAudioMetadataSchema),
  AudioMetadataBackfillRequest: z.toJSONSchema(audioMetadataBackfillRequestSchema, {
    io: "input",
  }),
  AudioMetadataBackfillRun: z.toJSONSchema(audioMetadataBackfillRunSchema),
  EmbeddedTagsBackfillRequest: z.toJSONSchema(embeddedTagsBackfillRequestSchema, {
    io: "input",
  }),
  EmbeddedTagsBackfillRun: z.toJSONSchema(embeddedTagsBackfillRunSchema),
  IsrcBackfillRequest: z.toJSONSchema(isrcBackfillRequestSchema, { io: "input" }),
  IsrcBackfillRun: z.toJSONSchema(isrcBackfillRunSchema),
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

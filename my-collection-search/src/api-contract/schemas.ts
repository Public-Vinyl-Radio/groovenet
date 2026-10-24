import { z } from "zod";
import {
  albumArtMatchStatusSchema,
  albumArtSourceSchema,
  albumArtworkStateSchema,
  albumDeleteResponseSchema,
  albumDetailSchema,
  albumPlayableStructureSchema,
  albumPlayableStructureSideSchema,
  albumPlayableStructureTrackSchema,
  albumSchema,
  albumTaxonomyOverridesSchema,
  albumSearchResponseSchema,
  genreFilterRefSchema,
  trackAudioMetadataEmbeddedCoverSchema,
  trackAudioMetadataSchema,
  trackDeleteResponseSchema,
  trackEssentiaSchema,
  trackExtractEmbeddedCoverResponseSchema,
  trackGenreSchema,
  trackPlaylistCountRefSchema,
  trackPlaylistCountsRequestSchema,
  trackPlaylistCountsResponseSchema,
  trackPlaylistMembershipSchema,
  trackPlaylistsResponseSchema,
  trackSchema,
  trackSearchModeSchema,
  trackSearchResponseSchema,
  type GenreFilterRef,
  liveSetDeleteResponseSchema,
  liveSetMutationResponseSchema,
  liveSetSchema,
  liveSetUpdateSchema,
  playlistCreateSchema,
  playlistDetailSchema,
  playlistGeneticInvalidItemSchema as sharedPlaylistGeneticInvalidItemSchema,
  playlistGeneticRequestSchema,
  playlistGeneticResponseSchema as sharedPlaylistGeneticResponseSchema,
  playlistGeneticResultTrackSchema as sharedPlaylistGeneticResultTrackSchema,
  playlistGeneticTrackSchema as sharedPlaylistGeneticTrackSchema,
  playlistGeneticValidationErrorSchema as sharedPlaylistGeneticValidationErrorSchema,
  playlistSchema as sharedPlaylistSchema,
  playlistSpinsInputSchema,
  playlistSpinsResultSchema,
  playlistTrackInputSchema as sharedPlaylistTrackInputSchema,
  playlistTrackRefSchema as sharedPlaylistTrackRefSchema,
  playlistUpdateSchema,
  defaultLibrarySettingsSchema,
  defaultLibrarySettingsUpdateResponseSchema,
  defaultLibrarySettingsUpdateSchema,
  friendCreateResponseSchema,
  friendCreateSchema,
  friendListResponseSchema,
  friendSchema as sharedFriendSchema,
  cleaningMethodSchema as sharedCleaningMethodSchema,
  recordActionCreateObjectSchema,
  recordActionDetailsSchema as sharedRecordActionDetailsSchema,
  recordActionListQuerySchema as sharedRecordActionListQuerySchema,
  recordActionListResponseSchema as sharedRecordActionListResponseSchema,
  recordActionMutationResponseSchema as sharedRecordActionMutationResponseSchema,
  recordActionSchema as sharedRecordActionSchema,
  recordActionTypeSchema as sharedRecordActionTypeSchema,
  recordActionVoidResponseSchema as sharedRecordActionVoidResponseSchema,
  recordCareItemSchema as sharedRecordCareItemSchema,
  recordCareQuerySchema as sharedRecordCareQuerySchema,
  recordCareResponseSchema as sharedRecordCareResponseSchema,
  recordCareStatusSchema as sharedRecordCareStatusSchema,
  recordCareSummaryQuerySchema as sharedRecordCareSummaryQuerySchema,
  recordCareSummarySchema,
  recordCopyCreateSchema,
  recordCopyDefaultUpdateObjectSchema,
  recordCopyDeleteResponseSchema as sharedRecordCopyDeleteResponseSchema,
  recordCopyListItemSchema as sharedRecordCopyListItemSchema,
  recordCopyListResponseSchema as sharedRecordCopyListResponseSchema,
  recordCopyResponseSchema as sharedRecordCopyResponseSchema,
  recordCopySchema as sharedRecordCopySchema,
  recordCopyUpdateObjectSchema,
  refineRecordActionCreate,
  requireLabelOrNotes,
  sleeveTypeSchema as sharedSleeveTypeSchema,
  refineSpinCreate,
  refineSpinUpdate,
  spinAggregateRequestSchema,
  spinAggregateResultSchema,
  spinAggregateSourceResultSchema as sharedSpinAggregateSourceResultSchema,
  spinAlbumSummarySchema as sharedSpinAlbumSummarySchema,
  spinCreateObjectSchema,
  spinCreateResponseSchema as sharedSpinCreateResponseSchema,
  spinDeleteResponseSchema as sharedSpinDeleteResponseSchema,
  spinDerivedSchema as sharedSpinDerivedSchema,
  spinListQuerySchema as sharedSpinListQuerySchema,
  spinListResponseSchema as sharedSpinListResponseSchema,
  spinSelectionSchema as sharedSpinSelectionSchema,
  spinSessionDetailSchema,
  spinSessionSchema as sharedSpinSessionSchema,
  spinTopTrackSchema,
  spinTopTracksQuerySchema as sharedSpinTopTracksQuerySchema,
  spinTopTracksResponseSchema as sharedSpinTopTracksResponseSchema,
  spinTrackRefSchema as sharedSpinTrackRefSchema,
  spinUpdateObjectSchema,
  spinUpdateResponseSchema as sharedSpinUpdateResponseSchema,
  trackSpinEventSchema as sharedTrackSpinEventSchema,
} from "@groovenet/contracts";
import { fontChoiceIdsFor, fontRoleIds, type FontChoiceId, type FontRoleId } from "@/app/fontChoices";
import { paletteIds } from "@/app/palettes";
import { RECOMMENDATION_SCOPES } from "@/types/recommendations";

const toInt = (value: unknown): unknown => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return value;
};

export const intFromInputSchema = z.preprocess(toInt, z.number().int());

/** A query-string number, decimals allowed; anything not wholly numeric fails. */
const toNumber = (value: unknown): unknown => {
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return value;
};
const numberFromInputSchema = z.preprocess(toNumber, z.number());
export const nonNegativeIntFromInputSchema = z.preprocess(
  toInt,
  z.number().int().min(0)
);

/** A query-string flag: `1`/`true` is on, anything else (including absent) is off. */
const toBooleanFlag = (value: unknown): unknown =>
  typeof value === "string" ? value === "1" || value.toLowerCase() === "true" : value;
const booleanFlagSchema = z.preprocess(toBooleanFlag, z.boolean());

export const apiErrorSchema = z
  .object({
    error: z.string(),
    message: z.string().optional(),
  })
  .passthrough();

export const discogsLookupQuerySchema = z.object({
  track_id: z.string().min(1),
  username: z.string().optional(),
  friend_id: intFromInputSchema.optional(),
});

export const discogsLookupTrackSchema = z
  .object({
    position: z.string(),
    title: z.string(),
    duration: z.string(),
    artists: z.array(z.object({ name: z.string() })).optional(),
  })
  .passthrough();

export const discogsLookupReleaseSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    title: z.string().optional(),
    artists: z.array(z.object({ name: z.string() })).optional(),
    artists_sort: z.string().optional(),
    year: z.number().nullable().optional(),
    styles: z.array(z.string()).optional(),
    genres: z.array(z.string()).optional(),
    uri: z.string().nullable().optional(),
    thumb: z.string().nullable().optional(),
    videos: z.array(z.object({}).passthrough()).optional(),
    video: z.array(z.object({}).passthrough()).optional(),
  })
  .passthrough();

export const discogsLookupResponseSchema = z
  .object({
    releaseId: z.string().optional(),
    filePath: z.string().optional(),
    release: discogsLookupReleaseSchema.nullable().optional(),
    matchedTrack: discogsLookupTrackSchema.nullable().optional(),
  })
  .passthrough();

export const discogsDeleteReleasesBodySchema = z.object({
  username: z.string().min(1),
  releaseIds: z.array(z.string().min(1)),
});

export const discogsDeleteReleasesResponseSchema = z.object({
  message: z.string(),
  deletedFiles: z.array(z.string()),
  failedDeletes: z.array(z.string()),
  deletedTrackIds: z.array(z.string()),
  deletedFromDb: z.number().int(),
});

export const providerTrackMetadataBodySchema = z.object({
  prompt: z.string().min(1),
  friend_id: intFromInputSchema.optional(),
  track_id: z.string().min(1).optional(),
});

export const providerTrackMetadataResponseSchema = z.object({
  genres: z.array(trackGenreSchema),
  descriptors: z.array(z.string()),
  notes: z.string(),
});

export const providerYouTubeMusicSearchBodySchema = z.object({
  title: z.string().optional(),
  artist: z.string().optional(),
});

export const providerYouTubeMusicSearchItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  channel: z.string(),
  thumbnail: z.string().optional(),
});

export const providerYouTubeMusicSearchResponseSchema = z.object({
  results: z.array(providerYouTubeMusicSearchItemSchema),
});

export const providerAppleMusicSearchBodySchema = z.object({
  title: z.string().optional(),
  artist: z.string().optional(),
  album: z.string().optional(),
  isrc: z.string().optional(),
});

export const providerAppleMusicSearchItemSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  artist: z.string().optional(),
  album: z.string().optional(),
  url: z.string().optional(),
  artwork: z.string().optional(),
  duration: z.number().optional(),
  isrc: z.string().optional(),
});

export const providerAppleMusicSearchResponseSchema = z.object({
  results: z.array(providerAppleMusicSearchItemSchema),
});

export const gamdlCookieFileInfoSchema = z
  .object({
    exists: z.boolean(),
    filename: z.string().optional(),
    size: z.number().optional(),
    lastModified: z.string().optional(),
    domains: z.array(z.string()).optional(),
    cookieCount: z.number().int().optional(),
    hasAppleMusic: z.boolean().optional(),
    expiryDates: z.array(z.string()).optional(),
    isValid: z.boolean().optional(),
    validationErrors: z.array(z.string()).optional(),
  })
  .passthrough();

export const gamdlCookieUploadResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  cookieInfo: gamdlCookieFileInfoSchema,
});

export const gamdlCookieDeleteResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const gamdlAudioQualitySchema = z.enum([
  "best",
  "high",
  "standard",
  "lossless",
]);

export const gamdlAudioFormatSchema = z.enum(["m4a", "mp3", "aac", "flac"]);
export const gamdlCoverFormatSchema = z.enum(["jpg", "png", "raw"]);
export const gamdlLyricsFormatSchema = z.enum(["lrc", "srt", "ttml"]);

export const gamdlSettingsSchema = z.object({
  id: z.number().int(),
  friend_id: z.number().int(),
  audio_quality: gamdlAudioQualitySchema,
  audio_format: gamdlAudioFormatSchema,
  save_cover: z.boolean(),
  cover_format: gamdlCoverFormatSchema,
  save_lyrics: z.boolean(),
  lyrics_format: gamdlLyricsFormatSchema,
  overwrite_existing: z.boolean(),
  skip_music_videos: z.boolean(),
  max_retries: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const gamdlSettingsQuerySchema = z.object({
  friend_id: intFromInputSchema,
});

export const gamdlSettingsGetResponseSchema = z.object({
  settings: gamdlSettingsSchema,
});

export const gamdlSettingsPutBodySchema = z
  .object({
    friend_id: intFromInputSchema,
    audio_quality: gamdlAudioQualitySchema.optional(),
    audio_format: gamdlAudioFormatSchema.optional(),
    save_cover: z.boolean().optional(),
    cover_format: gamdlCoverFormatSchema.optional(),
    save_lyrics: z.boolean().optional(),
    lyrics_format: gamdlLyricsFormatSchema.optional(),
    overwrite_existing: z.boolean().optional(),
    skip_music_videos: z.boolean().optional(),
    max_retries: intFromInputSchema.optional(),
  })
  .strict();

export const gamdlSettingsPutResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  settings: gamdlSettingsSchema,
});

export const gamdlSettingsResetBodySchema = z.object({
  friend_id: intFromInputSchema,
});

export const gamdlSettingsResetResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  settings: gamdlSettingsSchema,
});

export const gamdlConnectionTestDetailsSchema = z.object({
  gamdl_available: z.boolean(),
  cookie_file_exists: z.boolean(),
  cookie_file_valid: z.boolean(),
  test_download_attempted: z.boolean(),
  test_download_success: z.boolean(),
  error_type: z.string().optional(),
});

export const backupProviderSchema = z.enum(["restic-b2"]);
export const backupRetentionPresetSchema = z.enum([
  "aggressive",
  "balanced",
  "archive",
]);

export const backupPolicySchema = z.object({
  enabled: z.boolean(),
  provider: backupProviderSchema,
  schedule_cron: z.string().min(1),
  retention_preset: backupRetentionPresetSchema,
  include_database: z.boolean(),
  include_audio_files: z.boolean(),
  include_album_covers: z.boolean(),
  include_discogs_exports: z.boolean(),
  include_essentia_files: z.boolean(),
  include_uploads: z.boolean(),
  updated_at: z.string(),
});

export const backupPolicyGetResponseSchema = z.object({
  policy: backupPolicySchema,
});

export const backupPolicyPutBodySchema = z
  .object({
    enabled: z.boolean().optional(),
    provider: backupProviderSchema.optional(),
    schedule_cron: z.string().min(1).optional(),
    retention_preset: backupRetentionPresetSchema.optional(),
    include_database: z.boolean().optional(),
    include_audio_files: z.boolean().optional(),
    include_album_covers: z.boolean().optional(),
    include_discogs_exports: z.boolean().optional(),
    include_essentia_files: z.boolean().optional(),
    include_uploads: z.boolean().optional(),
  })
  .strict();

export const backupPolicyPutResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  policy: backupPolicySchema,
});

export const backupSnapshotSummarySchema = z.object({
  id: z.string(),
  short_id: z.string().nullable(),
  time: z.string(),
  hostname: z.string().nullable(),
  paths: z.array(z.string()),
  tags: z.array(z.string()),
});

export const backupStatusSchema = z.object({
  started_at: z.string(),
  finished_at: z.string(),
  stored_at: z.string(),
  status: z.enum(["success", "failed", "skipped"]),
  reason: z.string(),
  backed_up_paths: z.array(z.string()),
  snapshot: backupSnapshotSummarySchema.nullable(),
  error: z.string().optional(),
  missing_env: z.array(z.string()).optional(),
});

export const backupMetricsSchema = z.object({
  captured_at: z.string(),
  local_source_bytes: z.number().nonnegative(),
  snapshot_count: z.number().int().nonnegative().nullable(),
  remote_repository_bytes: z.number().nonnegative().nullable(),
  recent_snapshots: z.array(backupSnapshotSummarySchema),
  error: z.string().optional(),
});

export const backupStatusGetResponseSchema = z.object({
  status: backupStatusSchema.nullable(),
  metrics: backupMetricsSchema.optional(),
});

export const defaultLibrarySettingsGetResponseSchema = defaultLibrarySettingsSchema;

// The route coerces with Number() itself, as it always has, then validates this.
export const defaultLibrarySettingsPutBodySchema = defaultLibrarySettingsUpdateSchema;

export const defaultLibrarySettingsPutResponseSchema = defaultLibrarySettingsUpdateResponseSchema;

export const backupCreateResponseSchema = z.object({
  message: z.string(),
  filename: z.string(),
  format: z.literal("custom"),
});

export const backupCreateCustomResponseSchema = z.object({
  message: z.string(),
  filename: z.string(),
  format: z.literal("custom"),
});

export const gamdlConnectionTestResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  details: gamdlConnectionTestDetailsSchema,
});

export const jobsListQuerySchema = z.object({
  limit: nonNegativeIntFromInputSchema.optional().default(100),
  offset: nonNegativeIntFromInputSchema.optional().default(0),
  state: z
    .enum(["all", "waiting", "active", "completed", "failed"])
    .optional()
    .default("all"),
});

export const jobDataSchema = z
  .object({
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
  })
  .passthrough();

export const jobInfoSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    state: z.enum(["waiting", "active", "completed", "failed"]),
    progress: z.number(),
    data: jobDataSchema,
    returnvalue: z.unknown().optional(),
    finishedOn: z.number().optional(),
    failedReason: z.string().optional(),
    attemptsMade: z.number().int(),
    processedOn: z.number().optional(),
    queue: z.string(),
  })
  .passthrough();

export const jobsSummarySchema = z.object({
  total: z.number().int(),
  waiting: z.number().int(),
  active: z.number().int(),
  completed: z.number().int(),
  failed: z.number().int(),
});

export const jobsPaginationSchema = z.object({
  limit: z.number().int(),
  offset: z.number().int(),
  total_filtered: z.number().int(),
  has_more: z.boolean(),
});

export const jobsListResponseSchema = z.object({
  jobs: z.array(jobInfoSchema),
  summary: jobsSummarySchema,
  pagination: jobsPaginationSchema.optional(),
});

export const jobsClearResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const jobsEventsSseEnvelopeSchema = z.object({
  type: z.enum(["job_completed", "error"]),
  job_id: z.string().optional(),
  track_id: z.string().optional(),
  friend_id: z.number().int().optional(),
  result: z.unknown().optional(),
  message: z.string().optional(),
  timestamp: z.number().int(),
});

export const jobsEventsSseResponseSchema = z.object({
  stream: z.string(),
  events: z.array(jobsEventsSseEnvelopeSchema),
});

export const jobDetailsResponseSchema = jobInfoSchema.extend({
  delay: z.number().optional(),
  timestamp: z.number().optional(),
  opts: z.record(z.string(), z.unknown()).optional(),
  logs: z.array(z.unknown()).optional(),
});

export const friendSchema = sharedFriendSchema;

export const friendsListQuerySchema = z.object({
  showCurrentUser: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional(),
});

export const friendsListResponseSchema = friendListResponseSchema;

export const friendMutationBodySchema = friendCreateSchema;

export const friendMutationResponseSchema = friendCreateResponseSchema;

export const friendDeleteQuerySchema = z.object({
  username: z.string().min(1),
});

export const playlistTrackRefSchema = sharedPlaylistTrackRefSchema;
export const playlistTrackInputSchema = sharedPlaylistTrackInputSchema;
export type PlaylistTrackInput = z.infer<typeof playlistTrackInputSchema>;

export const playlistSchema = sharedPlaylistSchema;
export const playlistCreateBodySchema = playlistCreateSchema;

// The id arrives as a JSON number from clients but is coerced from text elsewhere.
export const playlistPatchBodySchema = playlistUpdateSchema.extend({
  id: intFromInputSchema,
});

export const playlistDeleteQuerySchema = z.object({
  id: intFromInputSchema,
});

export const playlistDetailParamsSchema = z.object({
  id: intFromInputSchema,
});

export const liveSetResponseSchema = liveSetSchema;
export const liveSetUpdateBodySchema = liveSetUpdateSchema;
export const liveSetMutationSchema = liveSetMutationResponseSchema;
export const liveSetDeleteSchema = liveSetDeleteResponseSchema;

export const playlistDetailResponseSchema = playlistDetailSchema;

export const playlistSpinsBodySchema = playlistSpinsInputSchema;
export const playlistSpinsResponseSchema = playlistSpinsResultSchema;

export const playlistGeneticTrackSchema = sharedPlaylistGeneticTrackSchema;
export const playlistGeneticBodySchema = playlistGeneticRequestSchema;
export const playlistGeneticResultTrackSchema = sharedPlaylistGeneticResultTrackSchema;
export const playlistGeneticResponseSchema = sharedPlaylistGeneticResponseSchema;
export const playlistGeneticInvalidItemSchema = sharedPlaylistGeneticInvalidItemSchema;
export const playlistGeneticValidationErrorSchema = sharedPlaylistGeneticValidationErrorSchema;


// Entity and response schemas live in @groovenet/contracts; the app keeps the
// names routes and internalApi already import, and keeps query-string coercion.
export type { TrackSearchMode, AlbumTaxonomyOverrides } from "@groovenet/contracts";
export {
  albumArtMatchStatusSchema,
  albumArtSourceSchema,
  albumArtworkStateSchema,
  albumDeleteResponseSchema,
  albumPlayableStructureSideSchema,
  albumPlayableStructureTrackSchema,
  albumSearchResponseSchema,
  genreFilterRefSchema,
  trackAudioMetadataEmbeddedCoverSchema,
  trackDeleteResponseSchema,
  trackExtractEmbeddedCoverResponseSchema,
  trackGenreSchema,
  trackPlaylistCountRefSchema,
  trackPlaylistCountsResponseSchema,
  trackPlaylistMembershipSchema,
  trackPlaylistsResponseSchema,
  trackSearchModeSchema,
};
export const albumEntitySchema = albumSchema;
export const trackEntitySchema = trackSchema;
export const albumDetailResponseSchema = albumDetailSchema;
export const albumPlayableStructureResponseSchema = albumPlayableStructureSchema;
export const trackAudioMetadataResponseSchema = trackAudioMetadataSchema;
export const trackEssentiaResponseSchema = trackEssentiaSchema;
export const trackPlaylistCountsBodySchema = trackPlaylistCountsRequestSchema;
/**
 * Runtime validation keeps `hits` opaque: search rows are raw SQL results the
 * contract documents (see `Track`) but the route has never rejected.
 */
export const trackSearchGetResponseSchema = trackSearchResponseSchema.extend({
  hits: z.array(z.unknown()),
});

/** A repeatable `genre` query parameter: one value, or several. */
const genreQueryParamSchema = z
  .preprocess(
    (value) => (typeof value === "string" ? [value] : value),
    z.array(z.string().trim().min(1)).max(20)
  )
  .optional();

/** A genre a widened filter added (#485): the removable "+ Chicha, Porro" chip. */
export type GenreFilterRefDto = GenreFilterRef;

export const trackSearchGetQuerySchema = z.object({
  q: z.string().optional().default(""),
  limit: nonNegativeIntFromInputSchema.optional().default(20),
  offset: nonNegativeIntFromInputSchema.optional().default(0),
  friend_id: intFromInputSchema.optional(),
  filter: z.string().optional(),
  /**
   * `lexical` (default) is full-text + trigram. `semantic` ranks by the
   * `context` embedding; `hybrid` fuses both (#409). Both are one page:
   * `offset` must be 0 and `limit` at most 50.
   */
  mode: trackSearchModeSchema.optional().default("lexical"),
  /** Attribute filters (#412), applied in every mode. */
  bpm_min: numberFromInputSchema.optional(),
  bpm_max: numberFromInputSchema.optional(),
  /** Exact musical key, case-insensitive, e.g. `A minor`. */
  key: z.string().trim().min(1).optional(),
  /** Minimum star rating. */
  star_rating: z.preprocess(toInt, z.number().int().min(0).max(5)).optional(),
  /** Genre slugs, ids or names (#375), ORed, each including its subgenres. */
  genre: genreQueryParamSchema,
  /** Widen `genre` to each seed's top related genres from `genre_similarity` (#485). */
  include_similar: booleanFlagSchema.optional().default(false),
  /** Per-seed cap on related genres pulled in when `include_similar` is on; defaults server-side. */
  similar_limit: nonNegativeIntFromInputSchema.optional(),
  /** Related-genre ids the UI has removed from the widened set; kept out on this and later requests. */
  similar_exclude: genreQueryParamSchema,
});

export const embeddingPreviewTypeSchema = z.enum(["identity", "audio_vibe", "context"]);

export const identityEmbeddingDataSchema = z.object({
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

export const audioVibeEmbeddingDataSchema = z.object({
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

export const embeddingIdentityPreviewApiResponseSchema = z.object({
  type: z.literal("identity"),
  text: z.string(),
  data: identityEmbeddingDataSchema,
});

export const embeddingAudioVibePreviewApiResponseSchema = z.object({
  type: z.literal("audio_vibe"),
  text: z.string(),
  data: audioVibeEmbeddingDataSchema,
});

/** Built from the same normalized data as identity, rendered for retrieval (#408). */
export const embeddingContextPreviewApiResponseSchema = z.object({
  type: z.literal("context"),
  text: z.string(),
  data: identityEmbeddingDataSchema,
});

export const embeddingPreviewResponseSchema = z.discriminatedUnion("type", [
  embeddingIdentityPreviewApiResponseSchema,
  embeddingAudioVibePreviewApiResponseSchema,
  embeddingContextPreviewApiResponseSchema,
]);

export const identityEmbeddingPreviewResponseSchema = z.object({
  identityText: z.string(),
  identityData: identityEmbeddingDataSchema,
});

export const contextEmbeddingPreviewResponseSchema = z.object({
  contextText: z.string(),
  contextData: identityEmbeddingDataSchema,
});

export const audioVibeEmbeddingPreviewResponseSchema = z.object({
  vibeText: z.string(),
  vibeData: audioVibeEmbeddingDataSchema,
});

export const legacyEmbeddingPreviewResponseSchema = z.object({
  type: embeddingPreviewTypeSchema,
  text: z.string(),
  data: z.unknown(),
});

export const bulkNotesUpdateSchema = z
  .object({
    track_id: z.string().min(1),
    local_tags: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

export const bulkNotesBodySchema = z.object({
  updates: z.array(bulkNotesUpdateSchema),
});

export const bulkNotesResponseSchema = z
  .object({
    success: z.boolean(),
    updated: z.number().int().optional(),
    tracks: z.array(z.object({}).passthrough()).optional(),
  })
  .passthrough();

export const recommendationScopeSchema = z.enum(RECOMMENDATION_SCOPES);

/**
 * Where candidates may come from. `scope` omitted means the library's saved
 * setting (default `library`); `library_friend_id` omitted means the seed's
 * library (the first seed's, for a batch).
 */
const recommendationScopeParams = {
  scope: recommendationScopeSchema.optional(),
  library_friend_id: intFromInputSchema.optional(),
};

export const recommendationsQuerySchema = z.object({
  track_id: z.string().min(1),
  friend_id: intFromInputSchema,
  mode: z.enum(["combined", "identity", "audio"]).optional().default("combined"),
  limit_identity: intFromInputSchema.optional().default(200),
  limit_audio: intFromInputSchema.optional().default(200),
  ivfflat_probes: intFromInputSchema.optional().default(10),
  ...recommendationScopeParams,
});

export const recommendationSeedTrackSchema = z.object({
  track_id: z.string().min(1),
  friend_id: intFromInputSchema,
});

export const recommendationsBatchBodySchema = z.object({
  tracks: z.array(recommendationSeedTrackSchema).min(1).max(100),
  limit_identity: intFromInputSchema.optional().default(200),
  limit_audio: intFromInputSchema.optional().default(200),
  ivfflat_probes: intFromInputSchema.optional().default(10),
  ...recommendationScopeParams,
});

export const seedEmbeddingsSchema = z.object({
  identity: z.boolean(),
  audio: z.boolean(),
});

export const recommendationCandidateSchema = z.object({
  trackId: z.string(),
  friendId: z.number().int(),
  simIdentity: z.number().nullable(),
  simAudio: z.number().nullable(),
  metadata: z
    .object({
      bpm: z.number().nullable(),
      key: z.string().nullable(),
      keyConfidence: z.number().nullable(),
      tempoConfidence: z.number().nullable(),
      eraBucket: z.string().nullable(),
      tags: z.array(z.string()),
      genreRefs: z.array(z.object({ id: z.string(), parentId: z.string().nullable() })),
      styles: z.array(z.string()),
      energy: z.number().nullable(),
      danceability: z.number().nullable(),
      title: z.string(),
      artist: z.string(),
      album: z.string(),
      year: z.string().nullable(),
      genres: z.array(z.string()),
      starRating: z.number().nullable(),
      albumThumbnail: z.string().nullable(),
      moodHappy: z.number().nullable(),
      moodSad: z.number().nullable(),
      moodRelaxed: z.number().nullable(),
      moodAggressive: z.number().nullable(),
    })
    .passthrough(),
});

export const recommendationsResponseSchema = z.object({
  seedTrackId: z.string(),
  seedFriendId: z.number().int(),
  seedEmbeddings: seedEmbeddingsSchema,
  /** The scope these candidates were drawn from, after applying the saved setting. */
  scope: recommendationScopeSchema,
  /** The library they were limited to; null when every library was searched. */
  libraryFriendId: z.number().int().nullable(),
  candidates: z.array(recommendationCandidateSchema),
  stats: z.object({
    identityCount: z.number().int(),
    audioCount: z.number().int(),
    unionCount: z.number().int(),
    timingMs: z.object({
      identityQuery: z.number().int(),
      audioQuery: z.number().int(),
      total: z.number().int(),
    }),
  }),
});

export const durationBackfillQueueErrorSchema = z.object({
  track_id: z.string(),
  error: z.string(),
});

export const durationBackfillResponseSchema = z.object({
  queued: z.number().int(),
  jobIds: z.array(z.string()),
  errors: z.array(durationBackfillQueueErrorSchema),
});

export const coverArtBackfillBodySchema = z.object({
  friend_id: intFromInputSchema.nullable().optional(),
});

export const coverArtBackfillQueueErrorSchema = z.object({
  track_id: z.string(),
  friend_id: z.number().int(),
  release_id: z.string().nullable(),
  error: z.string(),
});

export const coverArtBackfillResponseSchema = z.object({
  queued: z.number().int(),
  queuedAlbums: z.number().int(),
  tracksImpacted: z.number().int(),
  jobIds: z.array(z.string()),
  errors: z.array(coverArtBackfillQueueErrorSchema),
});

export const essentiaBackfillBodySchema = z.object({
  friend_id: intFromInputSchema.nullable().optional(),
  force: z.boolean().optional().default(false),
});

export const essentiaBackfillQueueErrorSchema = z.object({
  track_id: z.string(),
  friend_id: z.number().int(),
  error: z.string(),
});

export const essentiaBackfillResponseSchema = z.object({
  queued: z.number().int(),
  skipped_existing: z.number().int(),
  total_candidates: z.number().int(),
  force: z.boolean(),
  jobIds: z.array(z.string()),
  errors: z.array(essentiaBackfillQueueErrorSchema),
});

export const manifestVerificationResultSchema = z.object({
  username: z.string(),
  totalReleaseIds: z.number().int(),
  missingFiles: z.array(z.string()),
  validFiles: z.array(z.string()),
});

export const manifestVerificationResponseSchema = z.object({
  message: z.string(),
  results: z.array(manifestVerificationResultSchema),
  summary: z.object({
    totalManifests: z.number().int(),
    totalMissingFiles: z.number().int(),
    totalValidFiles: z.number().int(),
  }),
});

export const manifestCleanupResultSchema = z.object({
  username: z.string(),
  before: z.number().int(),
  after: z.number().int(),
  removed: z.array(z.string()),
});

export const manifestCleanupResponseSchema = z.object({
  message: z.string(),
  results: z.array(manifestCleanupResultSchema),
  summary: z.object({
    totalManifests: z.number().int(),
    totalRemoved: z.number().int(),
    totalKept: z.number().int(),
  }),
});

export const aiPromptSettingsQuerySchema = z.object({
  friend_id: intFromInputSchema.optional(),
});

export const aiPromptSettingsPutBodySchema = z.object({
  friend_id: intFromInputSchema,
  prompt: z.string().optional().default(""),
});

export const aiPromptSettingsGetResponseSchema = z.object({
  prompt: z.string(),
  defaultPrompt: z.string(),
  isDefault: z.boolean(),
});

export const aiPromptSettingsPutResponseSchema = z.object({
  prompt: z.string(),
  isDefault: z.boolean(),
});

export const appearancePaletteSchema = z.enum(paletteIds);

// Each role accepts only its own faces, so a slab can't be set as the body font.
const appearanceFontsShape = Object.fromEntries(
  fontRoleIds.map((role) => [role, z.enum(fontChoiceIdsFor(role))]),
) as { [R in FontRoleId]: z.ZodEnum<{ [K in FontChoiceId]: K }> };

// Every field is optional and only the ones sent change, so `{ palette }` still
// works and a font change leaves the palette alone.
export const appearanceSettingsPutBodySchema = z
  .object({
    palette: appearancePaletteSchema.optional(),
    fonts: z.object(appearanceFontsShape).partial().strict().optional(),
  })
  .strict();

export const appearanceSettingsResponseSchema = z.object({
  palette: appearancePaletteSchema,
  fonts: z.object(appearanceFontsShape),
});

export const recommendationSettingsQuerySchema = z.object({
  friend_id: intFromInputSchema,
});

export const recommendationSettingsPutBodySchema = z.object({
  friend_id: intFromInputSchema,
  scope: recommendationScopeSchema,
});

export const recommendationSettingsResponseSchema = z.object({
  friend_id: z.number().int(),
  scope: recommendationScopeSchema,
  /** True when the library has never chosen, so `scope` is the default. */
  isDefault: z.boolean(),
});

export const albumReleaseParamsSchema = z.object({
  releaseId: z.string().min(1),
});

export const albumFriendQuerySchema = z.object({
  friend_id: intFromInputSchema,
});

export const albumDiscogsRawResponseSchema = z.object({
  friend_id: z.number().int(),
  release_id: z.string(),
  username: z.string(),
  file_path: z.string(),
  data: z.unknown(),
});

/** Omitted: unchanged; null: reset to Discogs; []: deliberately empty. */
export const albumTaxonomyOverrideFields = albumTaxonomyOverridesSchema;


export const similarVibeQuerySchema = z.object({
  track_id: z.string().min(1),
  friend_id: intFromInputSchema,
  limit: intFromInputSchema.optional().default(50),
  ivfflat_probes: intFromInputSchema.optional().default(10),
  ...recommendationScopeParams,
});

export const similarVibeTrackSchema = trackEntitySchema.extend({
  distance: z.number(),
  identity_text: z.string(),
  danceability: z.union([z.number(), z.string()]).nullable().optional(),
  mood_happy: z.number().nullable().optional(),
  mood_sad: z.number().nullable().optional(),
  mood_relaxed: z.number().nullable().optional(),
  mood_aggressive: z.number().nullable().optional(),
});

export const similarVibeResponseSchema = z.object({
  source_track_id: z.string(),
  source_friend_id: z.number().int(),
  count: z.number().int(),
  tracks: z.array(similarVibeTrackSchema),
});

export const similarIdentityQuerySchema = z.object({
  track_id: z.string().min(1),
  friend_id: intFromInputSchema,
  limit: intFromInputSchema.optional().default(50),
  ivfflat_probes: intFromInputSchema.optional().default(10),
  era: z.string().optional(),
  country: z.string().optional(),
  tags: z.string().optional(),
  ...recommendationScopeParams,
});

export const similarIdentityFiltersSchema = z.object({
  era: z.string().optional(),
  country: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const similarIdentityTrackSchema = trackEntitySchema.extend({
  distance: z.number(),
  identity_text: z.string(),
});

export const similarIdentityResponseSchema = z.object({
  source_track_id: z.string(),
  source_friend_id: z.number().int(),
  filters: similarIdentityFiltersSchema,
  count: z.number().int(),
  tracks: z.array(similarIdentityTrackSchema),
});

export const albumCreateResponseSchema = z.object({
  album: albumEntitySchema,
  tracks: z.array(trackEntitySchema),
});

export const queueAlbumDownloadsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  jobIds: z.array(z.string()),
  tracksQueued: z.number().int(),
});

export const albumCleanupSampleSchema = z.object({
  release_id: z.string(),
  friend_id: z.number().int(),
  title: z.string(),
  artist: z.string(),
  track_count: z.number().int().optional(),
});

export const albumsCleanupSummaryResponseSchema = z.object({
  totalAlbumsToClean: z.number().int(),
  emptyTrackCount: z.number().int(),
  orphanedAlbums: z.number().int(),
  sample: z.array(albumCleanupSampleSchema),
});

export const albumUpsertWithTracksResponseSchema = z.object({
  album: albumEntitySchema,
  tracks: z.array(z.object({}).passthrough()),
  deletedTracks: z.number().int(),
});

export const albumSearchQuerySchema = z.object({
  q: z.string().optional().default(""),
  sort: z.string().optional().default("created_at:desc"),
  friend_id: intFromInputSchema.optional(),
  limit: nonNegativeIntFromInputSchema.optional().default(20),
  offset: nonNegativeIntFromInputSchema.optional().default(0),
  missing_library_identifier: z.boolean().optional(),
  missing_local_cover_art_url: z.boolean().optional(),
  missing_audio: z.boolean().optional(),
  genre: genreQueryParamSchema,
  /** Widen `genre` to each seed's top related genres from `genre_similarity` (#485). */
  include_similar: z.boolean().optional(),
  /** Per-seed cap on related genres pulled in when `include_similar` is on; defaults server-side. */
  similar_limit: nonNegativeIntFromInputSchema.optional(),
  /** Related-genre ids the UI has removed from the widened set; kept out on this and later requests. */
  similar_exclude: genreQueryParamSchema,
});

// ─── Album artwork (#494) ────────────────────────────────────────────────────

export const albumArtworkApplyBodySchema = z.object({
  source: z.enum(["apple_music", "discogs"]),
});

export const albumAppleMusicArtPreviewSchema = z.object({
  url: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  track_id: z.string(),
});

export const albumArtMatchResultSchema = z.object({
  release_id: z.string(),
  friend_id: z.number().int(),
  status: albumArtMatchStatusSchema,
  distance: z.number().int().nullable(),
  applied: z.boolean(),
  apple_music_art_url: z.string().nullable(),
});

export const albumArtworkBackfillBodySchema = z.object({
  friend_id: z.number().int().positive().nullable().optional(),
});

export const albumArtworkBackfillResponseSchema = z.object({
  queued: z.number().int(),
  queuedAlbums: z.number().int(),
  tracksImpacted: z.number().int(),
  jobIds: z.array(z.string()),
  errors: z.array(
    z.object({
      track_id: z.string(),
      friend_id: z.number().int(),
      release_id: z.string().nullable().optional(),
      error: z.string(),
    })
  ),
});

export const albumArtworkReviewQuerySchema = z.object({
  friend_id: intFromInputSchema.optional(),
  limit: z.preprocess(toInt, z.number().int().min(1).max(200)).optional().default(50),
});

export const albumArtworkReviewItemSchema = z.object({
  release_id: z.string(),
  friend_id: z.number().int(),
  title: z.string(),
  artist: z.string(),
  current_url: z.string().nullable(),
  discogs_art_url: z.string().nullable(),
  apple_music_art_url: z.string().nullable(),
  art_match_status: albumArtMatchStatusSchema,
  art_match_distance: z.number().int().nullable(),
});

export const albumArtworkReviewResponseSchema = z.object({
  albums: z.array(albumArtworkReviewItemSchema),
});

// Shapes live in @groovenet/contracts; these add the app's text coercion for
// ids and paging, and keep the names routes already import.
export const spinTrackRefSchema = sharedSpinTrackRefSchema;
export const spinSessionSchema = sharedSpinSessionSchema;
export const spinSelectionSchema = sharedSpinSelectionSchema;
export const trackSpinEventSchema = sharedTrackSpinEventSchema;
export const spinDerivedSchema = sharedSpinDerivedSchema;
export const spinAlbumSummarySchema = sharedSpinAlbumSummarySchema;
export const spinListItemSchema = spinSessionDetailSchema;

export const spinCreateBodySchema = spinCreateObjectSchema
  .extend({ friend_id: intFromInputSchema })
  .superRefine(refineSpinCreate);

export const spinCreateResponseSchema = sharedSpinCreateResponseSchema;

export const spinListQuerySchema = sharedSpinListQuerySchema.extend({
  friend_id: intFromInputSchema,
  limit: nonNegativeIntFromInputSchema.optional().default(50),
  offset: nonNegativeIntFromInputSchema.optional().default(0),
});

export const spinUpdateBodySchema = spinUpdateObjectSchema
  .extend({ friend_id: intFromInputSchema })
  .superRefine(refineSpinUpdate);

export const spinUpdateResponseSchema = sharedSpinUpdateResponseSchema;
export const spinListResponseSchema = sharedSpinListResponseSchema;

export const spinTopTracksQuerySchema = sharedSpinTopTracksQuerySchema.extend({
  friend_id: intFromInputSchema,
  limit: nonNegativeIntFromInputSchema.optional().default(20),
  offset: nonNegativeIntFromInputSchema.optional().default(0),
});

export const spinTopTrackItemSchema = spinTopTrackSchema;
export const spinTopTracksResponseSchema = sharedSpinTopTracksResponseSchema;

export const spinSessionParamsSchema = z.object({
  id: intFromInputSchema,
});

// ─── Manual aggregation backfill (#304) ───────────────────────────────────────
//
// Both automatic triggers for turning detections into spins — the immediate
// one and the periodic backstop — are bounded by PLAY_AGGREGATION_LOOKBACK_MINUTES
// (default 60), so a backlog older than that is never picked up on its own.
// This is the manual escape hatch: an explicit `since`, run once.

export const spinAggregateBodySchema = spinAggregateRequestSchema;
export const spinAggregateSourceResultSchema = sharedSpinAggregateSourceResultSchema;
export const spinAggregateResponseSchema = spinAggregateResultSchema;

export const spinDeleteQuerySchema = z.object({
  friend_id: intFromInputSchema,
});

export const spinDeleteResponseSchema = sharedSpinDeleteResponseSchema;

// ─── Record copies and care actions (#262) ────────────────────────────────────
//
// A release can stand for several physical copies; cleaning and sleeving
// belong to one copy. A release with no copy rows has one implicit default
// copy, made real by the first action logged against the release.

// Shapes live in @groovenet/contracts; these add the app's text coercion for
// ids, counts and flags, and keep the names routes already import.
const positiveIntFromInputSchema = z.preprocess(toInt, z.number().int().min(1));

export const sleeveTypeSchema = sharedSleeveTypeSchema;
export const recordActionTypeSchema = sharedRecordActionTypeSchema;
export const cleaningMethodSchema = sharedCleaningMethodSchema;
export const recordCareStatusSchema = sharedRecordCareStatusSchema;

export const recordCopySchema = sharedRecordCopySchema;
export const recordActionDetailsSchema = sharedRecordActionDetailsSchema;
export const recordActionSchema = sharedRecordActionSchema;

export const recordCopyParamsSchema = z.object({ id: intFromInputSchema });
export const recordActionParamsSchema = z.object({ id: intFromInputSchema });
export const recordFriendQuerySchema = z.object({ friend_id: intFromInputSchema });

export const recordCopyListQuerySchema = z.object({
  friend_id: intFromInputSchema,
  release_id: z.string().min(1).optional(),
});

export const recordCopyListItemSchema = sharedRecordCopyListItemSchema;
export const recordCopyListResponseSchema = sharedRecordCopyListResponseSchema;

export const recordCopyCreateBodySchema = recordCopyCreateSchema.extend({
  friend_id: intFromInputSchema,
});

export const recordCopyUpdateBodySchema = recordCopyUpdateObjectSchema
  .extend({ friend_id: intFromInputSchema })
  .refine(...requireLabelOrNotes);

export const recordCopyDefaultUpdateBodySchema = recordCopyDefaultUpdateObjectSchema
  .extend({ friend_id: intFromInputSchema })
  .refine(...requireLabelOrNotes);

export const recordCopyResponseSchema = sharedRecordCopyResponseSchema;
export const recordCopyDeleteResponseSchema = sharedRecordCopyDeleteResponseSchema;

export const recordActionListQuerySchema = sharedRecordActionListQuerySchema.extend({
  friend_id: intFromInputSchema,
  include_voided: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  limit: nonNegativeIntFromInputSchema.optional().default(50),
  offset: nonNegativeIntFromInputSchema.optional().default(0),
});

export const recordActionListResponseSchema = sharedRecordActionListResponseSchema;

export const recordActionCreateBodySchema = recordActionCreateObjectSchema
  .extend({
    friend_id: intFromInputSchema,
    copy_id: intFromInputSchema.optional(),
  })
  .superRefine(refineRecordActionCreate);

export const recordActionMutationResponseSchema = sharedRecordActionMutationResponseSchema;
export const recordActionVoidResponseSchema = sharedRecordActionVoidResponseSchema;

export const recordCareQuerySchema = sharedRecordCareQuerySchema.extend({
  friend_id: intFromInputSchema,
  overdue_days: positiveIntFromInputSchema.optional(),
  limit: nonNegativeIntFromInputSchema.optional().default(50),
  offset: nonNegativeIntFromInputSchema.optional().default(0),
});

export const recordCareItemSchema = sharedRecordCareItemSchema;
export const recordCareResponseSchema = sharedRecordCareResponseSchema;

export const recordCareSummaryQuerySchema = sharedRecordCareSummaryQuerySchema.extend({
  friend_id: intFromInputSchema,
  overdue_days: positiveIntFromInputSchema.optional(),
});

export const recordCareSummaryResponseSchema = recordCareSummarySchema;

export const albumUpdateBodySchema = z
  .object({
    ...albumTaxonomyOverrideFields.shape,
    release_id: z.string().min(1),
    friend_id: intFromInputSchema,
    album_rating: z.number().optional(),
    album_notes: z.string().optional(),
    purchase_price: z.number().optional(),
    condition: z.string().optional(),
    library_identifier: z.string().max(50).nullable().optional(),
  })
  .refine(
    (value) =>
      value.album_rating !== undefined ||
      value.album_notes !== undefined ||
      value.purchase_price !== undefined ||
      value.condition !== undefined ||
      value.library_identifier !== undefined ||
      value.genre_override_ids !== undefined ||
      value.style_override_ids !== undefined,
    {
      message: "No fields to update",
    }
  );

export const albumUpdateResponseSchema = z.object({
  success: z.boolean(),
  album: albumEntitySchema,
  tracksUpdated: z.number().int().optional(),
});

// ─── Fingerprints (#277) ──────────────────────────────────────────────────────

/**
 * One reference fingerprint, as `fingerprint-service` posts it after indexing a
 * library track. `fingerprint_data` is base64 because JSON has no bytes, and
 * null when the engine stores no payload — which is what the stub does.
 */
export const fingerprintUpsertBodySchema = z.object({
  track_id: z.string().min(1),
  friend_id: intFromInputSchema,
  fingerprint_type: z.string().min(1).max(50),
  fingerprint_version: z.string().min(1).max(50),
  fingerprint_data: z.string().base64().nullable().optional(),
  audio_sha256: z.string().regex(/^[0-9a-f]{64}$/, "must be a hex sha256"),
  audio_duration_seconds: z.number().positive().nullable().optional(),
  audio_size_bytes: z.number().int().nonnegative().nullable().optional(),
  audio_mtime_ms: z.number().int().nonnegative().nullable().optional(),
});

/** `fingerprint-service` recording that a fingerprint's audio is unchanged (#303). */
export const fingerprintFileStatsBodySchema = z.object({
  track_id: z.string().min(1),
  friend_id: intFromInputSchema,
  fingerprint_type: z.string().min(1).max(50),
  fingerprint_version: z.string().min(1).max(50),
  audio_sha256: z.string().regex(/^[0-9a-f]{64}$/, "must be a hex sha256"),
  audio_size_bytes: z.number().int().nonnegative(),
  audio_mtime_ms: z.number().int().nonnegative(),
});

export const fingerprintUpsertResponseSchema = z.object({
  track_id: z.string(),
  friend_id: z.number().int(),
  fingerprint_type: z.string(),
  fingerprint_version: z.string(),
  audio_sha256: z.string(),
  audio_duration_seconds: z.number().nullable(),
  updated_at: z.string(),
});

/**
 * Which slice of the library to index. Exactly one scope, so `--missing --all`
 * is rejected rather than silently resolved to one of them.
 */
export const fingerprintIndexBodySchema = z
  .object({
    scope: z.enum(["missing", "changed", "all", "track", "release"]),
    track_id: z.string().min(1).optional(),
    release_id: z.string().min(1).optional(),
    friend_id: intFromInputSchema.optional(),
    force: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "track" && !value.track_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scope 'track' requires track_id",
      });
    }
    if (value.scope === "release" && !value.release_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scope 'release' requires release_id",
      });
    }
  });

export const fingerprintIndexRunSchema = z.object({
  run_id: z.string(),
  scope: z.string(),
  fingerprint_type: z.string(),
  fingerprint_version: z.string(),
  queued: z.number().int(),
  unindexable: z.number().int(),
  indexed: z.number().int(),
  skipped: z.number().int(),
  failed: z.number().int(),
  errors: z.array(z.string()),
  started_at: z.number().int(),
  updated_at: z.number().int(),
  complete: z.boolean(),
});

// ─── Embeddings backfill (#388) ───────────────────────────────────────────────

const embeddingJobKindSchema = z.enum(["identity", "audio_vibe", "context"]);

/**
 * Which tracks to resolve. Exactly one of `track_ids`/`release_id` is
 * required for their matching scope, same shape as the fingerprint index body.
 */
export const embeddingsBackfillBodySchema = z
  .object({
    scope: z.enum(["missing", "all", "release", "track"]).default("missing"),
    types: z.array(embeddingJobKindSchema).min(1).optional(),
    friend_id: intFromInputSchema.optional(),
    release_id: z.string().min(1).optional(),
    track_ids: z.array(z.string().min(1)).min(1).optional(),
    limit: intFromInputSchema.optional(),
    // Orthogonal to scope, like the fingerprint index body: even a `release`
    // or `track` scope only fills what's missing by default, and `all`
    // implies it regardless of what's passed here.
    force: z.boolean().optional(),
    dry_run: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "track" && !value.track_ids?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scope 'track' requires track_ids",
      });
    }
    if (value.scope === "release" && !value.release_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scope 'release' requires release_id",
      });
    }
  });

export const embeddingsBackfillRunSchema = z.object({
  run_id: z.string(),
  queued: z.number().int(),
  success: z.number().int(),
  skipped: z.number().int(),
  failed: z.number().int(),
  errors: z.array(z.string()),
  started_at: z.number().int(),
  updated_at: z.number().int(),
  complete: z.boolean(),
});

export const embeddingsBackfillDryRunSchema = z.object({
  dry_run: z.literal(true),
  total: z.number().int(),
  by_type: z.object({
    identity: z.number().int(),
    audio_vibe: z.number().int(),
    context: z.number().int(),
  }),
});

const embeddingModelCoverageSchema = z.array(
  z.object({
    model: z.string(),
    dims: z.number().int(),
    template_version: z.number().int(),
    count: z.number().int(),
  })
);

export const embeddingsStatusSchema = z.object({
  total_tracks: z.number().int(),
  /** Tracks with no row at the target model and current template version (#407). */
  missing: z.object({
    identity: z.number().int(),
    audio_vibe: z.number().int(),
    context: z.number().int(),
  }),
  /** Row counts per model and template version, for watching a switch's backfill reach coverage (#386, #407). */
  by_model: z.object({
    identity: embeddingModelCoverageSchema,
    audio_vibe: embeddingModelCoverageSchema,
    context: embeddingModelCoverageSchema,
  }),
});

export const embeddingsStatusQuerySchema = z.object({
  friend_id: intFromInputSchema.optional(),
});

// ─── Embeddings queue status (#451) ───────────────────────────────────────────

export const embeddingQueueLaneDepthsSchema = z.object({
  interactive: z.number().int(),
  sync: z.number().int(),
  bulk: z.number().int(),
});

export const embeddingQueueKindCountsSchema = z.object({
  identity: z.number().int(),
  audio_vibe: z.number().int(),
  context: z.number().int(),
});

export const embeddingQueueActiveRunSchema = z.object({
  run_id: z.string(),
  queued: z.number().int(),
  success: z.number().int(),
  skipped: z.number().int(),
  failed: z.number().int(),
  started_at: z.number().int(),
  updated_at: z.number().int(),
});

export const embeddingQueueFailedJobSchema = z.object({
  id: z.string(),
  track_id: z.string(),
  friend_id: z.number().int(),
  kind: embeddingJobKindSchema,
  run_id: z.string().optional(),
  attempts: z.number().int(),
  error: z.string(),
  failed_at: z.number().int(),
});

export const embeddingQueueStatusSchema = z.object({
  lanes: embeddingQueueLaneDepthsSchema,
  retrying: z.number().int(),
  failed_count: z.number().int(),
  paused: z.boolean(),
  pause_reason: z.string().optional(),
  last_error: z.string().optional(),
  interval_seconds: z.number().int(),
  batch_size: z.number().int(),
  drain_rate_per_minute: z.number(),
  eta_seconds: z.number().int().nullable(),
  by_kind: embeddingQueueKindCountsSchema,
  by_kind_sampled: z.boolean(),
  active_backfill_runs: z.array(embeddingQueueActiveRunSchema),
  failed: z.array(embeddingQueueFailedJobSchema),
});

export const embeddingQueueRetryBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export const embeddingQueueRetryResponseSchema = z.object({
  retried: z.array(z.string()),
  not_found: z.array(z.string()),
});

// ─── Embedding model settings (#386) ──────────────────────────────────────────

export const embeddingModelKindSchema = z.enum(["identity", "audio_vibe", "context"]);

export const embeddingModelSettingsSchema = z.object({
  embedding_type: embeddingModelKindSchema,
  target_model: z.string(),
  target_dims: z.number().int(),
  serving_model: z.string(),
  serving_dims: z.number().int(),
  serving_template_version: z.number().int(),
});

export const embeddingModelSettingsListSchema = z.array(embeddingModelSettingsSchema);

// ─── Genre taxonomy (#370) ───────────────────────────────────────────────────

export const genreSourceSchema = z.enum(["discogs", "custom"]);
export type GenreTreeNode = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  source: "discogs" | "custom";
  track_count: number;
  album_count: number;
  /** Normalised alias keys (#376). */
  aliases?: string[];
  children: GenreTreeNode[];
};

export const genreTreeNodeSchema: z.ZodType<GenreTreeNode> = z.lazy(() =>
  z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    parent_id: z.string().uuid().nullable(),
    source: genreSourceSchema,
    track_count: z.number().int().nonnegative(),
    album_count: z.number().int().nonnegative(),
    aliases: z.array(z.string()).optional(),
    children: z.array(genreTreeNodeSchema),
  })
);

export const genreTreeResponseSchema = z.object({ genres: z.array(genreTreeNodeSchema) });

/** Per-genre track counts for the current search, subgenres included (#375). */
export const trackGenreFacetsResponseSchema = z.object({
  genres: z.array(z.object({ id: z.string(), track_count: z.number().int() })),
});
export type TrackGenreFacetsResponse = z.infer<typeof trackGenreFacetsResponseSchema>;

/** A genre as the genre page links to it (#376), with its track count, subgenres included. */
export const genrePageRefSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  track_count: z.number().int().nonnegative(),
});
export type GenrePageRef = z.infer<typeof genrePageRefSchema>;

/** What produced a similar-genre score (#377): a taxonomy relation, co-occurrence, or both. */
export const genreSimilaritySignalsSchema = z.object({
  taxonomy: z.enum(["sibling", "parent", "child"]).optional(),
  npmi: z.number().min(-1).max(1).optional(),
  shared_albums: z.number().int().nonnegative().optional(),
});
export type GenreSimilaritySignals = z.infer<typeof genreSimilaritySignalsSchema>;

/** A related genre (#377): stored similarity when it exists, else the sibling stand-in it falls back to. */
export const genreRelatedRefSchema = genrePageRefSchema.extend({
  score: z.number().optional(),
  signals: genreSimilaritySignalsSchema.optional(),
});
export type GenreRelatedRef = z.infer<typeof genreRelatedRefSchema>;

export const genrePageQuerySchema = z.object({ friend_id: intFromInputSchema.optional() });

/** `GET /api/genres/{id}`: one genre's place in the taxonomy and in the collection (#376). */
export const genrePageResponseSchema = z.object({
  genre: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    parent_id: z.string().uuid().nullable(),
    source: genreSourceSchema,
    aliases: z.array(z.string()),
  }),
  /** Root first, ending with the genre's parent. */
  ancestors: z.array(z.object({ id: z.string().uuid(), name: z.string(), slug: z.string() })),
  children: z.array(genrePageRefSchema),
  /** From the genre_similarity table (#377), falling back to taxonomy siblings when it has no rows yet. */
  related: z.array(genreRelatedRefSchema),
  counts: z.object({
    tracks: z.number().int().nonnegative(),
    albums: z.number().int().nonnegative(),
    tracks_total: z.number().int().nonnegative(),
    albums_total: z.number().int().nonnegative(),
  }),
  top_tracks: z.array(trackEntitySchema.extend({ play_count: z.number().int().nonnegative() })),
  top_albums: z.array(albumEntitySchema.extend({ play_count: z.number().int().nonnegative() })),
});
export type GenrePageResponse = z.infer<typeof genrePageResponseSchema>;

/** `GET /api/genres/{id}/similar` (#377): the same ranking `related` reads on the genre page, standalone. */
export const genreSimilarQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
});

export const genreSimilarResponseSchema = z.object({
  genre: genrePageRefSchema,
  related: z.array(genreRelatedRefSchema),
});
export type GenreSimilarResponse = z.infer<typeof genreSimilarResponseSchema>;

export const genreParamsSchema = z.object({ id: z.string().uuid() });
export const genreCreateBodySchema = z.object({ name: z.string().trim().min(1), parent_id: z.string().uuid() });
export const genreUpdateBodySchema = z.object({ name: z.string().trim().min(1).optional(), parent_id: z.string().uuid().nullable().optional() }).refine((value) => value.name !== undefined || value.parent_id !== undefined, { message: "name or parent_id is required" });
export const genreAliasBodySchema = z.object({ alias: z.string().trim().min(1) });
export const genreMergeBodySchema = z.object({ target_id: z.string().uuid() });
export const genreMutationResponseSchema = z.object({ id: z.string().uuid(), name: z.string(), slug: z.string(), parent_id: z.string().uuid().nullable(), source: genreSourceSchema });

/**
 * One field at a time, by design: `target` is "what new jobs embed with
 * from now on" and `serving` is "what similarity queries read right now" —
 * flipping both together is how a model switch would skip the coexistence
 * step it's built for.
 */
export const embeddingModelUpdateBodySchema = z
  .object({
    embedding_type: embeddingModelKindSchema,
    field: z.enum(["target", "serving"]),
    model: z.string().min(1),
    dims: intFromInputSchema.pipe(z.number().positive()),
    /**
     * Serving only: the template version reads switch to once its backfill is
     * complete (#407). Omit to keep the current one. Target needs none — new
     * jobs always embed with the code's current template.
     */
    template_version: intFromInputSchema.pipe(z.number().int().positive()).optional(),
  })
  .refine((body) => body.field === "serving" || body.template_version === undefined, {
    message: "template_version only applies to field: serving",
    path: ["template_version"],
  });

// ─── Audio ingest retention (#269) ────────────────────────────────────────────

export const ingestRetentionPolicySchema = z.object({
  maxAgeHours: z.number().positive(),
  maxBytes: z.number().positive(),
  orphanGraceMinutes: z.number().positive(),
  sweepIntervalMinutes: z.number().positive(),
});

export const ingestRetentionStatusSchema = z.object({
  files: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  sweepable: z.number().int().nonnegative(),
  orphans: z.number().int().nonnegative(),
  inFlight: z.number().int().nonnegative(),
  lastSweptAt: z.string().nullable(),
  policy: ingestRetentionPolicySchema,
});

// ─── Vinyl pipeline debug reads (#299) ─────────────────────────────────────────

export const ingestRecordSchema = z.object({
  ingest_id: z.string(),
  source_id: z.string(),
  session_id: z.string().nullable(),
  sequence: z.number().int().nullable(),
  status: z.enum(["received", "processing", "processed", "failed"]),
  error: z.string().nullable(),
  duration_seconds: z.number().nullable(),
  sample_rate: z.number().int().nullable(),
  channels: z.number().int().nullable(),
  codec: z.string().nullable(),
  file_path: z.string().nullable(),
  captured_at: z.string().nullable(),
  received_at: z.string(),
  updated_at: z.string(),
});

export const ingestRecentResponseSchema = z.object({
  ingests: z.array(ingestRecordSchema),
  count: z.number().int().nonnegative(),
});

/** One matched or no-match matcher window (#279 finds play boundaries in the gaps). */
export const detectionWindowSchema = z.object({
  id: z.string(),
  ingest_id: z.string(),
  source_id: z.string(),
  session_id: z.string().nullable(),
  window_start_at: z.string().nullable(),
  matched: z.boolean(),
  track_id: z.string().nullable(),
  friend_id: z.number().int().nullable(),
  title: z.string().nullable(),
  artist: z.string().nullable(),
  album: z.string().nullable(),
  confidence: z.number().nullable(),
  offset_seconds: z.number().nullable(),
  level_dbfs: z.number().nullable(),
  fingerprint_type: z.string().nullable(),
  fingerprint_version: z.string().nullable(),
  created_at: z.string(),
});

export const detectionsRecentResponseSchema = z.object({
  detections: z.array(detectionWindowSchema),
  count: z.number().int().nonnegative(),
});

const detectionConfidenceBandSchema = z.object({
  band: z.string(),
  count: z.number().int().nonnegative(),
});

/**
 * Whether the pipeline is working at all (#299).
 *
 * `index.empty` is stated outright rather than left to be inferred from a
 * zero: an empty reference index makes every other number here look healthy
 * while nothing can ever match.
 */
export const ingestPipelineStatsSchema = z.object({
  since: z.string(),
  window_minutes: z.number().int(),
  source_id: z.string().nullable(),
  ingest_writable: z.boolean(),
  index: z.object({
    engine_registered: z.boolean(),
    fingerprint_type: z.string().nullable(),
    fingerprint_version: z.string().nullable(),
    indexed_tracks: z.number().int().nonnegative(),
    empty: z.boolean(),
    missing_fingerprint_tracks: z.number().int().nonnegative(),
  }),
  queue_depth: z.number().int().nullable(),
  ingests: z.object({
    by_status: z.record(z.string(), z.number().int()),
    failures: z.array(
      z.object({ error: z.string(), count: z.number().int().nonnegative() })
    ),
    oldest_in_flight: z
      .object({
        ingest_id: z.string(),
        status: z.string(),
        received_at: z.string(),
      })
      .nullable(),
  }),
  detections: z.object({
    windows: z.number().int().nonnegative(),
    matched: z.number().int().nonnegative(),
    no_match: z.number().int().nonnegative(),
    match_rate: z.number().nullable(),
    confidence_bands: z.array(detectionConfidenceBandSchema),
  }),
  spins: z.object({
    pending: z.number().int().nullable(),
  }),
  counters: z
    .object({
      bucket_minutes: z.number().int(),
      chunks: z.object({
        received: z.number().int().nonnegative(),
        accepted: z.number().int().nonnegative(),
        duplicate: z.number().int().nonnegative(),
        rejected: z.number().int().nonnegative(),
        rejected_by_reason: z.array(
          z.object({ reason: z.string(), count: z.number().int().nonnegative() })
        ),
        failed_by_stage: z.array(
          z.object({ stage: z.string(), count: z.number().int().nonnegative() })
        ),
        enqueue_failed: z.number().int().nonnegative(),
      }),
      plays: z.object({
        confirmed: z.number().int().nonnegative(),
        latency_ms_avg: z.number().int().nullable(),
        latency_bands: z.array(
          z.object({ band: z.string(), count: z.number().int().nonnegative() })
        ),
      }),
    })
    .nullable()
    // Optional so a client built against this schema still reads an app
    // from before #280.
    .optional(),
});

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

export const fingerprintListResponseSchema = z.object({
  fingerprints: z.array(fingerprintListItemSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});

// ─── Audio ingest endpoint (#275) ─────────────────────────────────────────────

export const acceptedIngestSchema = z.object({
  status: z.literal("accepted"),
  ingest_id: z.string(),
  source_id: z.string(),
  duration_seconds: z.number(),
  sample_rate: z.number().nullable(),
  channels: z.number().nullable(),
  captured_at: z.string().nullable(),
});

/**
 * The rejection vocabulary, as the listener device reads it. These strings are
 * part of the contract — a Pi with no screen uses them to tell "this chunk is
 * bad, drop it" from "retry later", so they must not be reworded.
 */
export const ingestErrorSchema = z.object({
  error: z.enum([
    "missing_audio_file",
    "missing_source_id",
    "unsupported_audio_format",
    "invalid_audio_stream",
    "audio_too_large",
    "audio_too_short",
    "audio_too_long",
    "internal_error",
  ]),
  message: z.string(),
});

// ─── Ingest lifecycle (#276) ──────────────────────────────────────────────────

export const ingestMatchCandidateSchema = z.object({
  track_id: z.string().min(1),
  friend_id: intFromInputSchema,
  confidence: z.number(),
  offset_seconds: z.number(),
});

/**
 * The callback body from `fingerprint-service`.
 *
 * `ingest_id` is optional here because the path carries it; a body naming a
 * different ingest is ignored rather than honoured.
 */
export const ingestResultBodySchema = z.object({
  ingest_id: z.string().optional(),
  source_id: z.string().optional(),
  session_id: z.string().nullable().optional(),
  sequence: z.number().nullable().optional(),
  status: z.enum(["processed", "failed"]),
  error: z.string().nullable().optional(),
  error_stage: z.string().nullable().optional(),
  window_start_at: z.string().nullable().optional(),
  duration_seconds: z.number().nullable().optional(),
  sample_rate: z.number().nullable().optional(),
  level_dbfs: z.number().nullable().optional(),
  fingerprint_type: z.string().nullable().optional(),
  fingerprint_version: z.string().nullable().optional(),
  candidates: z.array(ingestMatchCandidateSchema).default([]),
});

// ─── Set derivation (#282) ────────────────────────────────────────────────────

export const setDerivationCreateBodySchema = z.object({
  recording_sha256: z.string().regex(/^[0-9a-f]{64}$/, "expected a lowercase hex sha256"),
  window_seconds: z.number().positive().optional(),
  step_seconds: z.number().positive().optional(),
  force: z.boolean().optional(),
  live_set_id: intFromInputSchema.nullable().optional(),
});

export const setWindowSchema = z.object({
  start_seconds: z.number(),
  duration_seconds: z.number(),
  candidates: z.array(ingestMatchCandidateSchema).default([]),
});

/** The callback body from `fingerprint-set-worker`. */
export const setDerivationResultBodySchema = z.object({
  derivation_id: z.string().optional(),
  status: z.enum(["processed", "failed"]),
  error: z.string().nullable().optional(),
  fingerprint_type: z.string().nullable().optional(),
  fingerprint_version: z.string().nullable().optional(),
  sample_rate: z.number().nullable().optional(),
  duration_seconds: z.number().nullable().optional(),
  window_seconds: z.number().optional(),
  step_seconds: z.number().optional(),
  windows: z.array(setWindowSchema).default([]),
});

export const setDerivationViewQuerySchema = z.object({
  playlist_id: intFromInputSchema.optional(),
  live_set_id: intFromInputSchema.optional(),
});

export const genreAliasResponseSchema = z.object({ success: z.literal(true) });
export const genreMergeResponseSchema = z.object({ success: z.literal(true), merged_genre_id: z.string().uuid(), survivor_genre_id: z.string().uuid() });

// ─── Genre reconciliation (#372) ─────────────────────────────────────────────

/** A timestamptz column: pg hands back a Date; the wire carries ISO 8601. */
const timestampSchema = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString() : value),
  z.string()
);

export const genreProposalActionSchema = z.enum(["map", "new_genre", "descriptor", "drop"]);
export const genreProposalMethodSchema = z.enum(["exact", "ai", "manual"]);
export const genreProposalStatusSchema = z.enum(["pending", "accepted", "rejected", "edited"]);

export const genreReconciliationRunBodySchema = z
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
    // Runs from before the friend scope have no friend_id: they covered everyone.
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
  started_at: timestampSchema,
  updated_at: timestampSchema,
  finished_at: timestampSchema.nullable(),
});

export const genreProposalSchema = z.object({
  id: z.string().uuid(),
  value_normalized: z.string(),
  raw_examples: z.array(z.string()),
  track_count: z.number().int(),
  action: genreProposalActionSchema,
  target_genre_ids: z.array(z.string().uuid()),
  target_genres: z.array(z.object({ id: z.string().uuid(), name: z.string(), parent_name: z.string().nullable() })),
  proposed_genre_name: z.string().nullable(),
  proposed_parent_id: z.string().uuid().nullable(),
  proposed_parent_name: z.string().nullable(),
  confidence: z.number().nullable(),
  method: genreProposalMethodSchema,
  status: genreProposalStatusSchema,
  run_id: z.string().uuid().nullable(),
  created_genre_id: z.string().uuid().nullable(),
  applied_at: timestampSchema.nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

export const genreProposalListQuerySchema = z.object({
  status: genreProposalStatusSchema.optional(),
  action: genreProposalActionSchema.optional(),
  method: genreProposalMethodSchema.optional(),
  min_tracks: intFromInputSchema.pipe(z.number().int().min(0)).optional(),
  limit: intFromInputSchema.pipe(z.number().int().min(1).max(500)).optional(),
  offset: intFromInputSchema.pipe(z.number().int().min(0)).optional(),
});

export const genreProposalListResponseSchema = z.object({
  proposals: z.array(genreProposalSchema),
  total: z.number().int(),
});

const genreProposalChangeFields = {
  status: genreProposalStatusSchema.optional(),
  action: genreProposalActionSchema.optional(),
  target_genres: z.array(z.string().trim().min(1)).max(10).optional(),
  proposed_genre_name: z.string().nullable().optional(),
  proposed_parent_id: z.string().uuid().nullable().optional(),
};
const hasChange = (value: Record<string, unknown>) =>
  Object.entries(value).some(([key, field]) => key !== "id" && field !== undefined);

export const genreProposalUpdateBodySchema = z
  .object(genreProposalChangeFields)
  .strict()
  .refine(hasChange, { message: "Nothing to update" });

export const genreProposalDecisionsBodySchema = z
  .object({
    decisions: z
      .array(
        z
          .object({ id: z.string().uuid(), ...genreProposalChangeFields })
          .strict()
          .refine(hasChange, { message: "Nothing to update" })
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

export const genreProposalDecisionsResponseSchema = z.object({
  proposals: z.array(genreProposalSchema),
  previous: z.array(genreProposalSnapshotSchema),
});

export const genreProposalRestoreBodySchema = z
  .object({ snapshots: z.array(genreProposalSnapshotSchema.strict()).min(1).max(500) })
  .strict();

export const genreProposalRestoreResponseSchema = z.object({ restored: z.number().int() });

export const genreProposalTracksQuerySchema = z.object({
  friend_id: intFromInputSchema.pipe(z.number().int().min(1)).optional(),
  limit: intFromInputSchema.pipe(z.number().int().min(1).max(20)).optional(),
});

export const genreProposalTracksResponseSchema = z.object({
  tracks: z.array(
    z.object({
      track_id: z.string(),
      friend_id: z.number().int(),
      title: z.string(),
      artist: z.string(),
      album: z.string().nullable(),
      styles: z.array(z.string()),
    })
  ),
});

export const genreProposalApplyBodySchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).optional(),
    friend_id: z.number().int().min(1).optional(),
  })
  .strict();

export const genreReconciliationCoverageQuerySchema = z.object({
  friend_id: intFromInputSchema.pipe(z.number().int().min(1)).optional(),
});

export const genreProposalApplyResponseSchema = z.object({
  proposals_applied: z.number().int(),
  tracks_linked: z.number().int(),
  descriptors_added: z.number().int(),
  aliases_added: z.number().int(),
  genres_created: z.number().int(),
  skipped: z.array(z.object({ id: z.string().uuid(), value: z.string(), reason: z.string() })),
});

const countsOf = <T extends string>(keys: readonly T[]) =>
  z.object(Object.fromEntries(keys.map((key) => [key, z.number().int()])) as Record<T, z.ZodNumber>);

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

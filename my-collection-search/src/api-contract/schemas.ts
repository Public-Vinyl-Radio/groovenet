import {
  booleanFlagSchema,
  genreQueryParamSchema,
  intFromInputSchema,
  nonNegativeIntFromInputSchema,
  numberFromInputSchema,
  positiveIntFromInputSchema,
  toInt,
} from "@groovenet/contracts/coercion";
export { intFromInputSchema, nonNegativeIntFromInputSchema } from "@groovenet/contracts/coercion";
import { homeQuerySchema as sharedHomeQuerySchema, homeResponseSchema } from "@groovenet/contracts";
import {
  genrePageQuerySchema as sharedGenrePageQuerySchema,
  genreSimilarQuerySchema as sharedGenreSimilarQuerySchema,
} from "@groovenet/contracts";
import {
  aiPromptSettingsQuerySchema as sharedAiPromptSettingsQuerySchema,
  aiPromptSettingsSchema,
  aiPromptSettingsUpdateResponseSchema,
  aiPromptSettingsUpdateSchema,
  appearanceCornersSchema,
  appearancePaletteSchema,
  appearanceSettingsSchema,
  appearanceSettingsUpdateObjectSchema,
  gamdlActionRequestSchema,
  gamdlActionResponseSchema,
  gamdlActionSchema,
  gamdlAudioFormatSchema as sharedGamdlAudioFormatSchema,
  gamdlAudioQualitySchema as sharedGamdlAudioQualitySchema,
  gamdlConnectionTestDetailsSchema as sharedGamdlConnectionTestDetailsSchema,
  gamdlConnectionTestResponseSchema as sharedGamdlConnectionTestResponseSchema,
  gamdlCookieDeleteResponseSchema as sharedGamdlCookieDeleteResponseSchema,
  gamdlCookieFileInfoSchema as sharedGamdlCookieFileInfoSchema,
  gamdlCookieUploadResponseSchema as sharedGamdlCookieUploadResponseSchema,
  gamdlCoverFormatSchema as sharedGamdlCoverFormatSchema,
  gamdlLyricsFormatSchema as sharedGamdlLyricsFormatSchema,
  gamdlSettingsQuerySchema as sharedGamdlSettingsQuerySchema,
  gamdlSettingsResetResponseSchema as sharedGamdlSettingsResetResponseSchema,
  gamdlSettingsResponseSchema,
  gamdlSettingsSchema as sharedGamdlSettingsSchema,
  gamdlSettingsUpdateResponseSchema,
  gamdlSettingsUpdateSchema,
  recommendationScopeSchema,
  recommendationSettingsQuerySchema as sharedRecommendationSettingsQuerySchema,
  recommendationSettingsSchema,
  recommendationSettingsUpdateSchema,
  refineAppearanceSettingsUpdate,
} from "@groovenet/contracts";
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
  albumSearchQuerySchema as sharedAlbumSearchQuerySchema,
  trackSearchQuerySchema as sharedTrackSearchQuerySchema,
  genreFilterRefSchema,
  trackAnalyzeAsyncRequestSchema as sharedTrackAnalyzeAsyncRequestSchema,
  trackAnalyzeAsyncResponseSchema,
  trackAudioMetadataEmbeddedCoverSchema,
  trackAudioMetadataSchema,
  trackDeleteResponseSchema,
  trackAudioVibeEmbeddingDataSchema,
  trackContextEmbeddingPreviewSchema,
  trackEmbeddingPreviewSchema,
  trackEmbeddingPreviewTypeSchema,
  trackEssentiaSchema,
  trackExtractEmbeddedCoverRequestSchema,
  trackExtractEmbeddedCoverResponseSchema,
  trackFixDurationRequestSchema as sharedTrackFixDurationRequestSchema,
  trackFixDurationResponseSchema,
  trackGenreFacetsResponseSchema,
  trackGenreSchema,
  trackIdentityEmbeddingDataSchema,
  trackAudioVibeEmbeddingPreviewSchema,
  trackIdentityEmbeddingPreviewSchema,
  trackPlaylistCountRefSchema,
  trackPlaylistCountsRequestSchema,
  trackPlaylistCountsResponseSchema,
  trackPlaylistMembershipSchema,
  trackPlaylistsResponseSchema,
  trackRestoreResponseSchema,
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
  recordCareLogQuerySchema as sharedRecordCareLogQuerySchema,
  recordCareLogResponseSchema as sharedRecordCareLogResponseSchema,
  recordCareSessionCreateObjectSchema,
  recordCareSessionMutationResponseSchema as sharedRecordCareSessionMutationResponseSchema,
  recordCareSessionVoidResponseSchema as sharedRecordCareSessionVoidResponseSchema,
  recordCareSessionVoidSchema,
  recordCareStackDiscardResponseSchema as sharedRecordCareStackDiscardResponseSchema,
  recordCareStackListQuerySchema as sharedRecordCareStackListQuerySchema,
  recordCareStackListResponseSchema as sharedRecordCareStackListResponseSchema,
  recordCareStackPullObjectSchema,
  recordCareStackPullResponseSchema as sharedRecordCareStackPullResponseSchema,
  recordCareStackResponseSchema as sharedRecordCareStackResponseSchema,
  refineRecordCareSessionCreate,
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
  spinRecapQuerySchema as sharedSpinRecapQuerySchema,
  spinRecapResponseSchema,
  spinTrackStatsQuerySchema as sharedSpinTrackStatsQuerySchema,
  spinTrackStatsResponseSchema,
  spinTopTracksQuerySchema as sharedSpinTopTracksQuerySchema,
  spinTopTracksResponseSchema as sharedSpinTopTracksResponseSchema,
  spinTrackRefSchema as sharedSpinTrackRefSchema,
  spinUpdateObjectSchema,
  spinUpdateResponseSchema as sharedSpinUpdateResponseSchema,
  trackSpinEventSchema as sharedTrackSpinEventSchema,
} from "@groovenet/contracts";
import { customPaletteSchema } from "@/app/palettes/custom";

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

export const gamdlCookieFileInfoSchema = sharedGamdlCookieFileInfoSchema;
export const gamdlCookieUploadResponseSchema = sharedGamdlCookieUploadResponseSchema;
export const gamdlCookieDeleteResponseSchema = sharedGamdlCookieDeleteResponseSchema;
export const gamdlAudioQualitySchema = sharedGamdlAudioQualitySchema;
export const gamdlAudioFormatSchema = sharedGamdlAudioFormatSchema;
export const gamdlCoverFormatSchema = sharedGamdlCoverFormatSchema;
export const gamdlLyricsFormatSchema = sharedGamdlLyricsFormatSchema;
export const gamdlSettingsSchema = sharedGamdlSettingsSchema;
export const gamdlSettingsGetResponseSchema = gamdlSettingsResponseSchema;
export const gamdlSettingsPutResponseSchema = gamdlSettingsUpdateResponseSchema;
export const gamdlSettingsResetResponseSchema = sharedGamdlSettingsResetResponseSchema;
export const gamdlConnectionTestDetailsSchema = sharedGamdlConnectionTestDetailsSchema;
export const gamdlConnectionTestResponseSchema = sharedGamdlConnectionTestResponseSchema;

export { gamdlActionRequestSchema, gamdlActionResponseSchema, gamdlActionSchema };

export const gamdlSettingsQuerySchema = sharedGamdlSettingsQuerySchema.extend({
  friend_id: intFromInputSchema,
});

// The repository drops fields it does not know instead of rejecting them, so
// the body is not `.strict()`; `max_retries` keeps the app's text coercion.
export const gamdlSettingsPutBodySchema = gamdlSettingsUpdateSchema.extend({
  friend_id: intFromInputSchema,
  max_retries: intFromInputSchema.optional(),
});

export const gamdlSettingsResetBodySchema = z.object({
  friend_id: intFromInputSchema,
});

export const backupProviderSchema = z.enum(["restic-b2"]);
export const backupRetentionPresetSchema = z.enum(["aggressive", "balanced", "archive"]);

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

export const jobsListQuerySchema = z.object({
  limit: nonNegativeIntFromInputSchema.optional().default(100),
  offset: nonNegativeIntFromInputSchema.optional().default(0),
  state: z.enum(["all", "waiting", "active", "completed", "failed"]).optional().default("all"),
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
  showCurrentUser: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
});

export const friendsListResponseSchema = friendListResponseSchema;

export const friendMutationBodySchema = friendCreateSchema;

export const friendMutationResponseSchema = friendCreateResponseSchema;

export const friendDeleteQuerySchema = z.object({
  username: z.string().min(1),
});

/** A library on Settings → Libraries: a friends row with what it holds and when it last synced. */
export const libraryWithStatsSchema = friendSchema.extend({
  /** The server's own Discogs account (`DISCOGS_USERNAME`), which can't be removed. */
  is_account: z.boolean(),
  /** Albums in Postgres for this library. */
  release_count: z.number().int().nonnegative(),
  /** When its manifest was last written by a sync; null before the first sync. */
  last_synced_at: z.string().nullable(),
});

export const librariesListResponseSchema = z.object({
  results: z.array(libraryWithStatsSchema),
  /** `DISCOGS_USERNAME`, or null when the server has none. */
  account_username: z.string().nullable(),
});

// Discogs usernames are letters, digits, dots, hyphens and underscores.
export const discogsUsernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._-]+$/, "Invalid Discogs username");

/** Whether a Discogs user exists, and how many releases their collection holds. */
export const discogsUserLookupResponseSchema = z.discriminatedUnion("found", [
  z.object({
    username: z.string(),
    found: z.literal(true),
    release_count: z.number().int().nonnegative(),
  }),
  z.object({ username: z.string(), found: z.literal(false) }),
]);

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
  trackAnalyzeAsyncResponseSchema,
  trackAudioMetadataEmbeddedCoverSchema,
  trackDeleteResponseSchema,
  trackExtractEmbeddedCoverRequestSchema,
  trackExtractEmbeddedCoverResponseSchema,
  trackFixDurationResponseSchema,
  trackGenreSchema,
  trackPlaylistCountRefSchema,
  trackPlaylistCountsResponseSchema,
  trackPlaylistMembershipSchema,
  trackPlaylistsResponseSchema,
  trackRestoreResponseSchema,
  trackSearchModeSchema,
};
export const albumEntitySchema = albumSchema;
export const trackEntitySchema = trackSchema;
export const albumDetailResponseSchema = albumDetailSchema;
export const albumPlayableStructureResponseSchema = albumPlayableStructureSchema;
export const trackAudioMetadataResponseSchema = trackAudioMetadataSchema;
export const trackEssentiaResponseSchema = trackEssentiaSchema;
export const trackPlaylistCountsBodySchema = trackPlaylistCountsRequestSchema;

/** Job bodies keep the route's text coercion: `friend_id` may arrive as a numeric string. */
export const trackAnalyzeAsyncBodySchema = sharedTrackAnalyzeAsyncRequestSchema.extend({
  friend_id: intFromInputSchema,
});
export const trackFixDurationBodySchema = sharedTrackFixDurationRequestSchema.extend({
  friend_id: intFromInputSchema,
});
export const trackSearchGetResponseSchema = trackSearchResponseSchema;

/** A genre a widened filter added (#485): the removable "+ Chicha, Porro" chip. */
export type GenreFilterRefDto = GenreFilterRef;

export const trackSearchGetQuerySchema = sharedTrackSearchQuerySchema.extend({
  q: sharedTrackSearchQuerySchema.shape.q.default(""),
  limit: nonNegativeIntFromInputSchema.optional().default(20),
  offset: nonNegativeIntFromInputSchema.optional().default(0),
  friend_id: intFromInputSchema.optional(),
  /**
   * `lexical` (default) is full-text + trigram. `semantic` ranks by the
   * `context` embedding; `hybrid` fuses both (#409). Both are one page:
   * `offset` must be 0 and `limit` at most 50.
   */
  mode: sharedTrackSearchQuerySchema.shape.mode.default("lexical"),
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

export const embeddingPreviewTypeSchema = trackEmbeddingPreviewTypeSchema;
export const identityEmbeddingDataSchema = trackIdentityEmbeddingDataSchema;
export const audioVibeEmbeddingDataSchema = trackAudioVibeEmbeddingDataSchema;
export const embeddingIdentityPreviewApiResponseSchema = trackIdentityEmbeddingPreviewSchema;
export const embeddingAudioVibePreviewApiResponseSchema = trackAudioVibeEmbeddingPreviewSchema;
export const embeddingContextPreviewApiResponseSchema = trackContextEmbeddingPreviewSchema;
export const embeddingPreviewResponseSchema = trackEmbeddingPreviewSchema;

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

export { recommendationScopeSchema };

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

export const aiPromptSettingsQuerySchema = sharedAiPromptSettingsQuerySchema.extend({
  friend_id: intFromInputSchema.optional(),
});

export const aiPromptSettingsPutBodySchema = aiPromptSettingsUpdateSchema.extend({
  friend_id: intFromInputSchema,
});

export const aiPromptSettingsGetResponseSchema = aiPromptSettingsSchema;

export const aiPromptSettingsPutResponseSchema = aiPromptSettingsUpdateResponseSchema;

// `custom` is the reserved id of the saved custom palette; the service accepts
// it only while one is stored.
export { appearancePaletteSchema, appearanceCornersSchema };

// The shared body validates the wire shape; the app swaps in its own custom
// palette schema, which lowercases the colours before they are stored.
export const appearanceSettingsPutBodySchema = appearanceSettingsUpdateObjectSchema
  .extend({ customPalette: customPaletteSchema.nullable().optional() })
  .refine(refineAppearanceSettingsUpdate, {
    path: ["palette"],
    message: "palette custom needs a custom palette",
  });

export const appearanceSettingsResponseSchema = appearanceSettingsSchema;

export const recommendationSettingsQuerySchema = sharedRecommendationSettingsQuerySchema.extend({
  friend_id: intFromInputSchema,
});

export const recommendationSettingsPutBodySchema = recommendationSettingsUpdateSchema.extend({
  friend_id: intFromInputSchema,
});

export const recommendationSettingsResponseSchema = recommendationSettingsSchema;

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

export const albumSearchQuerySchema = sharedAlbumSearchQuerySchema.extend({
  q: sharedAlbumSearchQuerySchema.shape.q.default(""),
  sort: sharedAlbumSearchQuerySchema.shape.sort.default("created_at:desc"),
  friend_id: intFromInputSchema.optional(),
  limit: nonNegativeIntFromInputSchema.optional().default(20),
  offset: nonNegativeIntFromInputSchema.optional().default(0),
  genre: genreQueryParamSchema,
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
    }),
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

export const spinListQuerySchema = sharedSpinListQuerySchema
  .extend({
    friend_id: intFromInputSchema,
    limit: nonNegativeIntFromInputSchema.optional().default(50),
    offset: nonNegativeIntFromInputSchema.optional().default(0),
  })
  .refine((query) => !query.cursor || query.offset === 0, {
    message: "cursor cannot be combined with a non-zero offset",
    path: ["cursor"],
  });

export const spinUpdateBodySchema = spinUpdateObjectSchema
  .extend({ friend_id: intFromInputSchema })
  .superRefine(refineSpinUpdate);

export const spinUpdateResponseSchema = sharedSpinUpdateResponseSchema;
export const spinListResponseSchema = sharedSpinListResponseSchema;

export { spinRecapResponseSchema, spinTrackStatsResponseSchema };
export const spinTrackStatsQuerySchema = sharedSpinTrackStatsQuerySchema.extend({
  friend_id: z
    .string()
    .regex(/^[0-9]+$/)
    .transform(Number)
    .pipe(z.number().int().positive()),
});
export const spinRecapQuerySchema = sharedSpinRecapQuerySchema.extend({
  friend_id: z
    .string()
    .regex(/^[0-9]+$/)
    .transform(Number)
    .pipe(z.number().int().positive()),
});

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

// Care stacks and batch logs (#941).
export const recordCareSessionParamsSchema = z.object({ id: intFromInputSchema });

export const recordCareStackPullBodySchema = recordCareStackPullObjectSchema.extend({
  friend_id: intFromInputSchema,
});

export const recordCareStackListQuerySchema = sharedRecordCareStackListQuerySchema.extend({
  friend_id: intFromInputSchema,
  limit: nonNegativeIntFromInputSchema.optional().default(20),
  offset: nonNegativeIntFromInputSchema.optional().default(0),
});

export const recordCareSessionCreateBodySchema = recordCareSessionCreateObjectSchema
  .extend({
    friend_id: intFromInputSchema,
    stack_id: intFromInputSchema.optional(),
  })
  .superRefine(refineRecordCareSessionCreate);

export const recordCareSessionVoidBodySchema = recordCareSessionVoidSchema.extend({
  friend_id: intFromInputSchema,
});

export const recordCareLogQuerySchema = sharedRecordCareLogQuerySchema.extend({
  friend_id: intFromInputSchema,
  limit: nonNegativeIntFromInputSchema.optional().default(20),
  offset: nonNegativeIntFromInputSchema.optional().default(0),
});

export const recordCareStackResponseSchema = sharedRecordCareStackResponseSchema;
export const recordCareStackPullResponseSchema = sharedRecordCareStackPullResponseSchema;
export const recordCareStackListResponseSchema = sharedRecordCareStackListResponseSchema;
export const recordCareStackDiscardResponseSchema = sharedRecordCareStackDiscardResponseSchema;
export const recordCareSessionMutationResponseSchema =
  sharedRecordCareSessionMutationResponseSchema;
export const recordCareSessionVoidResponseSchema = sharedRecordCareSessionVoidResponseSchema;
export const recordCareLogResponseSchema = sharedRecordCareLogResponseSchema;

/** A friend id the PATCH routes require: a positive integer, numeric strings accepted. */
const requiredFriendIdSchema = (error: string) =>
  z.preprocess(toInt, z.number({ error }).int({ error }).positive({ error }));

/** The scalar half of `PATCH /api/albums`; the `error` strings are what the route returns. */
export const albumUpdateFieldsSchema = z.object({
  release_id: z
    .string({ error: "release_id and friend_id are required" })
    .min(1, { error: "release_id and friend_id are required" }),
  friend_id: requiredFriendIdSchema("release_id and friend_id are required"),
  album_rating: z.number({ error: "album_rating must be a number" }).optional(),
  album_notes: z.string({ error: "album_notes must be a string" }).optional(),
  purchase_price: z.number({ error: "purchase_price must be a number" }).optional(),
  condition: z.string({ error: "condition must be a string" }).optional(),
  library_identifier: z
    .string({ error: "library_identifier must be a string or null" })
    .max(50, { error: "library_identifier must be 50 characters or less" })
    .nullable()
    .optional(),
});
export type AlbumUpdateFields = z.infer<typeof albumUpdateFieldsSchema>;

/**
 * `PATCH /api/tracks`. Only the identity and the taxonomy fields are checked:
 * every other key is passed through untyped and the repository keeps just the
 * columns it can update, so a client sending extra or loosely typed fields
 * (`bpm` as a string, say) has always worked and still does.
 */
export const trackUpdateBodySchema = z
  .object({
    track_id: z
      .string({ error: "track_id and friend_id are required" })
      .min(1, { error: "track_id and friend_id are required" }),
    friend_id: requiredFriendIdSchema("track_id and friend_id are required"),
    genres: z
      .array(z.string({ error: "genres must be an array of genre ids or names" }), {
        error: "genres must be an array of genre ids or names",
      })
      .optional(),
    descriptors: z
      .array(z.string({ error: "descriptors must be an array of strings" }), {
        error: "descriptors must be an array of strings",
      })
      .optional(),
    genre_source: z
      .enum(["manual", "enrichment"], { error: "genre_source must be 'manual' or 'enrichment'" })
      .optional(),
  })
  .passthrough();
export type TrackUpdateBody = z.infer<typeof trackUpdateBodySchema>;

export const albumUpdateBodySchema = z
  .object({
    ...albumTaxonomyOverrideFields.shape,
    ...albumUpdateFieldsSchema.shape,
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
    },
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
  }),
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

export {
  genreSourceSchema,
  genreTreeNodeSchema,
  genreTreeResponseSchema,
  genrePageRefSchema,
  genreSimilaritySignalsSchema,
  genreRelatedRefSchema,
  genrePageResponseSchema,
  genreSimilarResponseSchema,
  genreParamsSchema,
  genreCreateBodySchema,
  genreUpdateBodySchema,
  genreAliasBodySchema,
  genreMergeBodySchema,
  genreMutationResponseSchema,
  genreAliasResponseSchema,
  genreMergeResponseSchema,
} from "@groovenet/contracts";
export type {
  GenreTreeNode,
  GenrePageRef,
  GenreSimilaritySignals,
  GenreRelatedRef,
  GenrePageResponse,
  GenreSimilarResponse,
} from "@groovenet/contracts";

export const genrePageQuerySchema = sharedGenrePageQuerySchema.extend({
  friend_id: intFromInputSchema.optional(),
});
export const genreSimilarQuerySchema = sharedGenreSimilarQuerySchema.extend({
  limit: z.coerce.number().int().positive().optional(),
});

export { trackGenreFacetsResponseSchema };
export type TrackGenreFacetsResponse = z.infer<typeof trackGenreFacetsResponseSchema>;

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
    failures: z.array(z.object({ error: z.string(), count: z.number().int().nonnegative() })),
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
          z.object({ reason: z.string(), count: z.number().int().nonnegative() }),
        ),
        failed_by_stage: z.array(
          z.object({ stage: z.string(), count: z.number().int().nonnegative() }),
        ),
        enqueue_failed: z.number().int().nonnegative(),
      }),
      plays: z.object({
        confirmed: z.number().int().nonnegative(),
        latency_ms_avg: z.number().int().nullable(),
        latency_bands: z.array(
          z.object({ band: z.string(), count: z.number().int().nonnegative() }),
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

// ─── Genre reconciliation (#372) ─────────────────────────────────────────────

/** A timestamptz column: pg hands back a Date; the wire carries ISO 8601. */
const timestampSchema = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString() : value),
  z.string(),
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
  target_genres: z.array(
    z.object({ id: z.string().uuid(), name: z.string(), parent_name: z.string().nullable() }),
  ),
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
          .refine(hasChange, { message: "Nothing to update" }),
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
    }),
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
  z.object(
    Object.fromEntries(keys.map((key) => [key, z.number().int()])) as Record<T, z.ZodNumber>,
  );

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

// Player browser sessions carry no worker credentials.
export const playerWebSessionSchema = z.object({ authorized: z.boolean() });
export const playerWebUnlockSchema = z.object({ passphrase: z.string().min(1).max(4096) }).strict();

export { homeResponseSchema };
export const homeQuerySchema = sharedHomeQuerySchema.extend({
  friend_id: z
    .string()
    .regex(/^[0-9]+$/)
    .transform(Number)
    .pipe(z.number().int().positive()),
});

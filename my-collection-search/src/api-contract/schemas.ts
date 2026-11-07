import { trackAudioFileFieldsSchema } from "@groovenet/contracts";
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
  embeddingModelUpdateObjectSchema,
  embeddingsBackfillObjectSchema,
  embeddingsStatusQuerySchema as sharedEmbeddingsStatusQuerySchema,
  recommendationSeedTrackSchema as sharedRecommendationSeedTrackSchema,
  recommendationsBatchBodySchema as sharedRecommendationsBatchBodySchema,
  recommendationsQuerySchema as sharedRecommendationsQuerySchema,
  refineEmbeddingsBackfillBody,
  requireServingForTemplateVersion,
} from "@groovenet/contracts";
import {
  jobEventSchema,
  jobStateFilterSchema,
  jobsListQuerySchema as sharedJobsListQuerySchema,
} from "@groovenet/contracts";
import {
  genrePageQuerySchema as sharedGenrePageQuerySchema,
  artistPageQuerySchema as sharedArtistPageQuerySchema,
  artistListQuerySchema as sharedArtistListQuerySchema,
  genreSimilarQuerySchema as sharedGenreSimilarQuerySchema,
} from "@groovenet/contracts";
import {
  acceptedIngestSchema,
  detectionWindowSchema,
  detectionsRecentResponseSchema,
  fingerprintFileStatsBodyObjectSchema,
  fingerprintFileStatsResponseSchema,
  fingerprintIndexBodyObjectSchema,
  fingerprintIndexRunSchema,
  fingerprintListItemSchema,
  fingerprintListResponseSchema,
  fingerprintUpsertBodyObjectSchema,
  fingerprintUpsertResponseSchema,
  ingestErrorSchema,
  ingestMatchCandidateSchema as sharedIngestMatchCandidateSchema,
  ingestPipelineStatsSchema,
  ingestRecentResponseSchema,
  ingestRecordSchema,
  ingestResultBodyObjectSchema,
  ingestRetentionPolicySchema,
  ingestRetentionStatusSchema,
  refineFingerprintIndexBody,
  setDerivationCreateBodyObjectSchema,
  setDerivationResultBodyObjectSchema,
  setDerivationViewQuerySchema as sharedSetDerivationViewQuerySchema,
  setWindowSchema as sharedSetWindowSchema,
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
  appleMusicResultSchema,
  discogsDeleteReleasesRequestSchema,
  discogsDeleteReleasesResponseSchema as sharedDiscogsDeleteReleasesResponseSchema,
  discogsLookupQuerySchema as sharedDiscogsLookupQuerySchema,
  discogsLookupReleaseSchema as sharedDiscogsLookupReleaseSchema,
  discogsLookupResponseSchema as sharedDiscogsLookupResponseSchema,
  discogsLookupTrackSchema as sharedDiscogsLookupTrackSchema,
  discogsUsernameSchema as sharedDiscogsUsernameSchema,
  discogsUserLookupResponseSchema as sharedDiscogsUserLookupResponseSchema,
  manifestCleanupResponseSchema as sharedManifestCleanupResponseSchema,
  manifestCleanupResultSchema as sharedManifestCleanupResultSchema,
  manifestVerificationResponseSchema as sharedManifestVerificationResponseSchema,
  manifestVerificationResultSchema as sharedManifestVerificationResultSchema,
  providerAppleMusicSearchRequestSchema,
  providerAppleMusicSearchResponseSchema as sharedProviderAppleMusicSearchResponseSchema,
  providerTrackMetadataRequestSchema,
  providerTrackMetadataResponseSchema as sharedProviderTrackMetadataResponseSchema,
  providerYouTubeMusicSearchRequestSchema,
  providerYouTubeMusicSearchResponseSchema as sharedProviderYouTubeMusicSearchResponseSchema,
  youtubeVideoSchema,
} from "@groovenet/contracts";
import {
  genreProposalActionSchema as sharedGenreProposalActionSchema,
  genreProposalMethodSchema as sharedGenreProposalMethodSchema,
  genreProposalStatusSchema as sharedGenreProposalStatusSchema,
  genreReconciliationRunRequestSchema,
  genreReconciliationRunSchema as sharedGenreReconciliationRunSchema,
  genreProposalSchema as sharedGenreProposalSchema,
  genreProposalQuerySchema as sharedGenreProposalQuerySchema,
  genreProposalListResponseSchema as sharedGenreProposalListResponseSchema,
  genreProposalUpdateSchema as sharedGenreProposalUpdateSchema,
  genreProposalDecisionRequestSchema,
  genreProposalSnapshotSchema as sharedGenreProposalSnapshotSchema,
  genreProposalDecisionResponseSchema as sharedGenreProposalDecisionResponseSchema,
  genreProposalRestoreRequestSchema,
  genreProposalRestoreResponseSchema as sharedGenreProposalRestoreResponseSchema,
  genreProposalTracksResponseSchema as sharedGenreProposalTracksResponseSchema,
  genreProposalApplyRequestSchema,
  genreProposalApplyResponseSchema as sharedGenreProposalApplyResponseSchema,
  genreReconciliationCoverageSchema as sharedGenreReconciliationCoverageSchema,
} from "@groovenet/contracts";
import {
  albumArtMatchStatusSchema,
  albumArtSourceSchema,
  albumAppleMusicArtPreviewSchema,
  albumArtMatchResultSchema,
  albumArtworkBackfillBodySchema,
  albumArtworkBackfillResponseSchema,
  albumArtworkReviewItemSchema,
  albumArtworkReviewQuerySchema as sharedAlbumArtworkReviewQuerySchema,
  albumArtworkReviewResponseSchema,
  albumArtworkStateSchema,
  albumCreateResponseSchema,
  albumDeleteResponseSchema,
  albumDetailSchema,
  albumDiscogsRawResponseSchema,
  albumDownloadResultSchema,
  albumUpdateObjectSchema,
  albumUpdateResponseSchema,
  albumUpsertResponseSchema,
  requireAlbumUpdateField,
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
  librariesListResponseSchema,
  libraryWithStatsSchema,
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

export const discogsLookupQuerySchema = sharedDiscogsLookupQuerySchema.extend({
  friend_id: intFromInputSchema.optional(),
});
export const discogsLookupTrackSchema = sharedDiscogsLookupTrackSchema;
export const discogsLookupReleaseSchema = sharedDiscogsLookupReleaseSchema;
export const discogsLookupResponseSchema = sharedDiscogsLookupResponseSchema;
export const discogsDeleteReleasesBodySchema = discogsDeleteReleasesRequestSchema;
export const discogsDeleteReleasesResponseSchema = sharedDiscogsDeleteReleasesResponseSchema;

export const providerTrackMetadataBodySchema = providerTrackMetadataRequestSchema.extend({
  friend_id: intFromInputSchema.optional(),
});
export const providerTrackMetadataResponseSchema = sharedProviderTrackMetadataResponseSchema;
export const providerYouTubeMusicSearchBodySchema = providerYouTubeMusicSearchRequestSchema;
export const providerYouTubeMusicSearchItemSchema = youtubeVideoSchema;
export const providerYouTubeMusicSearchResponseSchema =
  sharedProviderYouTubeMusicSearchResponseSchema;
export const providerAppleMusicSearchBodySchema = providerAppleMusicSearchRequestSchema;
export const providerAppleMusicSearchItemSchema = appleMusicResultSchema;
export const providerAppleMusicSearchResponseSchema = sharedProviderAppleMusicSearchResponseSchema;

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

export {
  backupProviderSchema,
  backupRetentionPresetSchema,
  backupPolicySchema,
  backupPolicyUpdateSchema as backupPolicyPutBodySchema,
  backupPolicyGetResponseSchema,
  backupPolicyPutResponseSchema,
  backupSnapshotSummarySchema,
  backupStatusSchema,
  backupMetricsSchema,
  backupStatusGetResponseSchema,
  backupStatusRunResponseSchema,
  backupFileSchema,
  backupListResponseSchema,
  backupDeleteResponseSchema,
  backupCreateResponseSchema,
  restoreResponseSchema,
  backupHealthResponseSchema,
} from "@groovenet/contracts";
export { backupCreateResponseSchema as backupCreateCustomResponseSchema } from "@groovenet/contracts";

export const defaultLibrarySettingsGetResponseSchema = defaultLibrarySettingsSchema;

// The route coerces with Number() itself, as it always has, then validates this.
export const defaultLibrarySettingsPutBodySchema = defaultLibrarySettingsUpdateSchema;

export const defaultLibrarySettingsPutResponseSchema = defaultLibrarySettingsUpdateResponseSchema;

// Wire shapes are shared; the query adds the text coercion and defaults.
export {
  jobSchema as jobInfoSchema,
  jobDataSchema,
  jobDetailsSchema as jobDetailsResponseSchema,
  jobsSummarySchema,
  jobsPaginationSchema,
  jobsListResponseSchema,
  jobsClearResponseSchema,
  jobLogsResponseSchema,
  jobOutcomeResponseSchema,
  jobEventSchema as jobsEventsSseEnvelopeSchema,
} from "@groovenet/contracts";

export const jobsListQuerySchema = sharedJobsListQuerySchema.extend({
  limit: nonNegativeIntFromInputSchema.optional().default(100),
  offset: nonNegativeIntFromInputSchema.optional().default(0),
  state: jobStateFilterSchema.optional().default("all"),
});

export const jobsEventsSseResponseSchema = z.object({
  stream: z.string(),
  events: z.array(jobEventSchema),
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

export { libraryWithStatsSchema, librariesListResponseSchema };

export const discogsUsernameSchema = sharedDiscogsUsernameSchema;
export const discogsUserLookupResponseSchema = sharedDiscogsUserLookupResponseSchema;

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
  albumAppleMusicArtPreviewSchema,
  albumArtMatchResultSchema,
  albumArtMatchStatusSchema,
  albumArtSourceSchema,
  albumArtworkBackfillBodySchema,
  albumArtworkBackfillResponseSchema,
  albumArtworkReviewItemSchema,
  albumArtworkReviewResponseSchema,
  albumArtworkStateSchema,
  albumCreateResponseSchema,
  albumDeleteResponseSchema,
  albumDiscogsRawResponseSchema,
  albumUpdateResponseSchema,
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
export const queueAlbumDownloadsResponseSchema = albumDownloadResultSchema;
export const albumUpsertWithTracksResponseSchema = albumUpsertResponseSchema;
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

export const recommendationsQuerySchema = sharedRecommendationsQuerySchema.extend({
  friend_id: intFromInputSchema,
  mode: sharedRecommendationsQuerySchema.shape.mode.default("combined"),
  limit_identity: intFromInputSchema.optional().default(200),
  limit_audio: intFromInputSchema.optional().default(200),
  ivfflat_probes: intFromInputSchema.optional().default(10),
  ...recommendationScopeParams,
});

export const recommendationSeedTrackSchema = sharedRecommendationSeedTrackSchema.extend({
  friend_id: intFromInputSchema,
});

export const recommendationsBatchBodySchema = sharedRecommendationsBatchBodySchema.extend({
  tracks: z.array(recommendationSeedTrackSchema).min(1).max(100),
  limit_identity: intFromInputSchema.optional().default(200),
  limit_audio: intFromInputSchema.optional().default(200),
  ivfflat_probes: intFromInputSchema.optional().default(10),
  ...recommendationScopeParams,
});

export {
  seedEmbeddingsSchema,
  recommendationCandidateSchema,
  recommendationsResponseSchema,
} from "@groovenet/contracts";

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

export const manifestVerificationResultSchema = sharedManifestVerificationResultSchema;
export const manifestVerificationResponseSchema = sharedManifestVerificationResponseSchema;
export const manifestCleanupResultSchema = sharedManifestCleanupResultSchema;
export const manifestCleanupResponseSchema = sharedManifestCleanupResponseSchema;

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

export const albumArtworkReviewQuerySchema = sharedAlbumArtworkReviewQuerySchema.extend({
  friend_id: intFromInputSchema.optional(),
  limit: z.preprocess(toInt, z.number().int().min(1).max(200)).optional().default(50),
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
    ...trackAudioFileFieldsSchema.shape,
    local_audio_url: z.string().nullish(),
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

/** The shared wire body, with the scalar fields swapped for the ones carrying the route's 400 messages. */
export const albumUpdateBodySchema = albumUpdateObjectSchema
  .extend(albumUpdateFieldsSchema.shape)
  .refine(...requireAlbumUpdateField);

// ─── Fingerprints (#277) ──────────────────────────────────────────────────────
// Wire shapes live in @groovenet/contracts; the bodies keep `friend_id`
// coercion so a numeric string is still accepted.

export const fingerprintUpsertBodySchema = fingerprintUpsertBodyObjectSchema.extend({
  friend_id: intFromInputSchema,
});
export const fingerprintFileStatsBodySchema = fingerprintFileStatsBodyObjectSchema.extend({
  friend_id: intFromInputSchema,
});
export {
  fingerprintIndexRunSchema,
  fingerprintUpsertResponseSchema,
  fingerprintFileStatsResponseSchema,
};
export const fingerprintIndexBodySchema = fingerprintIndexBodyObjectSchema
  .extend({ friend_id: intFromInputSchema.optional() })
  .superRefine(refineFingerprintIndexBody);

// ─── Embeddings (#388, #451, #386) ────────────────────────────────────────────

export {
  embeddingsBackfillRunSchema,
  embeddingsBackfillDryRunSchema,
  embeddingsBackfillResponseSchema,
  embeddingsStatusSchema,
  embeddingQueueLaneDepthsSchema,
  embeddingQueueKindCountsSchema,
  embeddingQueueActiveRunSchema,
  embeddingQueueFailedJobSchema,
  embeddingQueueStatusSchema,
  embeddingQueueRetryBodySchema,
  embeddingQueueRetryResponseSchema,
  embeddingModelSettingsSchema,
  embeddingModelSettingsListSchema,
} from "@groovenet/contracts";
export { embeddingKindSchema as embeddingModelKindSchema } from "@groovenet/contracts";

/** The route accepts text for the numeric fields; the shared schema is the wire shape. */
export const embeddingsBackfillBodySchema = embeddingsBackfillObjectSchema
  .extend({
    friend_id: intFromInputSchema.optional(),
    limit: intFromInputSchema.optional(),
  })
  .superRefine(refineEmbeddingsBackfillBody);

export const embeddingsStatusQuerySchema = sharedEmbeddingsStatusQuerySchema.extend({
  friend_id: intFromInputSchema.optional(),
});

/**
 * One field at a time, by design: `target` is "what new jobs embed with
 * from now on" and `serving` is "what similarity queries read right now" —
 * flipping both together is how a model switch would skip the coexistence
 * step it's built for. Text coercion for `dims` and `template_version`
 * stays here.
 */
export const embeddingModelUpdateBodySchema = embeddingModelUpdateObjectSchema
  .extend({
    dims: intFromInputSchema.pipe(z.number().positive()),
    template_version: intFromInputSchema.pipe(z.number().int().positive()).optional(),
  })
  .refine(...requireServingForTemplateVersion);

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

export {
  artistCollaboratorSchema,
  artistPageResponseSchema,
  artistJsonSchemas,
} from "@groovenet/contracts";
export type { ArtistCollaborator, ArtistPageResponse } from "@groovenet/contracts";
export const artistPageQuerySchema = sharedArtistPageQuerySchema.extend({
  friend_id: intFromInputSchema.optional(),
});
export { artistCreditRefSchema, artistListResponseSchema } from "@groovenet/contracts";
export type { ArtistCreditRef, ArtistListItem, ArtistListResponse } from "@groovenet/contracts";
export const artistListQuerySchema = sharedArtistListQuerySchema.extend({
  q: z.string().trim().max(200).optional().default(""),
  friend_id: intFromInputSchema.optional(),
  include_placeholders: booleanFlagSchema.optional().default(false),
  limit: intFromInputSchema.pipe(z.number().int().min(1).max(200)).optional().default(50),
  offset: nonNegativeIntFromInputSchema.optional().default(0),
});

export { trackGenreFacetsResponseSchema };
export type TrackGenreFacetsResponse = z.infer<typeof trackGenreFacetsResponseSchema>;

// ─── Vinyl ingest, detections and set derivation (#281, #282, #299) ──────────
// Wire shapes live in @groovenet/contracts. The bodies fingerprint-service and
// fingerprint-set-worker post keep `friend_id` coercion (`intFromInputSchema`)
// so a numeric string is still accepted, as before the migration.

export {
  acceptedIngestSchema,
  detectionWindowSchema,
  detectionsRecentResponseSchema,
  fingerprintListItemSchema,
  fingerprintListResponseSchema,
  ingestErrorSchema,
  ingestPipelineStatsSchema,
  ingestRecentResponseSchema,
  ingestRecordSchema,
  ingestRetentionPolicySchema,
  ingestRetentionStatusSchema,
};

export const ingestMatchCandidateSchema = sharedIngestMatchCandidateSchema.extend({
  friend_id: intFromInputSchema,
});
export const ingestResultBodySchema = ingestResultBodyObjectSchema.extend({
  candidates: z.array(ingestMatchCandidateSchema).default([]),
});

export const setDerivationCreateBodySchema = setDerivationCreateBodyObjectSchema.extend({
  live_set_id: intFromInputSchema.nullable().optional(),
});
export const setWindowSchema = sharedSetWindowSchema.extend({
  candidates: z.array(ingestMatchCandidateSchema).default([]),
});
export const setDerivationResultBodySchema = setDerivationResultBodyObjectSchema.extend({
  windows: z.array(setWindowSchema).default([]),
});
export const setDerivationViewQuerySchema = sharedSetDerivationViewQuerySchema.extend({
  playlist_id: intFromInputSchema.optional(),
  live_set_id: intFromInputSchema.optional(),
});

// ─── Genre reconciliation (#372) ─────────────────────────────────────────────

export const genreProposalActionSchema = sharedGenreProposalActionSchema;
export const genreProposalMethodSchema = sharedGenreProposalMethodSchema;
export const genreProposalStatusSchema = sharedGenreProposalStatusSchema;
export const genreReconciliationRunBodySchema = genreReconciliationRunRequestSchema;
const reconciliationTimestampSchema = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString() : value),
  z.string(),
);
export const genreReconciliationRunSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object") return value;
  const run = value as Record<string, unknown>;
  return {
    ...run,
    started_at: reconciliationTimestampSchema.parse(run.started_at),
    updated_at: reconciliationTimestampSchema.parse(run.updated_at),
    finished_at:
      run.finished_at == null ? null : reconciliationTimestampSchema.parse(run.finished_at),
  };
}, sharedGenreReconciliationRunSchema);
export const genreProposalSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object") return value;
  const proposal = value as Record<string, unknown>;
  return {
    ...proposal,
    applied_at:
      proposal.applied_at == null ? null : reconciliationTimestampSchema.parse(proposal.applied_at),
    created_at: reconciliationTimestampSchema.parse(proposal.created_at),
    updated_at: reconciliationTimestampSchema.parse(proposal.updated_at),
  };
}, sharedGenreProposalSchema);
export const genreProposalListQuerySchema = sharedGenreProposalQuerySchema.extend({
  min_tracks: intFromInputSchema.pipe(z.number().int().min(0)).optional(),
  limit: intFromInputSchema.pipe(z.number().int().min(1).max(500)).optional(),
  offset: intFromInputSchema.pipe(z.number().int().min(0)).optional(),
});
export const genreProposalListResponseSchema = sharedGenreProposalListResponseSchema.extend({
  proposals: z.array(genreProposalSchema),
});
export const genreProposalUpdateBodySchema = sharedGenreProposalUpdateSchema;
export const genreProposalDecisionsBodySchema = genreProposalDecisionRequestSchema;
export const genreProposalSnapshotSchema = sharedGenreProposalSnapshotSchema;
export const genreProposalDecisionsResponseSchema =
  sharedGenreProposalDecisionResponseSchema.extend({ proposals: z.array(genreProposalSchema) });
export const genreProposalRestoreBodySchema = genreProposalRestoreRequestSchema;
export const genreProposalRestoreResponseSchema = sharedGenreProposalRestoreResponseSchema;
export const genreProposalTracksQuerySchema = z.object({
  friend_id: intFromInputSchema.pipe(z.number().int().min(1)).optional(),
  limit: intFromInputSchema.pipe(z.number().int().min(1).max(20)).optional(),
});
export const genreProposalTracksResponseSchema = sharedGenreProposalTracksResponseSchema;
export const genreProposalApplyBodySchema = genreProposalApplyRequestSchema;
export const genreProposalApplyResponseSchema = sharedGenreProposalApplyResponseSchema;
export const genreReconciliationCoverageQuerySchema = z.object({
  friend_id: intFromInputSchema.pipe(z.number().int().min(1)).optional(),
});
export const genreReconciliationCoverageSchema = sharedGenreReconciliationCoverageSchema;

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

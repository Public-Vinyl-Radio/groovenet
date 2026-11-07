// Core domain types for the Groovenet DJ collection system.
// Track, album and friend entities are re-exported from @groovenet/contracts.

import type { AlbumEntity, TrackEntity, TrackSearchMode } from "@groovenet/contracts";

export type { AlbumEntity as Album, TrackEntity as Track, TrackSearchMode };

// Track job and lifecycle payloads (#606).
export type {
  TrackAnalyzeAsyncRequest,
  TrackAnalyzeAsyncResponse,
  TrackDeleteResponse,
  TrackEmbeddingPreview,
  TrackFixDurationRequest,
  TrackFixDurationResponse,
  TrackGenreFacetsResponse,
  TrackRestoreResponse,
} from "@groovenet/contracts";

export type {
  Job,
  JobData,
  JobDetails,
  JobEvent,
  JobLogsResponse,
  JobOutcomeResponse,
  JobState,
  JobStateFilter,
  JobsClearResponse,
  JobsListQuery,
  JobsListResponse,
  JobsPagination,
  JobsSummary,
} from "@groovenet/contracts";

export type {
  BackupPolicy,
  BackupPolicyUpdate,
  BackupPolicyGetResponse,
  BackupPolicyPutResponse,
  BackupProvider,
  BackupRetentionPreset,
  BackupSnapshotSummary,
  BackupMetrics,
  BackupStatus,
  BackupStatusGetResponse,
  BackupStatusRunResponse,
  BackupFile,
  BackupListResponse,
  BackupDeleteResponse,
  BackupCreateResponse,
  RestoreResponse,
  BackupHealthResponse,
} from "@groovenet/contracts";

export type {
  AlbumDeleteResponse,
  AlbumDownloadResult,
  AlbumDetail,
  AlbumPlayableStructure,
  AlbumPlayableStructureSide,
  AlbumPlayableStructureTrack,
  AlbumSearchResponse,
  AlbumUpdate,
  AlbumUpdateResponse,
  TrackGenre,
  LiveSet,
  LiveSetDeleteResponse,
  LiveSetMediaType,
  LiveSetMutationResponse,
  LiveSetStatus,
  LiveSetSummary,
  LiveSetUpdate,
  Playlist,
  PlaylistDetail,
  PlaylistGeneticRequest,
  PlaylistGeneticResponse,
  PlaylistOptimizerMode,
  PlaylistSpinsInput,
  PlaylistSpinsResult,
  PlaylistTrackRef,
  Friend,
  FriendListResponse,
  SpinAggregateRequest,
  SpinAggregateResult,
  SpinAggregateSourceResult,
  SpinAlbumSummary,
  SpinCreateInput,
  SpinCreateResponse,
  SpinDeleteResponse,
  SpinDerived,
  SpinListQuery,
  SpinListResponse,
  SpinProvenance,
  SpinSelection,
  SpinSelectionMode,
  SpinSelectionType,
  SpinSession,
  SpinSessionDetail,
  SpinTopTrack,
  SpinRecapQuery,
  SpinRecapResponse,
  SpinTopTracksQuery,
  SpinTopTracksResponse,
  SpinTrackRef,
  SpinUpdateInput,
  SpinUpdateResponse,
  TrackSpinEvent,
} from "@groovenet/contracts";

export type {
  GenreSource,
  Genre,
  GenreTreeNode,
  GenreTreeResponse,
  GenrePageQuery,
  GenreSimilarQuery,
  GenreCreateInput,
  GenreUpdateInput,
  GenreAliasInput,
  GenreMergeInput,
  GenreAliasResponse,
  GenreMergeResponse,
  GenrePageRef,
  GenreSimilaritySignals,
  GenreRelatedRef,
  GenrePageResponse,
  GenreSimilarResponse,
} from "@groovenet/contracts";

// ── Genre reconciliation (#372) ─────────────────────────────────────────────
export type {
  GenreProposalAction,
  GenreProposalMethod,
  GenreProposalStatus,
  GenreReconciliationRequest,
  GenreReconciliationRun,
  GenreProposal,
  GenreProposalQuery,
  GenreProposalListResponse,
  GenreProposalUpdate,
  GenreProposalDecision,
  GenreProposalSnapshot,
  GenreProposalDecisionResult,
  GenreProposalTrack,
  GenreProposalApplyResult,
  GenreReconciliationCoverage,
} from "@groovenet/contracts";

export type {
  AppleMusicResult,
  DiscogsLookupResponse,
  DiscogsUserLookupResponse,
  ProviderAppleMusicSearchResponse,
  ProviderTrackMetadataResponse,
  ProviderYouTubeMusicSearchResponse,
  YoutubeVideo,
} from "@groovenet/contracts";

export interface TrackSearchQuery {
  query?: string;
  limit?: number;
  offset?: number;
  /**
   * `lexical` (default) matches words; `semantic` ranks by meaning (e.g.
   * "dusty 70s cumbia with brass"); `hybrid` fuses both. Non-lexical modes
   * return one page: offset 0, limit at most 50.
   */
  mode?: TrackSearchMode;
  filters?: {
    /** Inclusive BPM bounds. */
    bpm_min?: number;
    bpm_max?: number;
    /** Exact musical key, case-insensitive, e.g. "A minor". */
    key?: string;
    /** Minimum star rating, 0–5. */
    star_rating?: number;
    friend_id?: number;
    /**
     * Genre slugs, ids or names, ORed; each includes its subgenres. A track
     * matches on its own genres, or its album's Discogs genres and styles
     * when it has none. An unknown genre is an error.
     */
    genre?: string[];
  };
}

export interface TrackSearchResponse {
  tracks: TrackEntity[];
  estimatedTotalHits: number;
  offset: number;
  limit: number;
  processingTimeMs: number;
  /** The mode that ranked these tracks; absent for a plain lexical search. */
  mode?: TrackSearchMode;
  /** Hybrid fell back to lexical results because the semantic leg failed. */
  degraded?: boolean;
}

export interface TrackUpdate {
  star_rating?: number;
  notes?: string;
  local_tags?: string;
  /** Replaces the track's genres: genre ids, or names resolved via aliases. Unknown names fail with 400. */
  genres?: string[];
  /** Replaces the track's descriptors (free text, normalised server-side). */
  descriptors?: string[];
  apple_music_url?: string;
  spotify_url?: string;
  youtube_url?: string;
  soundcloud_url?: string;
}

export interface AlbumSearchQuery {
  q?: string;
  limit?: number;
  offset?: number;
  friend_id?: number;
  sort?: string;
  /**
   * Genre slugs, ids or names, ORed; each includes its subgenres. An album
   * matches on its Discogs genres and styles, or on any of its tracks' genres.
   */
  genre?: string[];
}

export interface SimilarTrack extends Record<string, unknown> {
  track_id: string;
  friend_id: number;
  title: string;
  artist: string;
  album: string;
  distance: number;
  identity_text?: string;
  bpm?: string | number | null;
  key?: string | null;
  danceability?: string | number | null;
  mood_happy?: number | null;
  mood_sad?: number | null;
  mood_relaxed?: number | null;
  mood_aggressive?: number | null;
}

export interface SimilarIdentityResponse {
  source_track_id: string;
  source_friend_id: number;
  filters: { era?: string; country?: string; tags?: string[] };
  count: number;
  tracks: SimilarTrack[];
}

export interface SimilarVibeResponse {
  source_track_id: string;
  source_friend_id: number;
  count: number;
  tracks: SimilarTrack[];
}

export interface SimilarityQuery {
  limit?: number;
  ivfflat_probes?: number;
}

export interface IdentitySimilarityQuery extends SimilarityQuery {
  era?: string;
  country?: string;
  tags?: string;
}

export type {
  RecommendationCandidate,
  RecommendationsResponse as RecommendationCandidatesResponse,
  RecommendationsBatchBody as RecommendationCandidatesBatchBody,
} from "@groovenet/contracts";

export interface RecommendationCandidatesQuery {
  limit_identity?: number;
  limit_audio?: number;
  ivfflat_probes?: number;
}

// ─── Audio file metadata backfill (#1049) ─────────────────────────────────────

export type { AudioMetadataBackfillRequest, AudioMetadataBackfillRun } from "@groovenet/contracts";

// ─── Fingerprint indexing (#277) ──────────────────────────────────────────────

// Defined in @groovenet/contracts, with the request's scope rules and the run counters.
export type {
  FingerprintIndexRequest,
  FingerprintIndexRun,
  FingerprintIndexScope,
} from "@groovenet/contracts";

// ─── Embeddings backfill (#388) ───────────────────────────────────────────────

export type {
  EmbeddingKind as EmbeddingJobKind,
  EmbeddingBackfillScope,
  EmbeddingsBackfillRequest as EmbeddingBackfillRequest,
  EmbeddingsBackfillRun as EmbeddingBackfillRun,
  EmbeddingsBackfillDryRun as EmbeddingBackfillDryRun,
  EmbeddingsStatus as EmbeddingStatus,
  EmbeddingModelCoverage,
  EmbeddingModelSettings,
  EmbeddingModelUpdate,
  EmbeddingQueueStatus,
  EmbeddingQueueFailedJob,
  EmbeddingQueueRetryResponse,
} from "@groovenet/contracts";

// ─── Vinyl pipeline debug (#299) and set derivation (#282) ───────────────────

// Defined in @groovenet/contracts, shared with the app's routes and OpenAPI document.
export type {
  DerivedPlay,
  DetectionListResponse,
  DetectionQuery,
  DetectionWindow,
  IngestCounters,
  IngestListResponse,
  IngestPipelineStats,
  IngestRecord,
  PlannedEntry,
  SetDerivation,
  SetDerivationRequest,
  SetDerivationStatus,
  SetDerivationView,
  SetDerivationViewQuery,
  SetDiff,
  SetRecording,
  SetTrackRef,
  UnidentifiedRegion,
} from "@groovenet/contracts";

// ── Record copies and care (#262) ────────────────────────────────────────────

// Physical-copy care (#262), defined in @groovenet/contracts. The client keeps
// its historical names for the request and result types.
export type {
  CleaningMethod,
  RecordAction,
  RecordActionListQuery,
  RecordActionListResponse,
  RecordActionType,
  RecordCareItem,
  RecordCareQuery,
  RecordCareResponse,
  RecordCareStatus,
  RecordCareSummary,
  RecordCareSummaryQuery,
  RecordActionVoidResponse,
  RecordCopy,
  RecordCopyDeleteResponse,
  RecordCopyListItem,
  RecordCopyListResponse,
  RecordCopyResponse,
  SleeveType,
  RecordActionCreate as RecordActionInput,
  RecordActionMutationResponse as RecordActionResult,
  RecordCopyCreate as RecordCopyCreateInput,
  RecordCopyDefaultUpdate as RecordCopyDefaultUpdateInput,
  RecordCopyUpdate as RecordCopyUpdateInput,
} from "@groovenet/contracts";

// Care stacks and batch logs (#941).
export type {
  RecordCareCopyRef,
  RecordCareLogEntry,
  RecordCareLogQuery,
  RecordCareLogResponse,
  RecordCareSession,
  RecordCareSessionCreate,
  RecordCareSessionMutationResponse,
  RecordCareSessionStatus,
  RecordCareSessionVoidResponse,
  RecordCareSource,
  RecordCareStackDiscardResponse,
  RecordCareStackItem,
  RecordCareStackListQuery,
  RecordCareStackListResponse,
  RecordCareStackPull,
  RecordCareStackPullResponse,
  RecordCareStackResponse,
} from "@groovenet/contracts";

export type {
  AiPromptSettings,
  AiPromptSettingsUpdate,
  AiPromptSettingsUpdateResponse,
  AppearanceCorners,
  AppearanceCustomColours,
  AppearanceCustomPalette,
  AppearanceFontRole,
  AppearanceFonts,
  AppearancePaletteId,
  AppearanceSettings,
  AppearanceSettingsUpdate,
  GamdlAction,
  GamdlActionRequest,
  GamdlActionResponse,
  GamdlConnectionTestDetails,
  GamdlConnectionTestResponse,
  GamdlCookieDeleteResponse,
  GamdlCookieFileInfo,
  GamdlCookieUploadResponse,
  GamdlSettings,
  GamdlSettingsChanges,
  GamdlSettingsResponse,
  GamdlSettingsUpdate,
  GamdlSettingsUpdateResponse,
  RecommendationScope,
  RecommendationSettings,
  RecommendationSettingsUpdate,
} from "@groovenet/contracts";

export type {
  CreateServerPlayer,
  ServerPlayer,
  ServerPlayerState,
  ServerPlayerCommand,
  ServerPlayerCommandInput,
  ServerPlayerCommandResult,
  ServerPlayerDevice,
  SpeakerObservation,
} from "@groovenet/contracts";

export type { HomeQuery, HomeResponse } from "@groovenet/contracts";

export type {
  RecordCareQueueQuery,
  RecordCareQueueResponse,
  RecordCareProgressQuery,
  RecordCareProgressResponse,
  RecordCareQueueItem,
} from "@groovenet/contracts";

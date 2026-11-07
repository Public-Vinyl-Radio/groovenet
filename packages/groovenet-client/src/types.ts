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

// ─── Fingerprint indexing (#277) ──────────────────────────────────────────────

/**
 * Which slice of the reference library an indexing run covers.
 *
 * `missing` and `changed` are the two halves of "bring the index up to date".
 * `all` adds the tracks that are already current, for forcing a regeneration.
 */
export type FingerprintIndexScope = "missing" | "changed" | "all" | "track" | "release";

export interface FingerprintIndexRequest {
  scope: FingerprintIndexScope;
  track_id?: string;
  release_id?: string;
  friend_id?: number;
  force?: boolean;
}

/**
 * Counters for one indexing run.
 *
 * The four the CLI reports are `indexed` / `skipped` / `failed` / `unindexable`.
 * The last is not a failure: `tracks.local_audio_url` is nullable, so only part
 * of a library can be fingerprinted at all, and those tracks are counted at
 * resolve time and never queued.
 */
export interface FingerprintIndexRun {
  run_id: string;
  scope: string;
  fingerprint_type: string;
  fingerprint_version: string;
  queued: number;
  unindexable: number;
  indexed: number;
  skipped: number;
  failed: number;
  errors: string[];
  started_at: number;
  updated_at: number;
  complete: boolean;
}

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

// ─── Vinyl pipeline debug (#299) ──────────────────────────────────────────────

export interface DetectionWindow {
  id: string;
  ingest_id: string;
  source_id: string;
  session_id: string | null;
  window_start_at: string | null;
  /** False means the window was recorded and matched nothing — a real state. */
  matched: boolean;
  track_id: string | null;
  friend_id: number | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  confidence: number | null;
  offset_seconds: number | null;
  /** RMS level of the window, dBFS; null on older rows. */
  level_dbfs?: number | null;
  fingerprint_type: string | null;
  fingerprint_version: string | null;
  created_at: string;
}

export interface DetectionListResponse {
  detections: DetectionWindow[];
  count: number;
}

export interface IngestRecord {
  ingest_id: string;
  source_id: string;
  session_id: string | null;
  sequence: number | null;
  status: "received" | "processing" | "processed" | "failed";
  error: string | null;
  duration_seconds: number | null;
  sample_rate: number | null;
  channels: number | null;
  codec: string | null;
  file_path: string | null;
  captured_at: string | null;
  received_at: string;
  updated_at: string;
}

export interface IngestListResponse {
  ingests: IngestRecord[];
  count: number;
}

export interface IngestPipelineStats {
  since: string;
  window_minutes: number;
  source_id: string | null;
  /** False means uploads cannot be saved at all — everything else is moot. */
  ingest_writable: boolean;
  index: {
    engine_registered: boolean;
    fingerprint_type: string | null;
    fingerprint_version: string | null;
    indexed_tracks: number;
    /** True means nothing can ever match, however healthy the rest looks. */
    empty: boolean;
    /** Tracks with local audio but no fingerprint for the active engine (#303). */
    missing_fingerprint_tracks: number;
  };
  queue_depth: number | null;
  ingests: {
    by_status: Record<string, number>;
    failures: Array<{ error: string; count: number }>;
    oldest_in_flight: {
      ingest_id: string;
      status: string;
      received_at: string;
    } | null;
  };
  detections: {
    windows: number;
    matched: number;
    no_match: number;
    match_rate: number | null;
    confidence_bands: Array<{ band: string; count: number }>;
  };
  spins: {
    /** Confident detections not yet written to spin_sessions (#304). Null when it could not be computed. */
    pending: number | null;
  };
  /**
   * What leaves no row behind (#280), from Redis: across all sources, rounded
   * out to whole buckets. Null when Redis could not be reached; absent from an
   * app older than #280.
   */
  counters?: IngestCounters | null;
}

/** Counters for the ingest pipeline that Postgres cannot answer (#280). */
export interface IngestCounters {
  bucket_minutes: number;
  chunks: {
    received: number;
    accepted: number;
    duplicate: number;
    rejected: number;
    rejected_by_reason: Array<{ reason: string; count: number }>;
    failed_by_stage: Array<{ stage: string; count: number }>;
    enqueue_failed: number;
  };
  plays: {
    confirmed: number;
    latency_ms_avg: number | null;
    latency_bands: Array<{ band: string; count: number }>;
  };
}

export interface DetectionQuery {
  source_id?: string;
  session_id?: string;
  matched?: boolean;
  since?: string;
  limit?: number;
  offset?: number;
}

// ─── Set derivation (#282) ────────────────────────────────────────────────────
// Copied from my-collection-search/src/types/setDerivation.ts.

export interface SetRecording {
  sha256: string;
  file_path: string;
  original_filename: string | null;
  format_name: string | null;
  duration_seconds: number | null;
  size_bytes: string | number;
  created_at: string;
}

export type SetDerivationStatus = "queued" | "processing" | "processed" | "failed";

export interface SetDerivation {
  id: string;
  recording_sha256: string;
  fingerprint_type: string;
  fingerprint_version: string;
  window_seconds: number;
  step_seconds: number;
  status: SetDerivationStatus;
  error: string | null;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface SetDerivationRequest {
  recording_sha256: string;
  window_seconds?: number;
  step_seconds?: number;
  /** Start a new run even if an equivalent one exists. */
  force?: boolean;
  /** Also list the recording in this live set's media. */
  live_set_id?: number;
}

export interface SetTrackRef {
  track_id: string;
  friend_id: number;
  title: string | null;
  artist: string | null;
  release_id: string | null;
  position: string | null;
}

export interface DerivedPlay {
  track_id: string;
  friend_id: number;
  start_seconds: number;
  end_seconds: number;
  confidence: number;
  windows: number;
  /** Track seconds per recording second; ~1.0 is a record at pitch. */
  rate: number | null;
  track: SetTrackRef | null;
}

export interface UnidentifiedRegion {
  start_seconds: number;
  end_seconds: number;
  unindexed_neighbours: SetTrackRef[];
}

export interface PlannedEntry extends SetTrackRef {
  /** 0-based position in the playlist. */
  index: number;
  fingerprinted: boolean;
}

/** `play` indexes into the view's `tracklist`. */
export interface SetDiff {
  playlist_id: number;
  played_as_planned: Array<{ play: number; planned: PlannedEntry; out_of_order: boolean }>;
  played_instead_of: Array<{ play: number; planned: PlannedEntry }>;
  played_not_planned: Array<{ play: number }>;
  planned_not_played: PlannedEntry[];
}

export interface SetDerivationView {
  derivation: SetDerivation;
  recording: SetRecording;
  summary: {
    plays: number;
    duration_seconds: number | null;
    identified_seconds: number;
    identified_fraction: number | null;
  } | null;
  tracklist: DerivedPlay[];
  unidentified: UnidentifiedRegion[];
  diff: SetDiff | null;
}

export interface SetDerivationViewQuery {
  playlist_id?: number;
  live_set_id?: number;
}

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

// Storage orphan scan (#1052).
export type {
  MissingFileTrack,
  OrphanFile,
  OrphanScanStartResponse,
  OrphanScanSummary,
  OrphansQuery,
  OrphansResponse,
} from "@groovenet/contracts";

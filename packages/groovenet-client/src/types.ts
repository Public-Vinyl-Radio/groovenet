// Core domain types for the Groovenet DJ collection system.
// Track, album and friend entities are re-exported from @groovenet/contracts.

import type { AlbumEntity, TrackEntity, TrackSearchMode } from "@groovenet/contracts";

export type { AlbumEntity as Album, TrackEntity as Track, TrackSearchMode };

export type {
  AlbumDeleteResponse,
  AlbumDetail,
  AlbumPlayableStructure,
  AlbumPlayableStructureSide,
  AlbumPlayableStructureTrack,
  AlbumSearchResponse,
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
  SpinTopTracksQuery,
  SpinTopTracksResponse,
  SpinTrackRef,
  SpinUpdateInput,
  SpinUpdateResponse,
  TrackSpinEvent,
} from "@groovenet/contracts";

export type GenreSource = "discogs" | "custom";

export interface Genre {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  source: GenreSource;
}
export interface GenreCreateInput { name: string; parent_id: string }
export interface GenreUpdateInput { name?: string; parent_id?: string | null }
export interface GenreAliasResponse { success: true }
export interface GenreMergeResponse { success: true; merged_genre_id: string; survivor_genre_id: string }

export interface GenreTreeNode {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  source: GenreSource;
  track_count: number;
  album_count: number;
  /** Normalised alias keys that resolve to this genre. */
  aliases?: string[];
  children: GenreTreeNode[];
}

export interface GenreTreeResponse {
  genres: GenreTreeNode[];
}

/** Copied from the app's genre API contract schemas. Counts include subgenres. */
export interface GenrePageRef {
  id: string;
  name: string;
  slug: string;
  track_count: number;
}

export interface GenreSimilaritySignals {
  taxonomy?: "sibling" | "parent" | "child";
  npmi?: number;
  shared_albums?: number;
}

/** Scores and signals are absent for the taxonomy-sibling fallback. */
export interface GenreRelatedRef extends GenrePageRef {
  score?: number;
  signals?: GenreSimilaritySignals;
}

export interface GenreSimilarResponse {
  genre: GenrePageRef;
  related: GenreRelatedRef[];
}

export interface GenreSimilarQuery {
  /** Maximum related genres to return; defaults to 20 on the server. */
  limit?: number;
}

// ── Genre reconciliation (#372) ─────────────────────────────────────────────

export type GenreProposalAction = "map" | "new_genre" | "descriptor" | "drop";
export type GenreProposalMethod = "exact" | "ai" | "manual";
export type GenreProposalStatus = "pending" | "accepted" | "rejected" | "edited";

export interface GenreReconciliationRequest {
  /** false proposes exact matches only. Default true. */
  ai?: boolean;
  /** Fewest tracks a value needs before the model may propose a new genre. Default 10. */
  new_genre_min_tracks?: number;
  /** Most values sent to the model this run. */
  limit?: number | null;
  /** Re-ask the model for values with a pending AI proposal. */
  refresh?: boolean;
  /** Only this friend's tracks; omit or null for every friend. */
  friend_id?: number | null;
}

export interface GenreReconciliationRun {
  id: string;
  status: "running" | "completed" | "failed";
  options: { ai: boolean; new_genre_min_tracks: number; limit: number | null; refresh: boolean; friend_id: number | null };
  model: string | null;
  distinct_values: number;
  exact_matches: number;
  kept: number;
  ai_pending: number;
  ai_proposed: number;
  ai_failed: number;
  ai_batches: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  error: string | null;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface GenreProposal {
  id: string;
  value_normalized: string;
  raw_examples: string[];
  track_count: number;
  action: GenreProposalAction;
  target_genre_ids: string[];
  target_genres: Array<{ id: string; name: string; parent_name: string | null }>;
  proposed_genre_name: string | null;
  proposed_parent_id: string | null;
  proposed_parent_name: string | null;
  confidence: number | null;
  method: GenreProposalMethod;
  status: GenreProposalStatus;
  run_id: string | null;
  created_genre_id: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GenreProposalQuery {
  status?: GenreProposalStatus;
  action?: GenreProposalAction;
  method?: GenreProposalMethod;
  /** Only values on at least this many tracks, as counted by the latest run. */
  min_tracks?: number;
  limit?: number;
  offset?: number;
}

export interface GenreProposalListResponse {
  proposals: GenreProposal[];
  total: number;
}

export interface GenreProposalUpdate {
  status?: GenreProposalStatus;
  action?: GenreProposalAction;
  /** Genre ids, or names resolved through the taxonomy. */
  target_genres?: string[];
  proposed_genre_name?: string | null;
  proposed_parent_id?: string | null;
}

export interface GenreProposalDecision extends GenreProposalUpdate {
  id: string;
}

/** A proposal's reviewable state, as undo restores it. */
export type GenreProposalSnapshot = Pick<
  GenreProposal,
  "id" | "status" | "action" | "target_genre_ids" | "proposed_genre_name" | "proposed_parent_id" | "method"
>;

export interface GenreProposalDecisionResult {
  /** Each proposal after the decision, in request order. */
  proposals: GenreProposal[];
  /** Each proposal before it; pass to restoreGenreProposals to undo. */
  previous: GenreProposalSnapshot[];
}

export interface GenreProposalTrack {
  track_id: string;
  friend_id: number;
  title: string;
  artist: string;
  album: string | null;
  styles: string[];
}

export interface GenreProposalApplyResult {
  proposals_applied: number;
  tracks_linked: number;
  descriptors_added: number;
  aliases_added: number;
  genres_created: number;
  skipped: Array<{ id: string; value: string; reason: string }>;
}

export interface GenreReconciliationCoverage {
  tracks: {
    with_local_tags: number;
    with_genres: number;
    descriptors_only: number;
    no_genre: number;
    unresolved: number;
  };
  values: {
    distinct: number;
    proposed: number;
    exact: number;
    exact_share: number;
    by_status: Record<GenreProposalStatus, number>;
    by_action: Record<GenreProposalAction, number>;
  };
}

export interface YoutubeVideo {
  id: string;
  title: string;
  channel: string;
  thumbnail?: string;
  url: string;
}

export interface AppleMusicResult {
  id: string;
  title: string;
  artist: string;
  album: string;
  artwork?: string;
  url: string;
  duration?: number;
}

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

export interface AlbumUpdate {
  genre_override_ids?: string[] | null;
  style_override_ids?: string[] | null;
  album_rating?: number;
  album_notes?: string;
  purchase_price?: number;
  condition?: string;
  library_identifier?: string | null;
}

export interface AlbumDownloadResult {
  success: boolean;
  message: string;
  jobIds: string[];
  tracksQueued: number;
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

export interface RecommendationCandidate {
  trackId: string;
  friendId: number;
  simIdentity: number | null;
  simAudio: number | null;
  metadata: {
    title: string;
    artist: string;
    album: string;
    year?: string | null;
    bpm?: number | null;
    key?: string | null;
    danceability?: number | null;
    energy?: number | null;
    tags: string[];
    genreRefs: Array<{ id: string; parentId: string | null }>;
    styles: string[];
    genres: string[];
    starRating?: number | null;
    moodHappy?: number | null;
    moodSad?: number | null;
    moodRelaxed?: number | null;
    moodAggressive?: number | null;
  };
}

export interface RecommendationCandidatesResponse {
  seedTrackId: string;
  seedFriendId: number;
  seedEmbeddings: { identity: boolean; audio: boolean };
  candidates: RecommendationCandidate[];
  stats: {
    identityCount: number;
    audioCount: number;
    unionCount: number;
    timingMs: { identityQuery: number; audioQuery: number; total: number };
  };
}

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
export type FingerprintIndexScope =
  | "missing"
  | "changed"
  | "all"
  | "track"
  | "release";

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

/** `context` is the natural-language retrieval embedding (#408). */
export type EmbeddingJobKind = "identity" | "audio_vibe" | "context";
export type EmbeddingBackfillScope = "missing" | "all" | "release" | "track";

export interface EmbeddingBackfillRequest {
  scope?: EmbeddingBackfillScope;
  types?: EmbeddingJobKind[];
  friend_id?: number;
  release_id?: string;
  track_ids?: string[];
  limit?: number;
  force?: boolean;
  dry_run?: boolean;
}

/** Counters for one backfill run, same shape as `FingerprintIndexRun` minus the fingerprint fields. */
export interface EmbeddingBackfillRun {
  run_id: string;
  queued: number;
  success: number;
  skipped: number;
  failed: number;
  errors: string[];
  started_at: number;
  updated_at: number;
  complete: boolean;
}

export interface EmbeddingBackfillDryRun {
  dry_run: true;
  total: number;
  by_type: Record<EmbeddingJobKind, number>;
}

export interface EmbeddingStatus {
  total_tracks: number;
  missing: Record<EmbeddingJobKind, number>;
}

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

/** The font roles the app lets you choose a face for. */
export type AppearanceFontRole = "display" | "body" | "label";

/** A face id per role: `default` (the app's own), `system`, or a registered face such as `inter`. */
export type AppearanceFonts = Record<AppearanceFontRole, string>;

/** The app-wide palette and fonts. Light/dark mode is per device and not part of it. */
export interface AppearanceSettings {
  /** A palette id from the app's registry, e.g. `sleeve`. */
  palette: string;
  /** Absent from servers that predate font choices. */
  fonts?: AppearanceFonts;
}

/** A change to the appearance; only the fields sent are changed. */
export interface AppearanceSettingsUpdate {
  palette?: string;
  fonts?: Partial<AppearanceFonts>;
}

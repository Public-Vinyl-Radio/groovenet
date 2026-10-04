// Core domain types for the Groovenet DJ collection system.
// Copied from my-collection-search/src/types/track.ts — Next.js app is the source of truth.

export type Track = {
  id: number;
  track_id: string;
  isrc?: string;
  title: string;
  artist: string;
  album: string;
  year: string | number;
  styles?: string[];
  genres?: string[];
  duration: string;
  duration_seconds?: number;
  position: string | number;
  discogs_url: string;
  apple_music_url: string;
  youtube_url?: string;
  spotify_url?: string;
  soundcloud_url?: string;
  album_thumbnail?: string;
  local_tags?: string | undefined;
  composer?: string | undefined | null;
  bpm?: string | undefined | null;
  key?: string | undefined | null;
  danceability?: string | null;
  mood_happy?: number | null;
  mood_sad?: number | null;
  mood_relaxed?: number | null;
  mood_aggressive?: number | null;
  notes?: string | undefined | null;
  local_audio_url?: string;
  audio_file_album_art_url?: string | null;
  star_rating?: number;
  username?: string;
  _semanticScore?: number;
  friend_id: number;
  release_id?: string;
  library_identifier?: string | null;
  _vectors?: { default?: number[] };
  hasVectors?: boolean;
};

export interface Playlist {
  id: number;
  name: string;
  tracks: { track_id: string; friend_id: number; position: number }[];
  created_at: string;
}

export type LiveSetStatus = "draft" | "performed" | "archived";
export type LiveSetMediaType = "image" | "flyer" | "audio" | "youtube" | "link";
export interface LiveSet {
  id: number; playlist_id: number; title: string | null; status: LiveSetStatus;
  notes: string | null; location_name: string | null; location_city: string | null; cover_image_url: string | null;
  collaborators: Array<{ friend_id: number; username: string; role: string }>;
  performances: Array<{ performed_at: string; venue_name: string | null; location_city: string | null; notes: string | null }>;
  media: Array<{ media_type: LiveSetMediaType; url: string; filename: string | null; caption: string | null }>;
}

export interface Friend {
  id: number;
  username: string;
}

export interface Album {
  release_id: string;
  friend_id: number;
  username?: string;
  title: string;
  artist: string;
  year?: string;
  genres?: string[];
  styles?: string[];
  album_thumbnail?: string;
  audio_file_album_art_url?: string;
  discogs_url?: string;
  date_added?: string;
  date_changed?: string;
  track_count: number;
  album_rating?: number;
  album_notes?: string;
  purchase_price?: number;
  condition?: string;
  label?: string;
  catalog_number?: string;
  country?: string;
  format?: string;
  created_at?: string;
  updated_at?: string;
  library_identifier?: string | null;
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

export type TrackSearchMode = "lexical" | "semantic" | "hybrid";

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
    bpm_min?: number;
    bpm_max?: number;
    key?: string;
    star_rating?: number;
    friend_id?: number;
  };
}

export interface TrackSearchResponse {
  tracks: Track[];
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
}

export interface AlbumSearchResponse {
  hits: Album[];
  estimatedTotalHits: number;
  offset: number;
  limit: number;
  query: string;
  sort: string;
}

export interface AlbumDetail {
  album: Album;
  tracks: Track[];
}

export interface AlbumPlayableStructureTrack {
  track_id: string;
  friend_id: number;
  position?: string | number | null;
  title: string;
  artist: string;
}

export interface AlbumPlayableStructureSide {
  side_key: string;
  side_label: string;
  ordinal: number;
  track_count: number;
  tracks: AlbumPlayableStructureTrack[];
}

export interface AlbumPlayableStructure {
  album: Album;
  sides: AlbumPlayableStructureSide[];
}

export interface AlbumUpdate {
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

export interface SpinTrackRef {
  track_id: string;
  friend_id: number;
}

export interface SpinSession {
  id: number;
  friend_id: number;
  release_id: string;
  medium: "vinyl";
  selection_mode: "sides" | "tracks" | "automatic" | "playlist";
  played_at: string;
  note?: string | null;
  context_type?: string | null;
  /** "automatic" when the listener detected the spin. */
  provenance?: "manual" | "automatic" | "playlist";
  source_id?: string | null;
  confidence?: number | null;
  playlist_id?: number | null;
  live_set_performance_id?: number | null;
  playlist_played_at?: string | null;
  playlist_position?: number | null;
  /** When a detected spin was corrected by hand; null otherwise. */
  corrected_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SpinSelection {
  id?: number;
  session_id?: number;
  ordinal: number;
  selection_type: "side" | "track";
  side_key?: string | null;
  track_id?: string | null;
  friend_id?: number | null;
  position_snapshot?: string | null;
  created_at?: string;
}

export interface TrackSpinEvent {
  id?: number;
  session_id?: number;
  friend_id: number;
  release_id: string;
  track_id: string;
  played_at: string;
  ordinal: number;
  side_key?: string | null;
  position_snapshot?: string | null;
  title_snapshot?: string;
  artist_snapshot?: string;
  album_snapshot?: string;
  created_at?: string;
}

export interface SpinDerived {
  is_full_album_spin: boolean;
  selected_side_count: number;
  album_side_count: number;
  track_count: number;
}

export interface PlaylistSpinsInput {
  performed_at?: string;
  performance_id?: number;
  derivation_id?: string;
}

export interface PlaylistSpinsResult {
  playlist_id: number;
  performance_id: number | null;
  performed_at: string;
  created: number;
  skipped: number;
}

export interface SpinCreateBodyBase {
  friend_id: number;
  release_id: string;
  played_at: string;
  note?: string | null;
  context_type?: string | null;
}

export type SpinCreateInput =
  | (SpinCreateBodyBase & {
      side_keys: string[];
      track_refs?: never;
    })
  | (SpinCreateBodyBase & {
      side_keys?: never;
      track_refs: SpinTrackRef[];
    });

export interface SpinAlbumSummary {
  title: string | null;
  artist: string | null;
  thumbnail: string | null;
}

export interface SpinSessionDetail {
  session: SpinSession;
  selections: SpinSelection[];
  track_events: TrackSpinEvent[];
  derived: SpinDerived;
  /** Present on list responses; null when the album is no longer in the collection. */
  album?: SpinAlbumSummary | null;
}

/** Edit a spin. A new selection (sides or tracks) replaces the old one. */
export interface SpinUpdateInput {
  friend_id: number;
  played_at?: string;
  note?: string | null;
  context_type?: string | null;
  side_keys?: string[];
  track_refs?: SpinTrackRef[];
}

export type SpinUpdateResponse = SpinSessionDetail;

export interface SpinCreateResponse {
  session: SpinSession;
  selections: SpinSelection[];
  expanded_tracks: TrackSpinEvent[];
  derived: SpinDerived;
}

export interface SpinListQuery {
  friend_id: number;
  release_id?: string;
  track_id?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface SpinListResponse {
  items: SpinSessionDetail[];
  limit: number;
  offset: number;
}

export interface SpinDeleteResponse {
  success: boolean;
  session: SpinSession;
}

export interface SpinTopTracksQuery {
  friend_id: number;
  release_id?: string;
  limit?: number;
  offset?: number;
}

export interface SpinTopTrack {
  friend_id: number;
  release_id: string;
  track_id: string;
  play_count: number;
  last_played_at: string;
  title_snapshot: string;
  artist_snapshot: string;
  album_snapshot: string;
  side_key?: string | null;
  position_snapshot?: string | null;
}

export interface SpinTopTracksResponse {
  items: SpinTopTrack[];
  limit: number;
  offset: number;
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

// ─── Manual aggregation backfill (#304) ───────────────────────────────────────

export interface SpinAggregateRequest {
  since: string;
  source_id?: string;
}

export interface SpinAggregateSourceResult {
  source_id: string;
  created: number;
  skipped: number;
}

export interface SpinAggregateResult {
  since: string;
  created: number;
  skipped: number;
  sources: SpinAggregateSourceResult[];
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

export type SleeveType = "original" | "paper" | "poly-rice-paper-poly" | "poly";
export type RecordActionType = "cleaned" | "sleeved" | "inspected" | "repaired";
export type CleaningMethod = "dry-brush" | "wet-manual" | "vacuum" | "ultrasonic" | "other";
export type RecordCareStatus = "never_cleaned" | "overdue" | "needs_sleeve";

/** One physical copy of a release. */
export interface RecordCopy {
  id: number;
  friend_id: number;
  release_id: string;
  /** The copy an action logged against the release lands on. */
  is_default: boolean;
  label: string | null;
  notes: string | null;
  /** From the latest sleeved action; null when none is logged. */
  inner_sleeve_type: SleeveType | null;
  /** From the latest cleaned action; null when never cleaned. */
  last_cleaned_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A copy as listed. Asked about one release that has no copy rows, the list
 * holds its implicit default copy, with `id`, `created_at` and `updated_at`
 * null; label it with `updateDefaultRecordCopy`, which makes it real.
 */
export type RecordCopyListItem = Omit<RecordCopy, "id" | "created_at" | "updated_at"> & {
  id: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export interface RecordAction {
  id: number;
  copy_id: number;
  friend_id: number;
  action_type: RecordActionType;
  occurred_at: string;
  notes: string | null;
  sleeve_type: SleeveType | null;
  details: { method?: CleaningMethod };
  /** Set once voided; a voided action stays in the history. */
  voided_at: string | null;
  created_at: string;
}

export interface RecordCopyCreateInput {
  friend_id: number;
  release_id: string;
  label?: string | null;
  notes?: string | null;
}

/** Label or annotate a release's default copy, real or still implicit. */
export interface RecordCopyDefaultUpdateInput {
  friend_id: number;
  release_id: string;
  label?: string | null;
  notes?: string | null;
}

/** The sleeve is not editable here: log a `sleeved` action. */
export interface RecordCopyUpdateInput {
  friend_id: number;
  label?: string | null;
  notes?: string | null;
}

interface RecordActionInputBase {
  friend_id: number;
  action_type: RecordActionType;
  /** Defaults to now; may be backdated. */
  occurred_at?: string;
  notes?: string | null;
  /** Required for `sleeved`, and only for `sleeved`. */
  sleeve_type?: SleeveType;
  /** `method` only for `cleaned`. */
  details?: { method?: CleaningMethod };
}

/**
 * Against a copy, or against a release — which lands on its default copy,
 * created if it has none.
 */
export type RecordActionInput =
  | (RecordActionInputBase & { copy_id: number; release_id?: never })
  | (RecordActionInputBase & { copy_id?: never; release_id: string });

export interface RecordActionResult {
  action: RecordAction;
  /** The copy with its care state after the change. */
  copy: RecordCopy;
}

export interface RecordActionListQuery {
  friend_id: number;
  action_type?: RecordActionType;
  include_voided?: boolean;
  limit?: number;
  offset?: number;
}

export interface RecordActionListResponse {
  items: RecordAction[];
  limit: number;
  offset: number;
}

export interface RecordCareQuery {
  friend_id: number;
  status?: RecordCareStatus;
  /** Defaults to the server's RECORD_CLEANING_OVERDUE_DAYS (365). */
  overdue_days?: number;
  /** Defaults to poly-rice-paper-poly. */
  needs_sleeve?: SleeveType;
  /** "unknown" for copies with no sleeve logged. */
  sleeve_type?: SleeveType | "unknown";
  limit?: number;
  offset?: number;
}

export interface RecordCareItem {
  friend_id: number;
  release_id: string;
  album_title: string;
  album_artist: string;
  album_thumbnail: string | null;
  /** Null for an album with no copy rows: its implicit default copy. */
  copy_id: number | null;
  is_default: boolean;
  label: string | null;
  inner_sleeve_type: SleeveType | null;
  last_cleaned_at: string | null;
}

export interface RecordCareResponse {
  items: RecordCareItem[];
  total: number;
  limit: number;
  offset: number;
  overdue_days: number;
  needs_sleeve_type: SleeveType;
}

export interface RecordCareSummaryQuery {
  friend_id: number;
  overdue_days?: number;
  needs_sleeve?: SleeveType;
}

export interface RecordCareSummary {
  total: number;
  never_cleaned: number;
  overdue: number;
  needs_sleeve: number;
  by_sleeve_type: Record<SleeveType | "unknown", number>;
  overdue_days: number;
  needs_sleeve_type: SleeveType;
}

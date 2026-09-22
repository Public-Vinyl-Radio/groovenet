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
  embedding?: string | number[] | null;
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

export interface TrackSearchQuery {
  query?: string;
  limit?: number;
  offset?: number;
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
  selection_mode: "sides" | "tracks";
  played_at: string;
  note?: string | null;
  context_type?: string | null;
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

export interface SpinSessionDetail {
  session: SpinSession;
  selections: SpinSelection[];
  track_events: TrackSpinEvent[];
  derived: SpinDerived;
}

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

/**
 * Reference fingerprints for live vinyl matching.
 *
 * A track can hold several fingerprints at once — one per engine
 * (`fingerprint_type`) and per engine revision (`fingerprint_version`) — so a
 * new engine can be indexed alongside the old one and swapped in only once it
 * is proven.
 */

/**
 * Engine that produced a fingerprint, e.g. `chromaprint`. Stored as `varchar`
 * rather than an enum so adding an engine needs no migration.
 */
export type FingerprintType = string;

/** A `track_fingerprints` row as Postgres returns it. */
export type TrackFingerprintRow = {
  id: string;
  track_id: string;
  friend_id: number;
  fingerprint_type: FingerprintType;
  fingerprint_version: string;
  fingerprint_data: Buffer | null;
  audio_sha256: string;
  audio_duration_seconds: number | null;
  /** The audio file's size and mtime when fingerprinted (#303); null on older rows. */
  audio_size_bytes: number | null;
  audio_mtime_ms: number | null;
  created_at: Date | string;
  updated_at: Date | string;
};

/**
 * The three inputs that decide whether stored work can be reused: a row is
 * stale when the source audio hash has changed, and irrelevant when it belongs
 * to a different engine or engine version.
 */
export type FingerprintIdentity = {
  track_id: string;
  friend_id: number;
  fingerprint_type: FingerprintType;
  fingerprint_version: string;
};

/** Everything needed to decide "skip or regenerate", without the payload. */
export type TrackFingerprintStatusRow = FingerprintIdentity & {
  audio_sha256: string;
  audio_duration_seconds: number | null;
  updated_at: Date | string;
};

export type UpsertTrackFingerprintInput = FingerprintIdentity & {
  fingerprint_data: Buffer | null;
  audio_sha256: string;
  audio_duration_seconds?: number | null;
  audio_size_bytes?: number | null;
  audio_mtime_ms?: number | null;
};

/**
 * A fingerprint's audio re-checked and found unchanged, byte for byte, but
 * with a size or mtime not yet recorded (#303). Recording them is what lets
 * the next check skip hashing.
 */
export type RecordFileStatsInput = FingerprintIdentity & {
  audio_sha256: string;
  audio_size_bytes: number;
  audio_mtime_ms: number;
};

export type ListFingerprintsFilters = {
  fingerprint_type: FingerprintType;
  fingerprint_version: string;
  friend_id?: number;
  limit?: number;
  offset?: number;
};

/**
 * Which slice of the library an indexing run covers (#277).
 *
 * `missing` and `changed` are the two halves of "bring the index up to date";
 * `all` is the same set plus the tracks that are already current, for forcing a
 * regeneration. `track` and `release` narrow to one thing.
 */
export type FingerprintIndexScope =
  | { kind: "missing" }
  | { kind: "changed" }
  | { kind: "all" }
  | { kind: "track"; track_id: string; friend_id?: number }
  | { kind: "release"; release_id: string; friend_id?: number };

/**
 * One track an indexing run will queue, stamped with what is already stored for
 * it under the active engine.
 *
 * `stored_audio_sha256` is the hash of the file as it was when last indexed, or
 * `null` when nothing is stored — which is what lets the worker decide
 * skip-or-regenerate from the bytes without asking back.
 */
export type FingerprintIndexCandidate = {
  track_id: string;
  friend_id: number;
  local_audio_url: string;
  stored_audio_sha256: string | null;
  stored_audio_size_bytes: number | null;
  stored_audio_mtime_ms: number | null;
};

/**
 * The engine a run indexes under, as `fingerprint-service` advertises it.
 *
 * Not configured here: the values live on the matcher class in Python, and the
 * worker republishes them on its heartbeat cycle. A second copy in this app's
 * env is exactly how half a library ends up indexed under the wrong version.
 */
export type FingerprintEngine = {
  fingerprint_type: FingerprintType;
  fingerprint_version: string;
};

/** Counters for one indexing run, as the CLI renders them. */
export type FingerprintIndexRun = {
  run_id: string;
  scope: string;
  fingerprint_type: FingerprintType;
  fingerprint_version: string;
  /** Candidates queued — excludes unindexable tracks, which are never queued. */
  queued: number;
  /** Tracks with no `local_audio_url`: reported, never treated as failures. */
  unindexable: number;
  indexed: number;
  skipped: number;
  failed: number;
  errors: string[];
  started_at: number;
  updated_at: number;
  /** True once every queued track has reached a terminal state. */
  complete: boolean;
};

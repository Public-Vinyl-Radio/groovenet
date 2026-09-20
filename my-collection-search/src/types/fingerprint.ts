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
};

export type ListFingerprintsFilters = {
  fingerprint_type: FingerprintType;
  fingerprint_version: string;
  friend_id?: number;
  limit?: number;
  offset?: number;
};

/** Tracklists derived from whole set recordings (#282). */

export type SetRecordingRow = {
  sha256: string;
  file_path: string;
  original_filename: string | null;
  format_name: string | null;
  duration_seconds: number | null;
  size_bytes: string | number;
  created_at: Date | string;
};

export type SetDerivationStatus = "queued" | "processing" | "processed" | "failed";

/** One candidate for one window, exactly as `fingerprint-service` reports it. */
export type SetWindowCandidate = {
  track_id: string;
  friend_id: number;
  confidence: number;
  offset_seconds: number;
};

/** One window of the recording. An empty `candidates` is unidentified audio. */
export type SetWindow = {
  start_seconds: number;
  duration_seconds: number;
  candidates: SetWindowCandidate[];
};

export type SetDerivationRow = {
  id: string;
  recording_sha256: string;
  fingerprint_type: string;
  fingerprint_version: string;
  window_seconds: number;
  step_seconds: number;
  status: SetDerivationStatus;
  error: string | null;
  duration_seconds: number | null;
  windows: SetWindow[] | null;
  created_at: Date | string;
  updated_at: Date | string;
  completed_at: Date | string | null;
};

/** The body `fingerprint-service` posts when a set job finishes. */
export type SetDerivationResultReport = {
  derivation_id: string;
  status: "processed" | "failed";
  error?: string | null;
  fingerprint_type?: string | null;
  fingerprint_version?: string | null;
  duration_seconds?: number | null;
  windows: SetWindow[];
};

/** Enough of a track to print a tracklist line and pair by release. */
export type SetTrackRef = {
  track_id: string;
  friend_id: number;
  title: string | null;
  artist: string | null;
  release_id: string | null;
  position: string | null;
};

/** Consecutive confident windows of one track: one play. */
export type DerivedPlay = {
  track_id: string;
  friend_id: number;
  start_seconds: number;
  end_seconds: number;
  confidence: number;
  windows: number;
  /**
   * Track seconds per recording second across the play, from the matcher's
   * offsets. ~1.0 is a record playing through at pitch — #271 measured
   * 1.0013 over nine and a half minutes. Null with a single window.
   */
  rate: number | null;
  track: SetTrackRef | null;
};

export type UnidentifiedRegion = {
  start_seconds: number;
  end_seconds: number;
  /**
   * Tracks on the releases played either side of the gap that have no
   * fingerprint, so could not have been recognised. Often the answer.
   */
  unindexed_neighbours: SetTrackRef[];
};

export type PlannedEntry = SetTrackRef & {
  /** 0-based position in the playlist. */
  index: number;
  fingerprinted: boolean;
};

export type SetDiff = {
  playlist_id: number;
  played_as_planned: Array<{ play: number; planned: PlannedEntry; out_of_order: boolean }>;
  played_instead_of: Array<{ play: number; planned: PlannedEntry }>;
  played_not_planned: Array<{ play: number }>;
  planned_not_played: PlannedEntry[];
};

export type SetDerivationView = {
  derivation: Omit<SetDerivationRow, "windows">;
  recording: SetRecordingRow;
  summary: {
    plays: number;
    duration_seconds: number | null;
    identified_seconds: number;
    identified_fraction: number | null;
  } | null;
  tracklist: DerivedPlay[];
  unidentified: UnidentifiedRegion[];
  diff: SetDiff | null;
};

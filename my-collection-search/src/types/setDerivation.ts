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

import type {
  DerivedPlay,
  SetDerivationStatus,
  SetDiff,
  SetWindow,
  UnidentifiedRegion,
} from "@groovenet/contracts";

export type {
  SetDerivationStatus,
  SetWindow,
  SetTrackRef,
  DerivedPlay,
  UnidentifiedRegion,
  PlannedEntry,
  SetDiff,
} from "@groovenet/contracts";

/** One candidate for one window, exactly as `fingerprint-service` reports it. */
export type SetWindowCandidate = SetWindow["candidates"][number];

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

/** Raw matcher output for one candidate in one listener-audio window. */
export type PlayDetectionRow = {
  id: string;
  ingest_id: string;
  source_id: string;
  session_id: string | null;
  track_id: string | null;
  friend_id: number | null;
  confidence: number | null;
  offset_seconds: number | null;
  window_start_at: Date | string | null;
  fingerprint_type: string | null;
  fingerprint_version: string | null;
  created_at: Date | string;
};

export type CreatePlayDetectionInput = {
  id?: string;
  ingest_id: string;
  source_id: string;
  session_id?: string | null;
  track_id?: string | null;
  friend_id?: number | null;
  confidence?: number | null;
  offset_seconds?: number | null;
  window_start_at?: Date | string | null;
  fingerprint_type?: string | null;
  fingerprint_version?: string | null;
};

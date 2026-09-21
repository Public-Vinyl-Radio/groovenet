/**
 * Retention for the raw vinyl audio the ingest volume holds (#269).
 *
 * Chunks arrive from a listener, get fingerprinted, and are then worthless —
 * `audio_ingests` keeps the durable record, and the audio itself is discarded.
 * Nothing here is about recognising audio; it is only about not keeping it.
 */

/** How much raw audio the ingest volume may hold, and for how long. */
export type IngestRetentionPolicy = {
  /**
   * Oldest a file may be before it is swept regardless of its record, in
   * hours. The backstop for anything the status rules miss.
   */
  maxAgeHours: number;
  /**
   * Total bytes the ingest volume may hold. Over budget, the oldest sweepable
   * files go first.
   */
  maxBytes: number;
  /**
   * How long a file with no `audio_ingests` row must sit before it counts as
   * an orphan.
   *
   * Load-bearing: the ingest route writes the file and then inserts the row, so
   * for a moment every legitimate upload looks exactly like an orphan. Without
   * this the sweeper would race the writer and delete audio that was about to
   * be claimed.
   */
  orphanGraceMinutes: number;
  /** Minutes between sweeps. The scheduler still ticks every minute. */
  sweepIntervalMinutes: number;
};

/** Why one file was swept, or spared. */
export type SweepReason =
  | "terminal"
  | "orphaned"
  | "expired"
  | "over-budget"
  | "in-flight"
  | "within-grace"
  | "retained";

export type SweepCandidate = {
  /** Name as it appears on the ingest volume and in `audio_ingests.file_path`. */
  fileName: string;
  bytes: number;
  /** Epoch ms; the file's own mtime, not its record's timestamps. */
  modifiedAt: number;
};

export type SweepDecision = SweepCandidate & {
  deleted: boolean;
  reason: SweepReason;
};

/** What one sweep did. */
export type SweepSummary = {
  scanned: number;
  deleted: number;
  bytesReclaimed: number;
  spared: number;
  /** Deletions that failed — logged, never fatal. */
  errors: string[];
  startedAt: string;
  finishedAt: string;
};

/** What `GET /api/audio/ingest/retention` reports. */
export type IngestRetentionStatus = {
  files: number;
  bytes: number;
  /** Files the next sweep would delete. */
  sweepable: number;
  /** Files with no record, past the grace period. */
  orphans: number;
  /** Files held by a `received` or `processing` record, never swept. */
  inFlight: number;
  lastSweptAt: string | null;
  policy: IngestRetentionPolicy;
};

// ─── Ingest endpoint (#275) ───────────────────────────────────────────────────

/**
 * Stable, machine-readable rejection reasons.
 *
 * The listener device is a Raspberry Pi with no screen and nobody watching it.
 * It needs to tell "stop retrying, this chunk is bad" from "the server is
 * unhappy, try again" without parsing prose, so these strings are part of the
 * contract and must not be reworded.
 */
export type IngestErrorCode =
  | "missing_audio_file"
  | "missing_source_id"
  | "unsupported_audio_format"
  | "invalid_audio_stream"
  | "audio_too_large"
  | "audio_too_short"
  | "audio_too_long";

/** Limits on what one chunk may be. */
export type IngestLimits = {
  maxBytes: number;
  minDurationSeconds: number;
  maxDurationSeconds: number;
};

export type IngestRequestFields = {
  source_id: string;
  session_id?: string | null;
  sequence?: number | null;
  captured_at?: string | null;
};

export type AcceptedIngest = {
  status: "accepted";
  ingest_id: string;
  source_id: string;
  duration_seconds: number;
  sample_rate: number | null;
  channels: number | null;
  captured_at: string | null;
};

// ─── Lifecycle (#276) ─────────────────────────────────────────────────────────

/** One candidate the matcher proposed for a window. */
export type IngestMatchCandidate = {
  track_id: string;
  friend_id: number;
  confidence: number;
  offset_seconds: number;
};

/**
 * What `fingerprint-service` posts back when it finishes a chunk.
 *
 * `candidates` is list-shaped but only ever holds zero or one entry; an empty
 * list with `status: "processed"` is a recorded no-match window, not a failure.
 */
export type IngestResultReport = {
  ingest_id: string;
  status: "processed" | "failed";
  error?: string | null;
  window_start_at?: string | null;
  duration_seconds?: number | null;
  sample_rate?: number | null;
  fingerprint_type?: string | null;
  fingerprint_version?: string | null;
  candidates: IngestMatchCandidate[];
};

export type ReapSummary = {
  examined: number;
  failed: number;
  /** Of those failed, how many were never picked up at all. */
  neverClaimed: number;
};

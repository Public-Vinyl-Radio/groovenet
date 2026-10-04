export type EmbeddingJobKind = "identity" | "audio_vibe";

export interface EmbeddingJob {
  track_id: string;
  friend_id: number;
  kind: EmbeddingJobKind;
  /** Set by a backfill run (#388) so the queue worker can report progress back. */
  run_id?: string;
  /** Regenerate even if the source hash is unchanged (e.g. after a template edit, #382). */
  force?: boolean;
}

/** An `EmbeddingJob` that has already failed at least once. */
export interface EmbeddingRetryJob extends EmbeddingJob {
  attempts: number;
}

export interface EmbeddingQueueHealth {
  queueDepth: number;
  failedCount: number;
  paused: boolean;
  lastError?: string;
}

/**
 * Progress for one backfill run (#388), same shape as `FingerprintIndexRun`:
 * `POST /api/embeddings/backfill` seeds `queued` and returns immediately;
 * `GET /api/embeddings/backfill/{runId}` polls the rest as the queue worker
 * fills them in.
 */
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

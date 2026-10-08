import type { EmbeddingModelKind } from "@/types/embeddings";

export type EmbeddingJobKind = EmbeddingModelKind;

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

/** A still-running backfill run, as it shows up in the `/jobs` queue view (#451). */
export interface EmbeddingBackfillRunSummary {
  run_id: string;
  queued: number;
  success: number;
  skipped: number;
  failed: number;
  started_at: number;
  updated_at: number;
}

/** Depth of each priority lane (#450) the worker drains, in that drain order. */
export interface EmbeddingQueueLaneDepths {
  interactive: number;
  sync: number;
  bulk: number;
}

export type EmbeddingQueueKindCounts = Record<EmbeddingJobKind, number>;

/** One entry from `embedding_queue:failed` (#451), with a stable `id` for the retry action. */
export interface EmbeddingFailedJob {
  id: string;
  track_id: string;
  friend_id: number;
  kind: EmbeddingJobKind;
  run_id?: string;
  attempts: number;
  error: string;
  failed_at: number;
}

/**
 * Full queue picture for `/jobs` (#451): what #385/#388/#450 already track in
 * Redis, surfaced without anyone needing `redis-cli` to answer "why doesn't
 * this track have embeddings yet."
 */
export interface EmbeddingQueueStatus {
  lanes: EmbeddingQueueLaneDepths;
  retrying: number;
  failed_count: number;
  paused: boolean;
  pause_reason?: string;
  last_error?: string;
  interval_seconds: number;
  batch_size: number;
  /** Jobs/minute while actively draining; 0 while paused. */
  drain_rate_per_minute: number;
  /** Null while paused (nothing draining) or when the backlog is empty, in which case it's 0. */
  eta_seconds: number | null;
  by_kind: EmbeddingQueueKindCounts;
  /** True when a lane was longer than the sample taken to build `by_kind`. */
  by_kind_sampled: boolean;
  active_backfill_runs: EmbeddingBackfillRunSummary[];
  failed: EmbeddingFailedJob[];
}

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

export type {
  EmbeddingsBackfillRun as EmbeddingBackfillRun,
  EmbeddingQueueActiveRun as EmbeddingBackfillRunSummary,
  EmbeddingQueueFailedJob as EmbeddingFailedJob,
  EmbeddingQueueKindCounts,
  EmbeddingQueueLaneDepths,
  EmbeddingQueueStatus,
} from "@groovenet/contracts";

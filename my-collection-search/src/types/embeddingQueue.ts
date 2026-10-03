export type EmbeddingJobKind = "identity" | "audio_vibe" | "prompt";

export interface EmbeddingJob {
  track_id: string;
  friend_id: number;
  kind: EmbeddingJobKind;
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

export type EmbeddingType = "identity" | "audio_vibe";

export interface BackfillOptions {
  friend_id?: number;
  release_id?: string;
  track_ids?: string[];
  force?: boolean;
  limit?: number;
  batch_size?: number;
}

export interface EmbeddingBackfillOptions extends BackfillOptions {
  type: EmbeddingType;
}

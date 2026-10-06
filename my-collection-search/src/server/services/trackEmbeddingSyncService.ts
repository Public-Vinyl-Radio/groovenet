import { embeddingQueueService } from "@/server/services/embeddingQueueService";
import type { EmbeddingTrackRef } from "@/types/embeddings";

export type IdentityEmbeddingSyncResult = {
  queued: number;
};

/**
 * Enqueues identity and context embedding generation for tracks that were just created
 * or whose album metadata just changed (Discogs sync, album create/upsert).
 *
 * Identity embeddings read the track *and* its album (genres, styles, label,
 * country), so call this after the album row is written. Enqueues rather
 * than generates inline (#385) — a sync no longer waits on OpenAI, and a
 * provider outage retries in the background instead of silently leaving
 * tracks without embeddings. Idempotent either way: the embedding queue
 * worker skips a track whose source hash is unchanged.
 */
export async function syncIdentityEmbeddings(
  tracks: EmbeddingTrackRef[]
): Promise<IdentityEmbeddingSyncResult> {
  if (tracks.length === 0) return { queued: 0 };

  // The context embedding (#408) reads exactly what identity reads.
  await embeddingQueueService.enqueue(
    tracks.flatMap((track) =>
      (["identity", "context"] as const).map((kind) => ({
        track_id: track.track_id,
        friend_id: track.friend_id,
        kind,
      }))
    ),
    "sync"
  );

  return { queued: tracks.length };
}

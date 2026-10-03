import { generateAndStoreIdentityEmbedding } from "@/lib/identity-embedding";
import type { EmbeddingTrackRef } from "@/types/embeddings";

const DEFAULT_CONCURRENCY = 4;

export type IdentityEmbeddingSyncResult = {
  generated: number;
  unchanged: number;
  failed: number;
  /** Message of the first failure, e.g. an OpenAI key/organization rejection. */
  firstError?: string;
};

/**
 * Generates identity embeddings for tracks that were just created or whose
 * album metadata just changed (Discogs sync, album create/upsert).
 *
 * Identity embeddings read the track *and* its album (genres, styles, label,
 * country), so call this after the album row is written. Best-effort by
 * design: a failure is logged and counted, never thrown, so an embedding
 * outage cannot fail an import. Idempotent — `generateAndStoreIdentityEmbedding`
 * skips a track whose source hash is unchanged, and the identity backfill
 * (`embeddingsService.backfillIdentity`) catches whatever this misses.
 */
export async function syncIdentityEmbeddings(
  tracks: EmbeddingTrackRef[],
  concurrency = DEFAULT_CONCURRENCY
): Promise<IdentityEmbeddingSyncResult> {
  const result: IdentityEmbeddingSyncResult = {
    generated: 0,
    unchanged: 0,
    failed: 0,
  };

  for (let i = 0; i < tracks.length; i += concurrency) {
    const batch = tracks.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map((track) =>
        generateAndStoreIdentityEmbedding(track.track_id, track.friend_id)
      )
    );
    settled.forEach((outcome, index) => {
      if (outcome.status === "fulfilled") {
        if (outcome.value.updated) result.generated += 1;
        else result.unchanged += 1;
        return;
      }
      result.failed += 1;
      result.firstError ??=
        outcome.reason instanceof Error
          ? outcome.reason.message
          : String(outcome.reason);
      const track = batch[index];
      console.error(
        `[Embeddings] Identity embedding failed for ${track.track_id}@${track.friend_id}:`,
        outcome.reason
      );
    });
  }

  return result;
}

import {
  buildIdentityData,
  buildIdentityText,
  computeSourceHash,
  fetchTrackWithAlbum,
  needsEmbeddingUpdate,
  storeIdentityEmbedding,
} from "@/lib/identity-embedding";
import { buildContextText, needsContextUpdate } from "@/lib/context-embedding";
import {
  buildAudioVibeData,
  buildAudioVibeText,
  computeAudioVibeHash,
  hasAudioData,
  needsAudioVibeUpdate,
  storeAudioVibeEmbedding,
} from "@/lib/audio-vibe-embedding";
import { getTargetProvider } from "@/lib/embeddings/config";
import { CURRENT_TEMPLATE_VERSIONS } from "@/lib/embeddings/templateVersions";
import { trackRepository } from "@/server/repositories/trackRepository";
import { embeddingsRepository } from "@/server/repositories/embeddingsRepository";
import type { EmbeddingProvider } from "@/lib/embeddings/provider";
import type { EmbeddingJob } from "@/types/embeddingQueue";

type Prepared = {
  job: EmbeddingJob;
  text: string;
  sourceHash: string;
  provider: EmbeddingProvider;
  store: (embedding: number[]) => Promise<void>;
};

export type BatchResult = { updated: boolean; error?: unknown; pending?: boolean };

function isAuthFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /invalid_organization|incorrect api key|invalid_api_key|unauthorized|\b401\b/i.test(message);
}

function isBadInput(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === 400;
}

async function prepare(job: EmbeddingJob): Promise<Prepared | null> {
  const { track_id, friend_id, kind } = job;
  if (kind === "identity" || kind === "context") {
    const track = await fetchTrackWithAlbum(track_id, friend_id);
    if (!track) throw new Error(`Track not found: ${track_id} (friend_id: ${friend_id})`);
    const data = buildIdentityData(track);
    const sourceHash = computeSourceHash(data);
    const needsUpdate = kind === "identity" ? needsEmbeddingUpdate : needsContextUpdate;
    if (!job.force && !(await needsUpdate(track_id, friend_id, sourceHash))) return null;
    const provider = await getTargetProvider(kind);
    const text = kind === "identity" ? buildIdentityText(data) : buildContextText(data);
    return {
      job, text, sourceHash, provider,
      store: (embedding) => kind === "identity"
        ? storeIdentityEmbedding(track_id, friend_id, embedding, sourceHash, text, provider.model, provider.dims)
        : embeddingsRepository.upsertTrackEmbedding({
            trackId: track_id, friendId: friend_id, embeddingType: "context",
            model: provider.model, dims: provider.dims, embedding, sourceHash,
            identityText: text, templateVersion: CURRENT_TEMPLATE_VERSIONS.context,
          }),
    };
  }

  if (kind === "audio_vibe") {
    const track = await trackRepository.findTrackByTrackIdAndFriendIdRaw(track_id, friend_id);
    if (!track) throw new Error(`Track not found: ${track_id} (friend_id: ${friend_id})`);
    if (!hasAudioData(track)) return null;
    const data = buildAudioVibeData(track);
    const sourceHash = computeAudioVibeHash(data);
    if (!job.force && !(await needsAudioVibeUpdate(track_id, friend_id, sourceHash))) return null;
    const provider = await getTargetProvider(kind);
    const text = buildAudioVibeText(data);
    return {
      job, text, sourceHash, provider,
      store: (embedding) => storeAudioVibeEmbedding(
        track_id, friend_id, embedding, sourceHash, text, provider.model, provider.dims
      ),
    };
  }

  // Old prompt jobs can still be present in Redis after the column's removal.
  return null;
}

/** Prepare independently, call the provider once per compatible group, then store independently. */
export async function runEmbeddingBatch(jobs: EmbeddingJob[]): Promise<BatchResult[]> {
  const results: BatchResult[] = jobs.map(() => ({ updated: false, pending: true }));
  const prepared = await Promise.allSettled(jobs.map(prepare));
  const groups = new Map<string, { index: number; item: Prepared }[]>();

  for (let index = 0; index < prepared.length; index += 1) {
    const outcome = prepared[index];
    if (outcome.status === "rejected") {
      results[index] = { updated: false, error: outcome.reason };
    } else if (outcome.value) {
      const item = outcome.value;
      const key = JSON.stringify([item.job.kind, item.provider.model, item.provider.dims]);
      const group = groups.get(key) ?? [];
      group.push({ index, item });
      groups.set(key, group);
    } else {
      results[index] = { updated: false };
    }
  }

  for (const group of groups.values()) {
    try {
      const vectors = await group[0].item.provider.embed(group.map(({ item }) => item.text));
      if (vectors.length !== group.length) {
        throw new Error(`Embedding provider returned ${vectors.length} vectors for ${group.length} inputs`);
      }
      const stored = await Promise.allSettled(group.map(({ item }, i) => item.store(vectors[i])));
      stored.forEach((outcome, i) => {
        results[group[i].index] = outcome.status === "fulfilled"
          ? { updated: true }
          : { updated: false, error: outcome.reason };
      });
    } catch (error) {
      if (isBadInput(error) && group.length > 1) {
        // One malformed input must not keep every track in the group retrying.
        for (const { index, item } of group) {
          try {
            const [vector] = await item.provider.embed([item.text]);
            if (!vector) throw new Error("Embedding provider returned no vector");
            await item.store(vector);
            results[index] = { updated: true };
          } catch (singleError) {
            results[index] = { updated: false, error: singleError };
            if (isAuthFailure(singleError)) return results;
          }
        }
      } else {
        // 429s and outages retain per-job retry counters without multiplying requests.
        for (const { index } of group) results[index] = { updated: false, error };
        if (isAuthFailure(error)) break;
      }
    }
  }
  return results;
}

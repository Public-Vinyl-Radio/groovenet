import { withDbClient } from "@/lib/serverDb";
import { generateAndStoreIdentityEmbedding } from "@/lib/identity-embedding";
import { getIdentityPreview } from "@/lib/identity-embedding";
import { getAudioVibePreview } from "@/lib/audio-vibe-embedding";
import { embeddingsRepository } from "@/server/repositories/embeddingsRepository";
import type { BackfillOptions } from "@/types/backfill";
import type {
  EmbeddingTrackRef,
  SimilarIdentityTrack,
  SimilarityFilters,
  SimilarVibeTrack,
} from "@/types/embeddings";

type BackfillFailure = EmbeddingTrackRef & { error: string };
export type EmbeddingPreviewType = "identity" | "audio_vibe";
export type EmbeddingPreviewResult = {
  type: EmbeddingPreviewType;
  text: string;
  data: unknown;
};

export function applyEraFilter(
  tracks: SimilarIdentityTrack[],
  era?: string
): SimilarIdentityTrack[] {
  if (!era) return tracks;

  return tracks.filter((track) => {
    const year = track.year;
    if (!year) return era === "unknown-era";
    const yearNum = typeof year === "string" ? parseInt(year, 10) : year;
    if (isNaN(yearNum) || yearNum < 1900) return era === "unknown-era";

    if (era === "2020s") return yearNum >= 2020;
    if (era === "2010s") return yearNum >= 2010 && yearNum < 2020;
    if (era === "2000s") return yearNum >= 2000 && yearNum < 2010;
    if (era === "1990s") return yearNum >= 1990 && yearNum < 2000;
    if (era === "1980s") return yearNum >= 1980 && yearNum < 1990;
    if (era === "1970s") return yearNum >= 1970 && yearNum < 1980;
    if (era === "1960s") return yearNum >= 1960 && yearNum < 1970;
    if (era === "1950s") return yearNum >= 1950 && yearNum < 1960;
    if (era === "pre-1950s") return yearNum < 1950;

    return false;
  });
}

async function processBackfillBatch(
  tracks: EmbeddingTrackRef[],
  force: boolean
): Promise<{ success: number; skipped: number; failed: BackfillFailure[] }> {
  const results = await Promise.allSettled(
    tracks.map((track) =>
      generateAndStoreIdentityEmbedding(track.track_id, track.friend_id, force)
    )
  );

  let success = 0;
  let skipped = 0;
  const failed: BackfillFailure[] = [];

  results.forEach((result, index) => {
    const track = tracks[index];
    if (result.status === "fulfilled") {
      if (result.value.updated) success += 1;
      else skipped += 1;
      return;
    }
    failed.push({
      track_id: track.track_id,
      friend_id: track.friend_id,
      error: result.reason?.message || String(result.reason),
    });
  });

  return { success, skipped, failed };
}

export class EmbeddingsService {
  async getPreview(
    type: EmbeddingPreviewType,
    trackId: string,
    friendId: number
  ): Promise<EmbeddingPreviewResult> {
    if (type === "identity") {
      const preview = await getIdentityPreview(trackId, friendId);
      return {
        type,
        text: preview.identityText,
        data: preview.identityData,
      };
    }

    const preview = await getAudioVibePreview(trackId, friendId);
    return {
      type,
      text: preview.vibeText,
      data: preview.vibeData,
    };
  }

  async backfillIdentity(options: BackfillOptions): Promise<{
    total: number;
    success: number;
    skipped: number;
    failed: BackfillFailure[];
  }> {
    const tracks = await embeddingsRepository.listTracksNeedingIdentityEmbeddings(options);
    if (tracks.length === 0) {
      return { total: 0, success: 0, skipped: 0, failed: [] };
    }

    const batchSize = options.batch_size ?? 5;
    let success = 0;
    let skipped = 0;
    const failed: BackfillFailure[] = [];

    for (let i = 0; i < tracks.length; i += batchSize) {
      const batch = tracks.slice(i, i + batchSize);
      const result = await processBackfillBatch(batch, options.force ?? false);
      success += result.success;
      skipped += result.skipped;
      failed.push(...result.failed);
    }

    return { total: tracks.length, success, skipped, failed };
  }

  async findSimilarIdentity(params: {
    trackId: string;
    friendId: number;
    limit: number;
    ivfflatProbes: number;
    filters: SimilarityFilters;
  }): Promise<{
    source_track_id: string;
    source_friend_id: number;
    filters: SimilarityFilters;
    count: number;
    tracks: SimilarIdentityTrack[];
  }> {
    return withDbClient(async (client) => {
      await embeddingsRepository.setIvfflatProbes(client, params.ivfflatProbes);
      const sourceEmbedding = await embeddingsRepository.findSourceEmbedding(
        client,
        params.trackId,
        params.friendId,
        "identity"
      );
      if (!sourceEmbedding) {
        throw new Error("missing_identity_embedding");
      }

      const rawTracks = await embeddingsRepository.findSimilarIdentityTracks(client, {
        sourceEmbedding,
        sourceTrackId: params.trackId,
        sourceFriendId: params.friendId,
        limit: params.limit * 2,
        filters: params.filters,
      });
      const filteredByEra = applyEraFilter(rawTracks, params.filters.era).slice(
        0,
        params.limit
      );

      return {
        source_track_id: params.trackId,
        source_friend_id: params.friendId,
        filters: params.filters,
        count: filteredByEra.length,
        tracks: filteredByEra,
      };
    });
  }

  async findSimilarVibe(params: {
    trackId: string;
    friendId: number;
    limit: number;
    ivfflatProbes: number;
  }): Promise<{
    source_track_id: string;
    source_friend_id: number;
    count: number;
    tracks: SimilarVibeTrack[];
  }> {
    return withDbClient(async (client) => {
      await embeddingsRepository.setIvfflatProbes(client, params.ivfflatProbes);
      const sourceEmbedding = await embeddingsRepository.findSourceEmbedding(
        client,
        params.trackId,
        params.friendId,
        "audio_vibe"
      );
      if (!sourceEmbedding) {
        throw new Error("missing_audio_vibe_embedding");
      }

      const tracks = await embeddingsRepository.findSimilarAudioVibeTracks(client, {
        sourceEmbedding,
        sourceTrackId: params.trackId,
        sourceFriendId: params.friendId,
        limit: params.limit,
      });

      return {
        source_track_id: params.trackId,
        source_friend_id: params.friendId,
        count: tracks.length,
        tracks,
      };
    });
  }
}

export const embeddingsService = new EmbeddingsService();

/**
 * Scores a recommendation response with the one ranker (#1191), for the
 * opt-in `breakdown`. Additive: candidates keep their retrieval order and
 * set; each gains a `ranking` (score, constraints, per-signal breakdown).
 */
import type { RankingConfigId, RecommendationsResponse } from "@groovenet/contracts";
import {
  retrieveSeedMetadata,
  type CandidateTrack,
  type SeedTrackRef,
} from "@/lib/recommendation-candidate-retriever";
import { RANKING_CONFIGS } from "@/lib/ranking/configs";
import { rankingTrackFromMetadata } from "@/lib/ranking/features";
import { defaultRanker } from "@/lib/ranking/ranker";
import { loadGenreOverlapContext } from "@/server/services/genreSimilarityService";

export async function attachRankingBreakdown<T extends { candidates: CandidateTrack[] }>(
  result: T,
  options: { seed: SeedTrackRef; configId?: RankingConfigId },
): Promise<T & { ranking: NonNullable<RecommendationsResponse["ranking"]> }> {
  const configId = options.configId ?? "default";
  const surface = "recommendations" as const;
  const [seedMetadata, genreContext] = await Promise.all([
    retrieveSeedMetadata(options.seed),
    loadGenreOverlapContext(),
  ]);
  const rankings = defaultRanker.rank({
    seed: { track: seedMetadata ? rankingTrackFromMetadata(seedMetadata) : {} },
    candidates: result.candidates.map((candidate) => ({
      ...rankingTrackFromMetadata(candidate.metadata),
      identity: candidate.simIdentity,
      vibe: candidate.simAudio,
    })),
    context: { surface, friendId: options.seed.friendId, genreContext },
    config: RANKING_CONFIGS[configId],
  });
  return {
    ...result,
    candidates: result.candidates.map((candidate, index) => ({
      ...candidate,
      ranking: rankings[index],
    })),
    ranking: {
      config: configId,
      surface,
      seed: { trackId: options.seed.trackId, friendId: options.seed.friendId },
    },
  };
}

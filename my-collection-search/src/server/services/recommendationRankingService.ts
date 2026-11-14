/**
 * Scores a recommendation response with the one ranker (#1191), for the
 * opt-in `breakdown`. Additive: candidates keep their retrieval order and
 * set; each gains a `ranking` (score, constraints, per-signal breakdown).
 */
import type { RecommendationsResponse } from "@groovenet/contracts";
import {
  retrieveSeedMetadata,
  type CandidateTrack,
  type SeedTrackRef,
} from "@/lib/recommendation-candidate-retriever";
import { rankingTrackFromMetadata } from "@/lib/ranking/features";
import { defaultRanker } from "@/lib/ranking/ranker";
import { loadGenreOverlapContext } from "@/server/services/genreSimilarityService";
import { rankingProfileService } from "@/server/services/rankingProfileService";

export async function attachRankingBreakdown<T extends { candidates: CandidateTrack[] }>(
  result: T,
  options: {
    seed: SeedTrackRef;
    /** A preset, built-in config or stored profile id; omitted, the library's active profile. */
    ranker?: string;
    /** Whose active profile applies when `ranker` is omitted. */
    libraryFriendId: number;
  },
): Promise<T & { ranking: NonNullable<RecommendationsResponse["ranking"]> }> {
  const surface = "recommendations" as const;
  // Resolved first: an unknown ranker is a 400 before any other work.
  const ranker = await rankingProfileService.resolveRanker(
    options.ranker,
    options.libraryFriendId,
    surface,
  );
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
    config: ranker.config,
  });
  return {
    ...result,
    candidates: result.candidates.map((candidate, index) => ({
      ...candidate,
      ranking: rankings[index],
    })),
    ranking: {
      config: ranker.id,
      surface,
      ...(ranker.fallback ? { fallback: true } : {}),
      seed: { trackId: options.seed.trackId, friendId: options.seed.friendId },
    },
  };
}

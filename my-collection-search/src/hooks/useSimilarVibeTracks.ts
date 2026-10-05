import { useQuery } from "@tanstack/react-query";
import {
  fetchSimilarVibeTracks,
  type SimilarVibeTracksOptions,
} from "@/services/internalApi/tracks";

type UseSimilarVibeTracksOptions = SimilarVibeTracksOptions & {
  enabled?: boolean;
};

/**
 * Hook to fetch similar tracks based on audio vibe embeddings
 */
export function useSimilarVibeTracks(options: UseSimilarVibeTracksOptions) {
  return useQuery({
    queryKey: [
      "similar-vibe-tracks",
      options.track_id,
      options.friend_id,
      options.limit,
      options.ivfflat_probes,
      options.scope,
      options.library_friend_id,
    ],
    queryFn: () => fetchSimilarVibeTracks(options),
    enabled: options.enabled !== false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export default useSimilarVibeTracks;

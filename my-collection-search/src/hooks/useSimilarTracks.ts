import { useQuery } from "@tanstack/react-query";
import {
  fetchSimilarTracks,
  type SimilarTracksOptions as SimilarTracksApiOptions,
} from "@/services/internalApi/tracks";

type SimilarTracksOptions = Omit<SimilarTracksApiOptions, "tags"> & {
  tags?: string[];
  enabled?: boolean;
};

/**
 * Hook to fetch similar tracks based on identity embeddings
 */
export function useSimilarTracks(options: SimilarTracksOptions) {
  return useQuery({
    queryKey: [
      "similar-tracks",
      options.track_id,
      options.friend_id,
      options.limit,
      options.era,
      options.country,
      options.tags,
      options.scope,
      options.library_friend_id,
    ],
    queryFn: () =>
      fetchSimilarTracks({
        ...options,
        tags:
          Array.isArray(options.tags) && options.tags.length > 0
            ? options.tags.join(",")
            : undefined,
      }),
    enabled: options.enabled !== false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export default useSimilarTracks;

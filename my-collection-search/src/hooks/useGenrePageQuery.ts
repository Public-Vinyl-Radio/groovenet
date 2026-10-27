"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { fetchGenrePage } from "@/services/internalApi/genres";

/** The genre page's data (#376) for the current collection; idle until a friend is known. */
export function useGenrePageQuery(slug: string, friendId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.genrePage(slug, friendId),
    queryFn: async () => {
      // Samples are retained by the API for other consumers; this page reads
      // entities through paginated searches and Zustand, never the query cache.
      const { top_tracks: _tracks, top_albums: _albums, ...metadata } = await fetchGenrePage(slug, friendId);
      return metadata;
    },
    enabled: Boolean(slug) && friendId !== undefined,
    staleTime: 60_000,
    retry: false,
  });
}

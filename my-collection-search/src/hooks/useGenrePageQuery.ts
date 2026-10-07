"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { fetchGenrePage } from "@/services/internalApi/genres";

/** The genre page's data (#376) for the current collection; idle until a friend is known. */
export function useGenrePageQuery(slug: string, friendId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.genrePage(slug, friendId),
    queryFn: () => fetchGenrePage(slug, friendId),
    enabled: Boolean(slug) && friendId !== undefined,
    staleTime: 60_000,
  });
}

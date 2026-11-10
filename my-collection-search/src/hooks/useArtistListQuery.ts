"use client";

import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { fetchArtistLetters, listArtists } from "@/services/internalApi/artists";

export const ARTIST_PAGE_SIZE = 100;
/** The grouped list loads whole, in the API's largest pages (#1116). */
export const ARTIST_FULL_PAGE_SIZE = 200;

/**
 * The artists index (#709): one collection's artists by name or alias, or by
 * index letter, a page at a time. Artists are shared reference data, not
 * collection entities, so the rows stay in the query cache.
 */
export function useArtistListQuery(params: {
  q: string;
  letter?: string;
  friendId: number | undefined;
  enabled?: boolean;
  pageSize?: number;
}) {
  const { q, letter, friendId, enabled = true, pageSize = ARTIST_PAGE_SIZE } = params;
  const query = useInfiniteQuery({
    queryKey: queryKeys.artistList({ q, letter, friendId, limit: pageSize }),
    queryFn: ({ pageParam }) =>
      listArtists({ q, letter, friend_id: friendId, limit: pageSize, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => {
      const next = last.offset + last.items.length;
      return next < last.total ? next : undefined;
    },
    enabled: enabled && friendId !== undefined,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  return {
    ...query,
    artists: query.data?.pages.flatMap((page) => page.items) ?? [],
    total: query.data?.pages[0]?.total,
  };
}

/** Artists per index letter (#1116): what the jump index greys out letters from. */
export function useArtistLetters(friendId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.artistLetters(friendId),
    queryFn: () => fetchArtistLetters(friendId),
    enabled: enabled && friendId !== undefined,
    staleTime: 60_000,
  });
}

/** A few artists matching what's typed, for the filter picker and the command palette. */
export function useArtistSuggestions(q: string, friendId: number | undefined, limit = 8) {
  const words = q.trim();
  return useQuery({
    queryKey: queryKeys.artistList({ q: words, friendId, limit }),
    queryFn: () => listArtists({ q: words, friend_id: friendId, limit }),
    enabled: words.length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

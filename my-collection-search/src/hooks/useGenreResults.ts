"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { searchAlbums } from "@/services/internalApi/albums";
import { searchTracks } from "@/services/internalApi/tracks";
import { useAlbumStore } from "@/stores/albumStore";
import { useTrackStore } from "@/stores/trackStore";

export type GenreView = "albums" | "tracks";

/** Paginated full results. Only refs and pagination metadata enter React Query. */
export function useGenreResults(slug: string, friendId: number | undefined, view: GenreView) {
  return useInfiniteQuery({
    queryKey: queryKeys.genreResults(slug, friendId, view),
    enabled: Boolean(slug) && friendId !== undefined,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (view === "albums") {
        const page = await searchAlbums({
          genre: [slug],
          friend_id: friendId,
          limit: 24,
          offset: pageParam,
        });
        useAlbumStore.getState().setAlbums(page.hits);
        return {
          refs: page.hits.map(({ release_id, friend_id }) => ({ id: release_id, friend_id })),
          total: page.estimatedTotalHits,
          offset: page.offset,
          limit: page.limit,
        };
      }
      const page = await searchTracks({
        genre: [slug],
        filter: `friend_id = ${friendId}`,
        limit: 24,
        offset: pageParam,
      });
      useTrackStore.getState().setTracks(page.hits);
      return {
        refs: page.hits.map(({ track_id, friend_id }) => ({ id: track_id, friend_id })),
        total: page.estimatedTotalHits,
        offset: page.offset,
        limit: page.limit,
      };
    },
    getNextPageParam: (page) =>
      page.refs.length && page.offset + page.limit < page.total
        ? page.offset + page.limit
        : undefined,
  });
}

"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { searchAlbums } from "@/services/internalApi/albums";
import { searchTracks } from "@/services/internalApi/tracks";
import { useAlbumStore } from "@/stores/albumStore";
import { useTrackStore } from "@/stores/trackStore";

export type GenreView = "albums" | "tracks";

export const GENRE_TRACK_PAGE_SIZE = 24;

/** Paginated full results. Only refs and pagination metadata enter React Query. */
export function useGenreResults(
  slug: string,
  friendId: number | undefined,
  view: GenreView,
  albumPageSize: number,
) {
  const pageSize = view === "albums" ? albumPageSize : GENRE_TRACK_PAGE_SIZE;
  return useInfiniteQuery({
    queryKey: queryKeys.genreResults(slug, friendId, view, pageSize),
    enabled: Boolean(slug) && friendId !== undefined,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (view === "albums") {
        const page = await searchAlbums({
          genre: [slug],
          friend_id: friendId,
          limit: pageSize,
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
        limit: pageSize,
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

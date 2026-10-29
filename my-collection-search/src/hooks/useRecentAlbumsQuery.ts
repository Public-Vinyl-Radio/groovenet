"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { searchAlbums } from "@/services/internalApi/albums";
import { useAlbumStore } from "@/stores/albumStore";

/** The last four albums brought into this collection, with entity data owned by Zustand. */
export function useRecentAlbumsQuery(friendId?: number) {
  const entities = useAlbumStore((state) => state.albums);
  const query = useQuery({
    queryKey: queryKeys.recentAlbums(friendId),
    enabled: friendId !== undefined,
    staleTime: 30_000,
    queryFn: async () => {
      const { hits } = await searchAlbums({
        friend_id: friendId,
        sort: "created_at:desc",
        limit: 4,
      });
      useAlbumStore.getState().setAlbums(hits);
      return hits.map((album) => `${album.release_id}:${album.friend_id}`);
    },
  });
  const albums = useMemo(
    () =>
      (query.data ?? []).flatMap((key) => {
        const album = entities.get(key);
        return album ? [album] : [];
      }),
    [query.data, entities],
  );
  return { ...query, albums };
}

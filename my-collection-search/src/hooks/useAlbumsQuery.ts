"use client";
import { queryKeys } from "@/lib/queryKeys";
import { useEffect } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteAlbum,
  getAlbumWithTracks,
  searchAlbums,
  updateAlbum,
  type AlbumSearchParams,
  type AlbumUpdateParams,
} from "@/services/internalApi/albums";
import { useTrackStore } from "@/stores/trackStore";
import { useAlbumStore } from "@/stores/albumStore";

/**
 * Hook for infinite scroll album search
 */
export function useAlbumsInfiniteQuery(params: Omit<AlbumSearchParams, "offset">) {
  const limit = params.limit || 20;
  const setAlbums = useAlbumStore((state) => state.setAlbums);

  const query = useInfiniteQuery({
    queryKey: ["albums", "infinite", params],
    queryFn: async ({ pageParam = 0 }) => {
      return await searchAlbums({
        ...params,
        offset: pageParam,
        limit,
      });
    },
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.limit;
      if (nextOffset < lastPage.estimatedTotalHits) {
        return nextOffset;
      }
      return undefined;
    },
    initialPageParam: 0,
  });

  useEffect(() => {
    const albums = query.data?.pages.flatMap((p) => p.hits ?? []) ?? [];
    if (albums.length > 0) {
      setAlbums(albums);
    }
  }, [query.data, setAlbums]);

  const albumRefs =
    query.data?.pages.flatMap((page) =>
      (page.hits ?? []).map((a) => ({
        releaseId: a.release_id,
        friendId: a.friend_id,
      })),
    ) ?? [];

  return { ...query, albumRefs };
}

/**
 * Hook for single page album search (no infinite scroll)
 */
export function useAlbumsQuery(params: AlbumSearchParams) {
  const setAlbums = useAlbumStore((state) => state.setAlbums);

  const query = useInfiniteQuery({
    queryKey: ["albums", params],
    queryFn: async () => {
      return await searchAlbums(params);
    },
    getNextPageParam: () => undefined, // Disable pagination
    initialPageParam: 0,
  });

  useEffect(() => {
    const albums = query.data?.pages.flatMap((p) => p.hits ?? []) ?? [];
    if (albums.length > 0) {
      setAlbums(albums);
    }
  }, [query.data, setAlbums]);

  const albumRefs =
    query.data?.pages.flatMap((page) =>
      (page.hits ?? []).map((a) => ({
        releaseId: a.release_id,
        friendId: a.friend_id,
      })),
    ) ?? [];

  return { ...query, albumRefs };
}

/**
 * Hook for fetching a single album with its tracks
 */
export function useAlbumDetailQuery(releaseId: string, friendId: number) {
  const setAlbum = useAlbumStore((state) => state.setAlbum);
  const markAlbumHydrated = useAlbumStore((state) => state.markAlbumHydrated);
  const { setTracks, markReleaseHydrated } = useTrackStore();

  const query = useQuery({
    queryKey: ["album", releaseId, friendId],
    queryFn: async () => {
      return await getAlbumWithTracks(releaseId, friendId);
    },
    enabled: !!releaseId && !!friendId,
  });

  useEffect(() => {
    if (!query.data) return;
    setAlbum(query.data.album);
    if (query.data.tracks?.length) {
      setTracks(query.data.tracks);
    }
    markAlbumHydrated(releaseId, friendId);
    markReleaseHydrated(releaseId, friendId);
  }, [
    query.data,
    releaseId,
    friendId,
    setAlbum,
    setTracks,
    markAlbumHydrated,
    markReleaseHydrated,
  ]);

  return query;
}

/**
 * Hook for updating album metadata
 */
export function useUpdateAlbumMutation() {
  const queryClient = useQueryClient();
  const { updateTracksByRelease } = useTrackStore();
  const { setAlbum } = useAlbumStore();

  return useMutation({
    mutationFn: async (params: AlbumUpdateParams) => {
      return await updateAlbum(params);
    },
    onSuccess: (data, variables) => {
      // Invalidate all album queries to refetch with updated data
      queryClient.invalidateQueries({ queryKey: ["albums"] });

      // Also invalidate the specific album detail
      queryClient.invalidateQueries({
        queryKey: ["album", data.album.release_id, data.album.friend_id],
      });

      setAlbum(data.album);

      if (
        variables.genre_override_ids !== undefined ||
        variables.style_override_ids !== undefined
      ) {
        updateTracksByRelease(data.album.release_id, data.album.friend_id, {
          album_genres: data.album.effective_genres,
          album_styles: data.album.effective_styles,
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.tracksRoot() });
        queryClient.invalidateQueries({ queryKey: queryKeys.genresRoot() });
      }

      // If library_identifier was part of the update, sync tracks in store + cache
      if (variables?.library_identifier !== undefined) {
        const libraryIdentifier = data.album.library_identifier ?? null;

        updateTracksByRelease(data.album.release_id, data.album.friend_id, {
          library_identifier: libraryIdentifier,
        });
      }
    },
  });
}

/**
 * Hook for permanently deleting an album and its tracks (#511).
 */
export function useDeleteAlbumMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ releaseId, friendId }: { releaseId: string; friendId: number }) => {
      return await deleteAlbum(releaseId, friendId);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      queryClient.removeQueries({
        queryKey: ["album", variables.releaseId, variables.friendId],
      });
    },
  });
}

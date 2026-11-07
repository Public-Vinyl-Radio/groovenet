"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { fetchArtistPage } from "@/services/internalApi/artists";
import { useAlbumStore } from "@/stores/albumStore";
import { useTrackStore } from "@/stores/trackStore";

/**
 * The artist page's data (#707). Albums and tracks go into the entity stores,
 * so the query cache keeps only refs and metadata; idle until a friend is known.
 */
export function useArtistPageQuery(slug: string, friendId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.artistPage(slug, friendId),
    queryFn: async () => {
      const { albums, top_tracks, ...rest } = await fetchArtistPage(slug, friendId);
      useAlbumStore.getState().setAlbums(albums);
      useTrackStore.getState().setTracks(top_tracks);
      return {
        ...rest,
        albums: albums.map((album) => ({
          release_id: album.release_id,
          friend_id: album.friend_id,
          title: album.title,
          year: album.year ?? null,
          date_added: album.date_added ?? null,
          appears_on_tracks: album.appears_on_tracks,
          appears_on_positions: album.appears_on_positions,
        })),
        top_tracks: top_tracks.map(({ track_id, friend_id }) => ({ track_id, friend_id })),
      };
    },
    enabled: Boolean(slug) && friendId !== undefined,
    staleTime: 60_000,
    retry: false,
  });
}

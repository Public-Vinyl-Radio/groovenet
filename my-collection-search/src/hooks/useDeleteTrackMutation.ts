"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/queryKeys";
import { softDeleteTrack } from "@/services/internalApi/tracks";
import { useTrackStore } from "@/stores/trackStore";

type DeleteTrackVars = { track_id: string; friend_id: number; release_id?: string | null };

/**
 * Soft-deletes a track, evicts it from the track store and refetches every
 * server-backed view that can list it. Restoring needs no counterpart: the
 * restored row returns through the normal fetch-and-hydrate path.
 */
export function useDeleteTrackMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ track_id, friend_id }: DeleteTrackVars) =>
      softDeleteTrack({ track_id, friend_id }),
    onSuccess: (_data, { track_id, friend_id, release_id }) => {
      useTrackStore.getState().removeTrack(track_id, friend_id);
      qc.removeQueries({ queryKey: queryKeys.trackById(track_id, friend_id) });
      const keys = [
        queryKeys.tracksRoot(),
        queryKeys.albumsRoot(),
        queryKeys.playlistRoot(),
        queryKeys.playlistTracksRoot(),
        queryKeys.genresRoot(),
        queryKeys.homeRoot(),
        queryKeys.playlists(),
        ...(release_id ? [queryKeys.albumDetail(release_id, friend_id)] : []),
      ];
      for (const queryKey of keys) qc.invalidateQueries({ queryKey });
    },
  });
}

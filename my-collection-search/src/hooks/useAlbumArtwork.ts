"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useAlbumStore } from "@/stores/albumStore";
import { useTrackStore } from "@/stores/trackStore";
import {
  applyAlbumArtwork,
  fetchAlbumArtwork,
  previewAppleMusicArtwork,
  uploadAlbumArtwork,
  type AlbumArtworkApplySource,
  type AlbumArtworkState,
} from "@/services/internalApi/albumArtwork";

/**
 * Pushes a changed cover into the album and track entity stores, so every view
 * of this album (cards, player, track rows) shows it without a refetch.
 */
export function syncArtworkIntoStores(state: AlbumArtworkState): void {
  // Every caller has just applied art, so current_url is that art.
  const url = state.current_url ?? "";
  useAlbumStore.getState().updateAlbum(state.release_id, state.friend_id, {
    audio_file_album_art_url: url,
    album_art_source: state.source,
    apple_music_art_url: state.apple_music_art_url,
  });
  useTrackStore.getState().updateTracksByRelease(state.release_id, state.friend_id, {
    audio_file_album_art_url: url,
  });
}

export function useAlbumArtwork(releaseId: string, friendId: number, enabled = true) {
  const queryClient = useQueryClient();
  const key = queryKeys.albumArtwork(releaseId, friendId);

  const artworkQuery = useQuery({
    queryKey: key,
    queryFn: () => fetchAlbumArtwork(releaseId, friendId),
    enabled: enabled && !!releaseId && friendId > 0,
  });

  const onChanged = (state: AlbumArtworkState) => {
    queryClient.setQueryData(key, state);
    syncArtworkIntoStores(state);
    void queryClient.invalidateQueries({ queryKey: queryKeys.albumArtworkReviewRoot() });
  };

  const previewMutation = useMutation({
    mutationFn: () => previewAppleMusicArtwork(releaseId, friendId),
  });

  const applyMutation = useMutation({
    mutationFn: (source: AlbumArtworkApplySource) =>
      applyAlbumArtwork(releaseId, friendId, source),
    onSuccess: onChanged,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadAlbumArtwork(releaseId, friendId, file),
    onSuccess: onChanged,
  });

  return { artworkQuery, previewMutation, applyMutation, uploadMutation };
}

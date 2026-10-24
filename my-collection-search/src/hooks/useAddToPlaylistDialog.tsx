"use client";

import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toaster } from "@/components/ui/toaster";
import { updatePlaylist, importPlaylist } from "@/services/internalApi/playlists";
import { queryKeys } from "@/lib/queryKeys";
import type { Track, Playlist } from "@/types/track";
import PlaylistSelectionDialog from "@/components/PlaylistSelectionDialog";
import NamePlaylistDialog from "@/components/NamePlaylistDialog";
import { analytics } from "@/lib/analytics/client";

/**
 * Hook for managing add-to-playlist dialog workflow. `onAdded` runs once the
 * track is actually in a playlist, not when the dialog opens.
 */
export function useAddToPlaylistDialog({
  onAdded,
}: { onAdded?: (track: Track) => void } = {}) {
  const queryClient = useQueryClient();
  const [isPlaylistDialogOpen, setIsPlaylistDialogOpen] = React.useState(false);
  const [isNameDialogOpen, setIsNameDialogOpen] = React.useState(false);
  const [playlistName, setPlaylistName] = React.useState("");
  // One track from a row's menu, or a whole album's worth from its header.
  const [currentTracks, setCurrentTracks] = React.useState<Track[]>([]);
  const [currentLabel, setCurrentLabel] = React.useState<string | null>(null);

  const resetState = React.useCallback(() => {
    setIsPlaylistDialogOpen(false);
    setIsNameDialogOpen(false);
    setPlaylistName("");
    setCurrentTracks([]);
    setCurrentLabel(null);
  }, []);

  // Mutation for adding tracks to an existing playlist
  const addToPlaylistMutation = useMutation({
    mutationFn: async ({ playlist, tracks }: { playlist: Playlist; tracks: Track[] }) => {
      const existingTracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];
      const isIn = (track: Track) =>
        existingTracks.some((t) =>
          typeof t === 'string' ? t === track.track_id : t.track_id === track.track_id
        );
      // Tracks already in the playlist are skipped; adding only those is an error.
      const fresh = tracks.filter((track) => !isIn(track));

      if (fresh.length === 0) {
        throw new Error(
          tracks.length === 1
            ? `Track is already in playlist "${playlist.name}"`
            : `These tracks are already in playlist "${playlist.name}"`
        );
      }

      // Add tracks to end of playlist
      const updatedTracks = [
        ...existingTracks,
        ...fresh.map((track) => ({ track_id: track.track_id, friend_id: track.friend_id })),
      ];

      await updatePlaylist(playlist.id, { tracks: updatedTracks });

      return { playlist, tracks: fresh };
    },
    onSuccess: ({ playlist, tracks }) => {
      toaster.create({
        title:
          tracks.length === 1
            ? `"${tracks[0].title}" added to "${playlist.name}"`
            : `${tracks.length} tracks added to "${playlist.name}"`,
        type: "success",
      });
      // Invalidate playlist queries to refresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.playlists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.playlistTrackIds(playlist.id) });

      tracks.forEach((track) => {
        analytics.track("track_added_to_playlist", {
          track_id: track.track_id,
          playlist_id: playlist.id,
          is_new_playlist: false,
        });
        onAdded?.(track);
      });
      resetState();
    },
    onError: (error) => {
      toaster.create({
        title: error.message || "Failed to add track to playlist",
        type: "error",
      });
      resetState();
    },
  });

  // Mutation for creating new playlist with tracks
  const createPlaylistMutation = useMutation({
    mutationFn: async ({ name, tracks }: { name: string; tracks: Track[] }) => {
      await importPlaylist(
        name,
        tracks.map((track) => ({ track_id: track.track_id, friend_id: track.friend_id }))
      );
      return { name, tracks };
    },
    onSuccess: ({ name, tracks }) => {
      toaster.create({
        title:
          tracks.length === 1
            ? `Created "${name}" with "${tracks[0].title}"`
            : `Created "${name}" with ${tracks.length} tracks`,
        type: "success",
      });
      // Invalidate playlist queries to refresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.playlists() });

      tracks.forEach((track) => {
        analytics.track("track_added_to_playlist", {
          track_id: track.track_id,
          is_new_playlist: true,
        });
        onAdded?.(track);
      });
      resetState();
    },
    onError: (error) => {
      toaster.create({
        title: error.message || "Failed to create playlist",
        type: "error",
      });
      resetState();
    },
  });

  // Open dialog for tracks; `label` names them in the title when there are several
  const openForTracks = React.useCallback((tracks: Track[], label?: string) => {
    if (tracks.length === 0) return;
    if (addToPlaylistMutation.isPending || createPlaylistMutation.isPending) return;
    setCurrentTracks(tracks);
    setCurrentLabel(label ?? (tracks.length === 1 ? tracks[0].title : `${tracks.length} tracks`));
    setIsNameDialogOpen(false);
    setPlaylistName("");
    setIsPlaylistDialogOpen(true);
  }, [addToPlaylistMutation, createPlaylistMutation]);

  const openForTrack = React.useCallback((track: Track) => openForTracks([track]), [openForTracks]);

  // Handle playlist selection
  const handlePlaylistSelect = React.useCallback((playlist: Playlist) => {
    if (!addToPlaylistMutation.isPending && !createPlaylistMutation.isPending && currentTracks.length > 0) {
      addToPlaylistMutation.mutate({ playlist, tracks: currentTracks });
    }
    setIsPlaylistDialogOpen(false);
  }, [currentTracks, addToPlaylistMutation, createPlaylistMutation]);

  // Handle create new playlist
  const handleCreateNew = React.useCallback((name?: string) => {
    if (addToPlaylistMutation.isPending || createPlaylistMutation.isPending) return;
    setIsPlaylistDialogOpen(false);
    if (name?.trim()) {
      // If name provided, create immediately
      if (currentTracks.length > 0) {
        createPlaylistMutation.mutate({ name: name.trim(), tracks: currentTracks });
      }
    } else {
      // Otherwise show name dialog
      setIsNameDialogOpen(true);
    }
  }, [currentTracks, createPlaylistMutation, addToPlaylistMutation]);

  // Handle new playlist name confirmation
  const handleNameConfirm = React.useCallback((name: string) => {
    if (!addToPlaylistMutation.isPending && !createPlaylistMutation.isPending && currentTracks.length > 0 && name.trim()) {
      createPlaylistMutation.mutate({ name: name.trim(), tracks: currentTracks });
    }
    setIsNameDialogOpen(false);
    setPlaylistName("");
  }, [currentTracks, createPlaylistMutation, addToPlaylistMutation]);

  // Handle dialog close
  const handleClose = React.useCallback(() => {
    setIsPlaylistDialogOpen(false);
    if (!isNameDialogOpen) {
      setCurrentTracks([]);
      setCurrentLabel(null);
    }
  }, [isNameDialogOpen]);

  const handleNameCancel = React.useCallback(() => {
    resetState();
  }, [resetState]);

  const isSubmitting = addToPlaylistMutation.isPending || createPlaylistMutation.isPending;

  // Stable dialog nodes (avoid remount churn from callback-component identity changes)
  const playlistDialog = (
    <PlaylistSelectionDialog
      open={isPlaylistDialogOpen}
      onClose={handleClose}
      onPlaylistSelect={handlePlaylistSelect}
      onCreateNew={handleCreateNew}
      isSubmitting={isSubmitting}
      title={currentLabel ? `Add "${currentLabel}" to Playlist` : "Add to Playlist"}
    />
  );

  const nameDialog = (
    <NamePlaylistDialog
      open={isNameDialogOpen}
      name={playlistName}
      setName={setPlaylistName}
      trackCount={Math.max(currentTracks.length, 1)}
      onConfirm={handleNameConfirm}
      onCancel={handleNameCancel}
      confirmLabel="Create Playlist"
    />
  );

  return {
    openForTrack,
    openForTracks,
    playlistDialog,
    nameDialog,
    isLoading: isSubmitting,
  } as const;
}

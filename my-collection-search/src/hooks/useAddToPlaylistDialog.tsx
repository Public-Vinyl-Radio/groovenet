"use client";

import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toaster } from "@/components/ui/toaster";
import { updatePlaylist, importPlaylist } from "@/services/internalApi/playlists";
import { queryKeys } from "@/lib/queryKeys";
import type { Track, Playlist } from "@/types/track";
import PlaylistSelectionDialog from "@/components/PlaylistSelectionDialog";
import NamePlaylistDialog from "@/components/NamePlaylistDialog";
import posthog from "posthog-js";

/**
 * Hook for managing add-to-playlist dialog workflow
 */
export function useAddToPlaylistDialog() {
  const queryClient = useQueryClient();
  const [isPlaylistDialogOpen, setIsPlaylistDialogOpen] = React.useState(false);
  const [isNameDialogOpen, setIsNameDialogOpen] = React.useState(false);
  const [playlistName, setPlaylistName] = React.useState("");
  const [currentTrack, setCurrentTrack] = React.useState<Track | null>(null);

  const resetState = React.useCallback(() => {
    setIsPlaylistDialogOpen(false);
    setIsNameDialogOpen(false);
    setPlaylistName("");
    setCurrentTrack(null);
  }, []);

  // Mutation for adding track to existing playlist
  const addToPlaylistMutation = useMutation({
    mutationFn: async ({ playlist, track }: { playlist: Playlist; track: Track }) => {
      // Check if track already exists in playlist
      const existingTracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];
      const trackExists = existingTracks.some((t) =>
        typeof t === 'string' ? t === track.track_id : t.track_id === track.track_id
      );

      if (trackExists) {
        throw new Error(`Track is already in playlist "${playlist.name}"`);
      }

      // Add track to end of playlist
      const updatedTracks = [
        ...existingTracks,
        { track_id: track.track_id, friend_id: track.friend_id }
      ];

      await updatePlaylist(playlist.id, { tracks: updatedTracks });

      return { playlist, track };
    },
    onSuccess: ({ playlist, track }) => {
      toaster.create({
        title: `"${track.title}" added to "${playlist.name}"`,
        type: "success",
      });
      // Invalidate playlist queries to refresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.playlists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.playlistTrackIds(playlist.id) });

      // PostHog: Track track added to playlist
      posthog.capture("track_added_to_playlist", {
        track_id: track.track_id,
        playlist_id: playlist.id,
        playlist_name: playlist.name,
        is_new_playlist: false,
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

  // Mutation for creating new playlist with track
  const createPlaylistMutation = useMutation({
    mutationFn: async ({ name, track }: { name: string; track: Track }) => {
      await importPlaylist(name, [
        { track_id: track.track_id, friend_id: track.friend_id }
      ]);
      return { name, track };
    },
    onSuccess: ({ name, track }) => {
      toaster.create({
        title: `Created "${name}" with "${track.title}"`,
        type: "success",
      });
      // Invalidate playlist queries to refresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.playlists() });

      // PostHog: Track track added to playlist
      posthog.capture("track_added_to_playlist", {
        track_id: track.track_id,
        playlist_name: name,
        is_new_playlist: true,
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

  // Open dialog for track
  const openForTrack = React.useCallback((track: Track) => {
    if (addToPlaylistMutation.isPending || createPlaylistMutation.isPending) return;
    setCurrentTrack(track);
    setIsNameDialogOpen(false);
    setPlaylistName("");
    setIsPlaylistDialogOpen(true);
  }, [addToPlaylistMutation, createPlaylistMutation]);

  // Handle playlist selection
  const handlePlaylistSelect = React.useCallback((playlist: Playlist) => {
    if (!addToPlaylistMutation.isPending && !createPlaylistMutation.isPending && currentTrack) {
      addToPlaylistMutation.mutate({ playlist, track: currentTrack });
    }
    setIsPlaylistDialogOpen(false);
  }, [currentTrack, addToPlaylistMutation, createPlaylistMutation]);

  // Handle create new playlist
  const handleCreateNew = React.useCallback((name?: string) => {
    if (addToPlaylistMutation.isPending || createPlaylistMutation.isPending) return;
    setIsPlaylistDialogOpen(false);
    if (name?.trim()) {
      // If name provided, create immediately
      if (currentTrack) {
        createPlaylistMutation.mutate({ name: name.trim(), track: currentTrack });
      }
    } else {
      // Otherwise show name dialog
      setIsNameDialogOpen(true);
    }
  }, [currentTrack, createPlaylistMutation, addToPlaylistMutation]);

  // Handle new playlist name confirmation
  const handleNameConfirm = React.useCallback((name: string) => {
    if (!addToPlaylistMutation.isPending && !createPlaylistMutation.isPending && currentTrack && name.trim()) {
      createPlaylistMutation.mutate({ name: name.trim(), track: currentTrack });
    }
    setIsNameDialogOpen(false);
    setPlaylistName("");
  }, [currentTrack, createPlaylistMutation, addToPlaylistMutation]);

  // Handle dialog close
  const handleClose = React.useCallback(() => {
    setIsPlaylistDialogOpen(false);
    if (!isNameDialogOpen) {
      setCurrentTrack(null);
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
      title={currentTrack ? `Add "${currentTrack.title}" to Playlist` : "Add to Playlist"}
    />
  );

  const nameDialog = (
    <NamePlaylistDialog
      open={isNameDialogOpen}
      name={playlistName}
      setName={setPlaylistName}
      trackCount={1}
      onConfirm={handleNameConfirm}
      onCancel={handleNameCancel}
      confirmLabel="Create Playlist"
    />
  );

  return {
    openForTrack,
    playlistDialog,
    nameDialog,
    isLoading: isSubmitting,
  } as const;
}

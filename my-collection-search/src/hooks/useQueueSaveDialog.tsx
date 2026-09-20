"use client";

import React from "react";
import NamePlaylistDialog from "@/components/NamePlaylistDialog";
import { toaster } from "@/components/ui/toaster";
import { importPlaylist } from "@/services/internalApi/playlists";
import { usePlaylistPlayer } from "@/providers/PlaylistPlayerProvider";

/**
 * Hook for save queue as playlist dialog
 * Works directly with queue data from PlaylistPlayerProvider
 */
export function useQueueSaveDialog() {
  const [open, setOpen] = React.useState(false);
  const [playlistName, setPlaylistName] = React.useState("");
  const { playlist } = usePlaylistPlayer();

  const onConfirm = React.useCallback(async (finalName: string) => {
    if (playlist.length === 0) {
      toaster.create({ title: "Cannot save empty queue", type: "error" });
      return;
    }

    if (!finalName?.trim()) {
      toaster.create({ title: "Please enter a playlist name", type: "error" });
      return;
    }

    try {
      // Create track objects with friend_id from queue tracks
      const tracksWithFriendId = playlist.map(track => ({
        track_id: track.track_id,
        friend_id: track.friend_id
      }));
      console.log("Saving queue as playlist with tracks:", tracksWithFriendId);

      await importPlaylist(finalName.trim(), tracksWithFriendId);

      toaster.create({ title: "Queue saved as playlist successfully", type: "success" });
      setOpen(false);
      setPlaylistName("");
    } catch (error) {
      console.error("Failed to save queue as playlist:", error);
      toaster.create({ title: "Failed to save queue as playlist", type: "error" });
    }
  }, [playlist]);

  const onCancel = React.useCallback(() => setOpen(false), []);

  const Dialog = React.useCallback(() => (
    <NamePlaylistDialog
      open={open}
      name={playlistName}
      setName={setPlaylistName}
      trackCount={playlist.length}
      onConfirm={onConfirm}
      onCancel={onCancel}
      confirmLabel="Save Queue as Playlist"
    />
  ), [open, playlistName, playlist.length, onConfirm, onCancel]);

  return {
    isOpen: open,
    open: () => setOpen(true),
    close: () => setOpen(false),
    Dialog,
  } as const;
}

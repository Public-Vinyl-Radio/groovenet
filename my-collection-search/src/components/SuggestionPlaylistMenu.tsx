"use client";

import { useState } from "react";
import { Box, Button, Flex, IconButton, Input, Popover, Text } from "@chakra-ui/react";
import { FiPlus } from "react-icons/fi";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePlaylistsQuery } from "@/hooks/usePlaylistsQuery";
import {
  fetchPlaylistTrackIds,
  importPlaylist,
  updatePlaylist,
} from "@/services/internalApi/playlists";
import { queryKeys } from "@/lib/queryKeys";
import { analytics } from "@/lib/analytics/client";
import type { Track } from "@/types/track";

/** A non-modal picker: recent, searchable and new playlists stay at the row. */
export default function SuggestionPlaylistMenu({
  track,
  onAdded,
}: {
  track: Track;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"recent" | "all" | "new">("recent");
  const [name, setName] = useState("");
  const queryClient = useQueryClient();
  const { playlists, isLoading, error } = usePlaylistsQuery({ enabled: open });
  const mutation = useMutation({
    mutationFn: async (playlistId: number | null) => {
      if (track.friend_id == null) throw new Error("This track has no library.");
      const ref = { track_id: track.track_id, friend_id: track.friend_id };
      if (playlistId === null) {
        const playlist = await importPlaylist(name.trim(), [ref]);
        return { playlistId: playlist.id, isNew: true };
      }
      // Read current refs before writing: the list may be stale or omit tracks.
      const { tracks } = await fetchPlaylistTrackIds(playlistId);
      if (
        !tracks.some((item) => item.track_id === ref.track_id && item.friend_id === ref.friend_id)
      ) {
        await updatePlaylist(playlistId, { tracks: [...tracks, ref] });
      }
      return { playlistId, isNew: false };
    },
    onSuccess: ({ playlistId, isNew }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.playlists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.playlistTrackIds(playlistId) });
      analytics.track("track_added_to_playlist", {
        track_id: track.track_id,
        playlist_id: playlistId,
        is_new_playlist: isNew,
      });
      setOpen(false);
      onAdded();
    },
  });
  const recent = [...playlists].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const choices =
    mode === "recent"
      ? recent.slice(0, 5)
      : recent.filter((p) => p.name.toLowerCase().includes(name.toLowerCase()));

  return (
    <Popover.Root
      open={open}
      onOpenChange={({ open: next }) => {
        setOpen(next);
        if (next) {
          setMode("recent");
          setName("");
          mutation.reset();
        }
      }}
      lazyMount
      unmountOnExit
      positioning={{ placement: "bottom-end" }}
    >
      <Popover.Trigger asChild>
        <IconButton
          aria-label={`Add ${track.title} to playlist`}
          variant="outline"
          minW="44px"
          h="44px"
        >
          <FiPlus />
        </IconButton>
      </Popover.Trigger>
      <Popover.Positioner>
        <Popover.Content role="region" aria-label="Choose playlist" w="min(320px, 90vw)">
          <Popover.Body>
            <Flex direction="column" gap={2}>
              <Text fontFamily="label">
                {mode === "recent"
                  ? "Recent playlists"
                  : mode === "all"
                    ? "All playlists"
                    : "New playlist"}
              </Text>
              {mode !== "recent" && (
                <Input
                  aria-label={mode === "new" ? "Playlist name" : "Search playlists"}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
              {mode === "new" ? (
                <Button
                  disabled={!name.trim() || mutation.isPending}
                  onClick={() => mutation.mutate(null)}
                >
                  Create playlist
                </Button>
              ) : (
                <>
                  {isLoading && <Text>Loading playlists...</Text>}
                  {error && <Text color="fg.error">Could not load playlists.</Text>}
                  {!isLoading && !error && choices.length === 0 && <Text>No playlists found.</Text>}
                  <Box maxH="240px" overflowY="auto">
                    {choices.map((playlist) => (
                      <Button
                        key={playlist.id}
                        variant="ghost"
                        fontFamily="body"
                        w="full"
                        justifyContent="flex-start"
                        minH="44px"
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate(playlist.id)}
                      >
                        {playlist.name}
                      </Button>
                    ))}
                  </Box>
                  {mode === "recent" && (
                    <Button variant="ghost" onClick={() => setMode("all")}>
                      All playlists…
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setMode("new");
                      setName("");
                    }}
                  >
                    New playlist…
                  </Button>
                </>
              )}
              {mutation.error && (
                <Text role="alert" color="fg.error">
                  Could not add track. Please try again.
                </Text>
              )}
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </Flex>
          </Popover.Body>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  );
}

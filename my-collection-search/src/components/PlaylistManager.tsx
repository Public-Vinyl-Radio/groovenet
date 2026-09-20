"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DeletePlaylistDialog from "@/components/DeletePlaylistDialog";
import PlaylistListItem from "@/components/PlaylistListItem";
import FriendSelectDialog from "@/components/FriendSelectDialog";
import UnifiedSearchControls from "@/components/search/UnifiedSearchControls";
import {
  Box,
  Text,
  Button,
  SimpleGrid,
  EmptyState,
  Skeleton,
  VStack,
  HStack,
  Menu,
} from "@chakra-ui/react";

import { Toaster, toaster } from "@/components/ui/toaster"; // See below
import { FiHeadphones } from "react-icons/fi";
import { TbFileImport } from "react-icons/tb";
import { usePlaylists } from "@/providers/PlaylistsProvider";
import { createSetForPlaylist, importPlaylist, PlaylistTrackPayload } from "@/services/internalApi/playlists";
import { usePlaylistPlayer } from "@/providers/PlaylistPlayerProvider";
import { fetchTracksByIds } from "@/services/internalApi/tracks";
import { useFriendsQuery } from "@/hooks/useFriendsQuery";
import posthog from "posthog-js";

export default function PlaylistManager() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { playlists, playlistsLoading, loadingPlaylists, fetchPlaylists } = usePlaylists();
  const { friends } = useFriendsQuery({
    showCurrentUser: true,
  });

  const { replacePlaylist } = usePlaylistPlayer();

  const notify = (opts: Parameters<typeof toaster.create>[0]) =>
    toaster.create(opts);

  // Delete dialog state and handler moved to DeletePlaylistDialog below
  const [deleteDialogState, setDeleteDialogState] = useState<{
    open: boolean;
    playlistId: number | null;
  }>({ open: false, playlistId: null });

  // State for friend selection dialog
  const [friendSelectDialogOpen, setFriendSelectDialogOpen] = useState(false);
  const [selectedFriendId, setSelectedFriendId] = useState<number | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    name: string;
    tracks: Array<PlaylistTrackPayload>;
  } | null>(null);

  // Simple filter for playlists
  const [filter, setFilter] = useState("");

  const filtered = React.useMemo(() => {
    const q = filter.toLowerCase();
    return playlists.filter((pl) => !q || pl.name.toLowerCase().includes(q));
  }, [playlists, filter]);

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());
      let name = "Imported Playlist";
      let tracksData: Array<PlaylistTrackPayload> = [];

      // Parse different JSON formats
      if (Array.isArray(data)) {
        tracksData = data.filter((t) => t.track_id);
      } else if (data.tracks && Array.isArray(data.tracks)) {
        if (data.name) name = data.name;
        tracksData = data.tracks.filter((t: PlaylistTrackPayload) => t.track_id);
      } else {
        throw new Error("Invalid playlist format");
      }

      if (!tracksData.length) throw new Error("No valid tracks found");

      // Resolve usernames using already-loaded friends list.
      const availableFriends = friends || [];

      // Check if we can resolve all usernames to friend_ids
      const hasUsernames = tracksData.some((t) => t.username);
      const canResolveAll = hasUsernames && tracksData.every((t) =>
        !t.username ||
        availableFriends.some((f) => f.username === t.username)
      );

      if (!hasUsernames || !canResolveAll) {
        // Need user to select a friend - show friend selection dialog
        setPendingImport({ name, tracks: tracksData });
        setFriendSelectDialogOpen(true);
        return;
      }

      // Resolve usernames to friend_ids
      const friendMap = new Map(availableFriends.map((f) => [f.username, f.id]));
      const tracks: PlaylistTrackPayload[] = tracksData
        .map((t) => {
          const friendId = t.username ? friendMap.get(t.username) : undefined;
          if (!friendId) return null;
          return {
            ...t,
            friend_id: friendId,
          } as PlaylistTrackPayload;
        })
        .filter((t): t is PlaylistTrackPayload => t !== null);

      if (!tracks.length) {
        notify({ title: "Could not resolve any tracks to friends", type: "error" });
        return;
      }

      // Import directly
      await importPlaylist(name, tracks);
      notify({ title: `Imported '${name}'`, type: "success" });
      fetchPlaylists();

      // PostHog: Track playlist import
      posthog.capture("playlist_imported", {
        playlist_name: name,
        track_count: tracks.length,
        import_format: "json",
      });
    } catch (err) {
      console.error("Import error:", err);
      notify({ title: "Error importing playlist", type: "error" });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Handler for friend selection confirmation
  const handleFriendSelectConfirm = async () => {
    if (!pendingImport || !selectedFriendId) return;

    try {
      const tracks = pendingImport.tracks.map((t) => ({
        ...t,
        friend_id: selectedFriendId,
      }));

      await importPlaylist(pendingImport.name, tracks);
      notify({ title: `Imported '${pendingImport.name}'`, type: "success" });
      fetchPlaylists();

      // PostHog: Track playlist import
      posthog.capture("playlist_imported", {
        playlist_name: pendingImport.name,
        track_count: tracks.length,
        import_format: "json",
      });
    } catch {
      notify({ title: "Error importing playlist", type: "error" });
    } finally {
      setFriendSelectDialogOpen(false);
      setPendingImport(null);
      setSelectedFriendId(null);
    }
  };

  return (
    <Box minW="240px">
      {/* Header + filter */}
      <VStack align="stretch" mb={2} gap={2}>
        <UnifiedSearchControls
          query={filter}
          onQueryChange={setFilter}
          showLibrarySelect={false}
          placeholder="Search playlists..."
          desktopControls={
            <>
              <Menu.Root>
                <Menu.Trigger asChild>
                  <Button size="sm" variant="outline" flexShrink={0}>
                    <TbFileImport /> Import
                  </Button>
                </Menu.Trigger>
                <Menu.Positioner>
                  <Menu.Content>
                    <Menu.Item
                      value="import-json"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <TbFileImport /> Import JSON
                    </Menu.Item>
                  </Menu.Content>
                </Menu.Positioner>
              </Menu.Root>
            </>
          }
          mobilePrimaryControl={
            <Menu.Root>
              <Menu.Trigger asChild>
                <Button size="sm" variant="outline" flexShrink={0} px={2}>
                  <TbFileImport />
                </Button>
              </Menu.Trigger>
              <Menu.Positioner>
                <Menu.Content>
                  <Menu.Item
                    value="import-json"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <TbFileImport /> Import JSON
                  </Menu.Item>
                </Menu.Content>
              </Menu.Positioner>
            </Menu.Root>
          }
        />

        {!loadingPlaylists && playlists.length > 0 && (
          <Text fontSize="sm" color="gray.500" px={1}>
            {filtered.length.toLocaleString()}{" "}
            {filtered.length === 1 ? "playlist" : "playlists"}
          </Text>
        )}
      </VStack>

      <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} gap={3} overflowY="auto">
        {playlistsLoading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} height="72px" borderRadius="md" />
          ))
        ) : playlists.length === 0 && !loadingPlaylists ? (
          <EmptyState.Root size={"sm"}>
            <EmptyState.Content>
              <EmptyState.Indicator>
                <FiHeadphones />
              </EmptyState.Indicator>
              <VStack textAlign="center">
                <EmptyState.Title>No saved playlists</EmptyState.Title>
                <EmptyState.Description>
                  Save your playlists to access them here.
                </EmptyState.Description>
                <HStack>
                  <Button
                    size="xs"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Import JSON
                  </Button>
                </HStack>
              </VStack>
            </EmptyState.Content>
          </EmptyState.Root>
        ) : filtered.length === 0 ? (
          <Text fontSize="sm" color="fg.muted" px={2} py={1}>
            {filter.trim()
              ? `No playlists match "${filter}"`
              : "No playlists yet"}
          </Text>
        ) : (
          filtered.map((pl) => {
            const isRowLoading =
              typeof loadingPlaylists === "object" &&
              loadingPlaylists !== null &&
              pl.id === loadingPlaylists.id;
            return (
              <PlaylistListItem
                key={pl.id}
                playlist={pl}
                isLoading={isRowLoading}
                onClick={() => router.push(`/playlists/${pl.id}`)}
                onPlay={async () => {
                  const tracks = await fetchTracksByIds(pl.tracks);
                  replacePlaylist(tracks, { autoplay: true, startIndex: 0 });
                  posthog.capture("playback_started", {
                    playlist_id: pl.id,
                    playlist_name: pl.name,
                    track_count: pl.tracks.length,
                    source: "playlist_manager",
                  });
                }}
                onDelete={() => setDeleteDialogState({ open: true, playlistId: pl.id })}
                onCreateSet={async () => {
                  try {
                    await createSetForPlaylist(pl.id);
                    await fetchPlaylists();
                    notify({ title: `Created a set for '${pl.name}'`, type: "success" });
                  } catch {
                    notify({ title: "Could not create set", type: "error" });
                  }
                }}
              />
            );
          })
        )}
      </SimpleGrid>
      <DeletePlaylistDialog
        open={deleteDialogState.open}
        playlistId={deleteDialogState.playlistId}
        onClose={() => setDeleteDialogState({ open: false, playlistId: null })}
        fetchPlaylists={fetchPlaylists}
        notify={notify}
      />
      <input
        type="file"
        accept="application/json"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={handleImportJson}
      />
      <Toaster />
      <FriendSelectDialog
        open={friendSelectDialogOpen}
        selectedFriendId={selectedFriendId}
        setSelectedFriendId={setSelectedFriendId}
        trackCount={pendingImport?.tracks.length}
        onConfirm={handleFriendSelectConfirm}
        onCancel={() => {
          setFriendSelectDialogOpen(false);
          setPendingImport(null);
          setSelectedFriendId(null);
        }}
      />
    </Box>
  );
}

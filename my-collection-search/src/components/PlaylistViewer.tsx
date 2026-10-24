"use client";

import React, { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  Box,
  EmptyState,
  Flex,
  Text,
  VStack,
  Skeleton,
  Dialog,
  Portal,
  Button,
  Badge,
} from "@chakra-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import { FiHeadphones } from "react-icons/fi";

import TrackViewToggle from "@/components/TrackViewToggle";
import { useTrackViewMode } from "@/hooks/useTrackViewMode";
import DraggableTrackList from "@/components/DraggableTrackList";
import PlaylistStatsPanel from "@/components/PlaylistStatsPanel";
import { useSearchResults } from "@/hooks/useSearchResults";
import PlaylistItemMenu from "@/components/PlaylistItemMenu";
import { usePlaylistTrackIdsQuery } from "@/hooks/usePlaylistTrackIdsQuery";
import { usePlaylistTracksQuery } from "@/hooks/usePlaylistTracksQuery";
import PlaylistActionsMenu from "./PlaylistActionsMenu";
import { usePlaylistSaveDialog } from "@/hooks/usePlaylistSaveDialog";
import { usePlaylistMutations } from "@/hooks/usePlaylistMutations";
import { usePlaylistActions } from "@/hooks/usePlaylistActions";
import PlaylistRecommendations from "./PlaylistRecommendations";
import { Track } from "@/types/track";
import { usePlaylistPlayer } from "@/providers/PlaylistPlayerProvider";
import FriendSelectDialog from "@/components/FriendSelectDialog";
import { toaster } from "@/components/ui/toaster";
import {
  importPlaylist,
  updatePlaylist,
  type PlaylistTrackPayload,
} from "@/services/internalApi/playlists";
import { analyzeTrackAsync, fixTrackDuration } from "@/services/internalApi/tracks";
import NamePlaylistDialog from "@/components/NamePlaylistDialog";
import { queryKeys } from "@/lib/queryKeys";
import { getTrackDurationSeconds } from "@/lib/trackUtils";
import { getMobileBottomOverlayOffset } from "@/lib/mobileLayout";
import SetDetailsPanel from "@/components/SetDetailsPanel";

const PlaylistViewer = ({ playlistId }: { playlistId?: number }) => {
  const { playlistCounts } = useSearchResults({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // State for friend selection dialog
  const [friendSelectDialogOpen, setFriendSelectDialogOpen] = useState(false);
  const [selectedFriendId, setSelectedFriendId] = useState<number | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    tracks: PlaylistTrackPayload[];
  } | null>(null);

  // New query-based hooks
  const {
    tracks: tracksPlaylist,
    playlistName,
    isPending: trackIdsLoading,
    refetch: refetchTrackIds,
  } = usePlaylistTrackIdsQuery(playlistId);

  const { tracks, isPending: tracksLoading } = usePlaylistTracksQuery(
    tracksPlaylist,
    tracksPlaylist.length > 0
  );

  // New mutation and action hooks
  const {
    moveTrack,
    removeFromPlaylist,
    addToPlaylist,
    sortGreedy,
    sortGenetic,
    sortCohesiveBlocks,
    isGeneticSorting,
    isCohesiveBlocksSorting,
    sortPositionChanges,
  } = usePlaylistMutations(playlistId, () => setHasUnsavedChanges(true));

  const {
    replacePlaylist,
    playlistLength,
    playlist: queue,
    currentTrackIndex: queueIndex,
  } = usePlaylistPlayer();
  const { viewMode, setViewMode, layout, isMobile } = useTrackViewMode();
  const mobileBottomOverlayOffset = getMobileBottomOverlayOffset(playlistLength);

  const { exportPlaylist, exportToPDF, getTotalPlaytime } =
    usePlaylistActions(playlistId);

  const {
    Dialog: SaveDialog,
    open: openSaveDialog,
    saveExisting,
  } = usePlaylistSaveDialog(playlistId, () => setHasUnsavedChanges(false));
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateName, setDuplicateName] = useState("");
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [isEnqueuingDownloads, setIsEnqueuingDownloads] = useState(false);
  const [isBackfillingDuration, setIsBackfillingDuration] = useState(false);
  const [recommendationsModalOpen, setRecommendationsModalOpen] = useState(false);
  const [recommendationsPlaylistSnapshot, setRecommendationsPlaylistSnapshot] = useState<Track[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    if (playlistName) {
      setRenameName(playlistName);
      setDuplicateName(`${playlistName} (Copy)`);
    } else if (playlistId) {
      setRenameName(`Playlist ${playlistId}`);
      setDuplicateName(`Playlist ${playlistId} (Copy)`);
    }
  }, [playlistId, playlistName]);

  // Warn before leaving page with unsaved changes
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Get total playtime for display
  const { formatted: totalPlaytimeFormatted, missingCount: durationMissingCount } = getTotalPlaytime();

  // Append tracks to the current playlist
  const appendTracksToPlaylist = async (newTracks: PlaylistTrackPayload[]) => {
    if (!playlistId) return;

    try {
      // Combine existing tracks with new tracks
      const combinedTracks: PlaylistTrackPayload[] = [
        ...tracksPlaylist.map((t) => ({
          track_id: t.track_id,
          friend_id: t.friend_id,
        })),
        ...newTracks,
      ];

      await updatePlaylist(playlistId, { tracks: combinedTracks });
      toaster.create({
        title: `Appended ${newTracks.length} tracks to playlist`,
        type: "success",
      });
      refetchTrackIds();
    } catch (err) {
      console.error("Append error:", err);
      toaster.create({ title: "Error appending tracks", type: "error" });
    }
  };

  const handleFriendSelectConfirm = async () => {
    if (!pendingImport || !selectedFriendId) return;
    try {
      const resolved = pendingImport.tracks
        .map((t) => ({
          ...t,
          friend_id: t.friend_id ?? selectedFriendId,
        }))
        .filter(
          (t) =>
            typeof t.track_id === "string" &&
            t.track_id.length > 0 &&
            typeof t.friend_id === "number"
        ) as PlaylistTrackPayload[];

      if (resolved.length === 0) {
        toaster.create({ title: "No valid tracks to import", type: "error" });
        return;
      }

      await appendTracksToPlaylist(resolved);
    } finally {
      setFriendSelectDialogOpen(false);
      setPendingImport(null);
      setSelectedFriendId(null);
    }
  };

  const handleFriendSelectCancel = () => {
    setFriendSelectDialogOpen(false);
    setPendingImport(null);
    setSelectedFriendId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleEnqueueMissingDownloads = async () => {
    if (!tracks || tracks.length === 0) {
      toaster.create({ title: "No tracks to enqueue", type: "info" });
      return;
    }

    const missingAudio = tracks.filter(
      (t) =>
        !t.local_audio_url &&
        (t.apple_music_url || t.youtube_url || t.soundcloud_url)
    );

    if (missingAudio.length === 0) {
      toaster.create({ title: "All tracks already have audio", type: "info" });
      return;
    }

    setIsEnqueuingDownloads(true);
    let enqueued = 0;
    let failed = 0;

    for (const track of missingAudio) {
      try {
        await analyzeTrackAsync({
          track_id: track.track_id,
          friend_id: track.friend_id,
          title: track.title,
          artist: track.artist,
          apple_music_url: track.apple_music_url || undefined,
          youtube_url: track.youtube_url || undefined,
          soundcloud_url: track.soundcloud_url || undefined,
        });
        enqueued += 1;
      } catch (err) {
        console.error("Failed to enqueue download for track", track.track_id, err);
        failed += 1;
      }
    }

    setIsEnqueuingDownloads(false);

    toaster.create({
      title: `Enqueued ${enqueued} track${enqueued === 1 ? "" : "s"} for download${
        failed ? ` (${failed} failed)` : ""
      }`,
      type: failed ? "warning" : "success",
    });
  };

  const handleBackfillDuration = async () => {
    if (!tracks || tracks.length === 0) {
      toaster.create({ title: "No tracks in playlist", type: "info" });
      return;
    }

    const eligible = tracks.filter(
      (t) => t.local_audio_url && getTrackDurationSeconds(t) === null
    );

    if (eligible.length === 0) {
      toaster.create({
        title: "All tracks with audio already have duration",
        type: "info",
      });
      return;
    }

    setIsBackfillingDuration(true);
    let enqueued = 0;
    let failed = 0;

    for (const track of eligible) {
      try {
        await fixTrackDuration({
          track_id: track.track_id,
          friend_id: track.friend_id!,
          local_audio_url: track.local_audio_url,
        });
        enqueued += 1;
      } catch (err) {
        console.error("Failed to queue fix-duration for track", track.track_id, err);
        failed += 1;
      }
    }

    setIsBackfillingDuration(false);
    toaster.create({
      title: `Queued ${enqueued} track${enqueued === 1 ? "" : "s"} for duration backfill${
        failed ? ` (${failed} failed)` : ""
      }`,
      type: failed ? "warning" : "success",
    });
  };

  const handleDuplicatePlaylist = async (name: string) => {
    const finalName = name.trim();
    if (!finalName) {
      toaster.create({ title: "Please enter a playlist name", type: "error" });
      return;
    }
    if (tracksPlaylist.length === 0) {
      toaster.create({ title: "Cannot duplicate an empty playlist", type: "error" });
      return;
    }
    try {
      await importPlaylist(
        finalName,
        tracksPlaylist.map(({ track_id, friend_id }) => ({
          track_id,
          friend_id,
        }))
      );
      toaster.create({
        title: `Duplicated playlist as "${finalName}"`,
        type: "success",
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.playlists() });
      setDuplicateDialogOpen(false);
    } catch (err) {
      console.error("Duplicate playlist error:", err);
      toaster.create({ title: "Failed to duplicate playlist", type: "error" });
    }
  };

  const handleRenamePlaylist = async (name: string) => {
    const finalName = name.trim();
    if (!finalName) {
      toaster.create({ title: "Please enter a playlist name", type: "error" });
      return;
    }
    if (!playlistId) {
      toaster.create({ title: "Cannot rename an unsaved playlist", type: "error" });
      return;
    }
    try {
      await updatePlaylist(playlistId, { name: finalName });
      toaster.create({
        title: "Playlist renamed",
        type: "success",
      });
      queryClient.setQueryData(
        queryKeys.playlistTrackIds(playlistId),
        (prev: unknown) => {
          if (
            prev &&
            typeof prev === "object" &&
            !Array.isArray(prev) &&
            "playlist_name" in (prev as Record<string, unknown>)
          ) {
            return { ...(prev as Record<string, unknown>), playlist_name: finalName };
          }
          return prev;
        }
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.playlists() });
      setRenameDialogOpen(false);
    } catch (err) {
      console.error("Rename playlist error:", err);
      toaster.create({ title: "Failed to rename playlist", type: "error" });
    }
  };

  // The row the player is on, when the queue is this playlist (it is a copy, so match by track).
  const playingIndex = React.useMemo(() => {
    if (queueIndex === null) return null;
    const playing = queue[queueIndex];
    const here = tracksPlaylist[queueIndex];
    return playing && here && playing.track_id === here.track_id && playing.friend_id === here.friend_id
      ? queueIndex
      : null;
  }, [queue, queueIndex, tracksPlaylist]);

  // Render function for playlist item menu buttons
  const renderPlaylistButtons = React.useCallback(
    (track: Track | undefined, idx: number) => {
      return track ? (
        <PlaylistItemMenu
          key="menu"
          idx={idx}
          total={tracksPlaylist.length}
          track={track}
          moveTrack={moveTrack}
          removeFromPlaylist={removeFromPlaylist}
          size="xs"
        />
      ) : null;
    },
    [tracksPlaylist.length, moveTrack, removeFromPlaylist]
  );

  // Import JSON and append to this playlist
  const handleImportJson = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());
      const tracksData: PlaylistTrackPayload[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.tracks)
        ? data.tracks
        : [];

      const cleanTracks = tracksData
        .map((t) => ({
          track_id: t.track_id,
          friend_id: t.friend_id,
          username: t.username,
          title: t.title,
          artist: t.artist,
          album: t.album,
          year: t.year,
          styles: t.styles,
          genres: t.genres,
          duration: t.duration,
          duration_seconds: t.duration_seconds,
          discogs_url: t.discogs_url,
          apple_music_url: t.apple_music_url,
          youtube_url: t.youtube_url,
          soundcloud_url: t.soundcloud_url,
          album_thumbnail: t.album_thumbnail,
          local_tags: t.local_tags,
          bpm: t.bpm as PlaylistTrackPayload["bpm"],
          key: t.key,
          danceability: t.danceability as PlaylistTrackPayload["danceability"],
          notes: t.notes,
          star_rating: t.star_rating,
          release_id: t.release_id,
          mood_happy: t.mood_happy,
          mood_sad: t.mood_sad,
          mood_relaxed: t.mood_relaxed,
          mood_aggressive: t.mood_aggressive,
        }))
        .filter(
          (t) =>
            typeof t.track_id === "string" &&
            t.track_id.length > 0 &&
            typeof t.friend_id === "number"
        ) as PlaylistTrackPayload[];

      if (cleanTracks.length === 0) {
        toaster.create({
          title: "No valid tracks found in JSON",
          type: "error",
        });
        return;
      }

      const missingFriend = cleanTracks.some(
        (t) => typeof t.friend_id !== "number"
      );
      if (missingFriend) {
        setPendingImport({
          tracks: cleanTracks as PlaylistTrackPayload[],
        });
        setFriendSelectDialogOpen(true);
        return;
      }

      await appendTracksToPlaylist(cleanTracks as PlaylistTrackPayload[]);
    } catch (err) {
      console.error("Import JSON error:", err);
      toaster.create({ title: "Error importing playlist JSON", type: "error" });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (trackIdsLoading || tracksLoading) {
    return (
      <Box>
        {/* Header skeleton */}
        <Flex align="flex-start" w="100%" pt={3} mb={2} gap={3}>
          <Box flex="1">
            <Skeleton height="20px" width="220px" mb={2} />
            <Skeleton height="14px" width="180px" />
          </Box>
          <Box>
            <Skeleton height="32px" width="40px" borderRadius="md" />
          </Box>
        </Flex>

        {/* List skeleton */}
        <Box>
          {Array.from({ length: 6 }).map((_, i) => (
            <Flex key={i} align="center" gap={3} py={2}>
              <Skeleton height="36px" width="36px" borderRadius="md" />
              <Box flex="1">
                <Skeleton
                  height="16px"
                  width={i % 3 === 0 ? "60%" : "75%"}
                  mb={1}
                />
                <Skeleton height="12px" width={i % 2 === 0 ? "35%" : "45%"} />
              </Box>
              <Skeleton height="28px" width="28px" borderRadius="full" />
            </Flex>
          ))}
        </Box>
      </Box>
    );
  }

  if (tracksPlaylist.length === 0) {
    return (
      <Box overflowY="auto">
        <EmptyState.Root size={"sm"}>
          <EmptyState.Content>
            <EmptyState.Indicator>
              <FiHeadphones />
            </EmptyState.Indicator>
            <VStack textAlign="center">
              <EmptyState.Title>Your playlist is empty</EmptyState.Title>
              <EmptyState.Description>
                Add tracks to your playlist to get started.
              </EmptyState.Description>
            </VStack>
          </EmptyState.Content>
        </EmptyState.Root>
      </Box>
    );
  }

  return (
    <>
      <Flex align="flex-start" w="100%" pt={3}>
        <Box flex="1">
          <Flex align="center" gap={2} flexWrap="wrap">
            <Text fontWeight="semibold">
              {playlistName || `Playlist ${playlistId ?? ""}`.trim()}
            </Text>
            {hasUnsavedChanges && (
              <Badge
                colorPalette="status.analysis"
                variant="solid"
                size="sm"
                display={{ base: "none", md: "inline-flex" }}
              >
                Unsaved changes
              </Badge>
            )}
          </Flex>
          <Text fontSize="sm" color="fg.muted" mb={2}>
            Total Playtime: {totalPlaytimeFormatted}
            {durationMissingCount > 0 && (
              <Text as="span" color="fg.muted"> ({durationMissingCount} track{durationMissingCount !== 1 ? "s" : ""} missing timing)</Text>
            )}
          </Text>
        </Box>
        <Flex gap={2} align="flex-start">
          {hasUnsavedChanges && playlistId && (
            <Button
              size="sm"
              colorPalette="accent"
              display={{ base: "none", md: "inline-flex" }}
              onClick={saveExisting}
            >
              Save Changes
            </Button>
          )}
          {!isMobile && <TrackViewToggle value={viewMode} onChange={setViewMode} />}
          <PlaylistActionsMenu
            disabled={tracksPlaylist.length === 0}
            onSortGreedy={() => {
              console.log("sort greed");
              sortGreedy();
            }}
            onSortGenetic={sortGenetic}
            onSortCohesiveBlocks={sortCohesiveBlocks}
            onExportJson={exportPlaylist}
          onImportJson={() => fileInputRef.current?.click()}
          onExportPdf={() =>
            exportToPDF(playlistName || `Playlist ${playlistId ?? ""}`.trim())
          }
          onOpenSaveDialog={playlistId ? saveExisting : openSaveDialog}
          isGeneticSorting={isGeneticSorting}
          isCohesiveBlocksSorting={isCohesiveBlocksSorting}
          onDuplicate={playlistId ? () => setDuplicateDialogOpen(true) : undefined}
          onRename={playlistId ? () => setRenameDialogOpen(true) : undefined}
          onEnqueueMissingDownloads={
            isEnqueuingDownloads ? undefined : handleEnqueueMissingDownloads
          }
          onBackfillDuration={
            isBackfillingDuration ? undefined : handleBackfillDuration
          }
          onOpenRecommendations={() => {
            setRecommendationsPlaylistSnapshot([...tracks]);
            setRecommendationsModalOpen(true);
          }}
          enqueuePlaylist={() =>
            replacePlaylist(tracks, {
              autoplay: true,
              startIndex: 0,
            })
            }
          playlistName={playlistName || undefined}
          />
        </Flex>
      </Flex>
      {playlistId && <SetDetailsPanel playlistId={playlistId} />}
      <PlaylistStatsPanel tracks={tracks} />
      <Box overflowY="auto">
        <DraggableTrackList
          tracksPlaylist={tracksPlaylist}
          tracks={tracks}
          moveTrack={moveTrack}
          droppableId="playlist-droppable"
          renderTrackButtons={renderPlaylistButtons}
          currentTrackIndex={layout === "row" ? playingIndex : undefined}
          trackResultProps={{
            playlistCount: playlistCounts,
            layout,
            onRowClick:
              layout === "row"
                ? (_track, idx) => replacePlaylist(tracks, { autoplay: true, startIndex: idx })
                : undefined,
          }}
          sortPositionChanges={sortPositionChanges}
        />
        {hasUnsavedChanges && playlistId && (
          <Box display={{ base: "block", md: "none" }} h="92px" />
        )}
        {/* <PlaylistRecommendations
          playlist={tracks}
          onAddToPlaylist={addToPlaylist}
        /> */}
        <SaveDialog />
        <NamePlaylistDialog
          open={duplicateDialogOpen}
          name={duplicateName}
          setName={setDuplicateName}
          trackCount={tracksPlaylist.length}
          confirmLabel="Duplicate Playlist"
          onConfirm={handleDuplicatePlaylist}
          onCancel={() => setDuplicateDialogOpen(false)}
        />
        <NamePlaylistDialog
          open={renameDialogOpen}
          name={renameName}
          setName={setRenameName}
          confirmLabel="Rename Playlist"
          onConfirm={handleRenamePlaylist}
          onCancel={() => setRenameDialogOpen(false)}
        />
        <input
          type="file"
          accept=".json,application/json"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleImportJson}
        />
        <FriendSelectDialog
          open={friendSelectDialogOpen}
          selectedFriendId={selectedFriendId}
          setSelectedFriendId={(id) => setSelectedFriendId(id)}
          trackCount={pendingImport?.tracks.length}
          onConfirm={handleFriendSelectConfirm}
          onCancel={handleFriendSelectCancel}
        />

        {/* AI Recommendations Modal */}
        <Dialog.Root
          open={recommendationsModalOpen}
          onOpenChange={(e) => setRecommendationsModalOpen(e.open)}
          size="xl"
        >
          <Portal>
            <Dialog.Backdrop />
            <Dialog.Positioner>
              <Dialog.Content>
                <Dialog.Header>
                  <Flex justify="space-between" align="center" width="100%">
                    <Dialog.Title>AI Recommendations</Dialog.Title>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRecommendationsPlaylistSnapshot([...tracks])}
                      mr={8}
                    >
                      Refresh
                    </Button>
                  </Flex>
                </Dialog.Header>
                <Dialog.Body maxH="70vh" overflowY="auto">
                  {recommendationsModalOpen && (
                    <PlaylistRecommendations
                      playlist={recommendationsPlaylistSnapshot}
                      limit={50}
                      onAddToPlaylist={addToPlaylist}
                    />
                  )}
                </Dialog.Body>
                <Dialog.CloseTrigger />
              </Dialog.Content>
            </Dialog.Positioner>
          </Portal>
        </Dialog.Root>
      </Box>
      {hasUnsavedChanges && playlistId && (
        <Box
          display={{ base: "block", md: "none" }}
          position="fixed"
          left="0"
          right="0"
          bottom={mobileBottomOverlayOffset}
          px={4}
          pb="calc(env(safe-area-inset-bottom, 0px) + 12px)"
          pt={3}
          bg="linear-gradient(to top, var(--chakra-colors-bg), color-mix(in srgb, var(--chakra-colors-bg) 88%, transparent))"
          zIndex={20}
        >
          <Box
            borderWidth="1px"
            borderColor="border.warning"
            bg="bg.warning"
            borderRadius="xl"
            boxShadow="lg"
            px={3}
            py={3}
          >
            <Flex align="center" gap={3}>
              <Box flex="1" minW={0}>
                <Text fontSize="sm" fontWeight="semibold" color="fg.warning">
                  Unsaved changes
                </Text>
                <Text fontSize="xs" color="fg.warning">
                  Reordered tracks won&apos;t persist until you save.
                </Text>
              </Box>
              <Button size="sm" colorPalette="status.analysis" onClick={saveExisting}>
                Save
              </Button>
            </Flex>
          </Box>
        </Box>
      )}
    </>
  );
};

export default PlaylistViewer;

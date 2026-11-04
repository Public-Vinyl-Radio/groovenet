"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Button, Flex, Spinner, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { usePlaybackPlayer } from "@/providers/PlaybackTargetProvider";
import { useEnrichmentStore } from "@/stores/enrichmentStore";
import { toaster } from "@/components/ui/toaster";
import AlbumActionsMenu, { type AlbumActionsMenuProps } from "@/components/AlbumActionsMenu";
import AlbumArtworkDialog from "@/components/AlbumArtworkDialog";
import DeleteAlbumDialog from "@/components/DeleteAlbumDialog";
import RecordActionDialog from "@/components/records/RecordActionDialog";
import RetroDialog from "@/components/ui/RetroDialog";
import { MetaTag } from "@/components/ui/RoleTags";
import {
  fetchAlbumDiscogsRawRelease,
  getAlbumWithTracks,
  queueAlbumDownloads,
} from "@/services/internalApi/albums";
import { compareTrackPositions } from "@/lib/albumTrackPosition";
import type { Album, Track } from "@/types/track";

type Options = {
  album: Album;
  tracks?: Track[];
  tracksLoaded?: boolean;
  editAlbumHref?: string;
  coverUrl?: string;
  catalogue?: string;
  subtitle?: string;
  prominent?: boolean;
  onDeleted?: () => void;
};

export function useAlbumActions({
  album,
  tracks: providedTracks,
  tracksLoaded = false,
  editAlbumHref,
  coverUrl,
  catalogue,
  subtitle,
  prominent,
  onDeleted,
}: Options) {
  const router = useRouter();
  const { replacePlaylist, appendToQueue } = usePlaybackPlayer();
  const setEnrichmentQueue = useEnrichmentStore((s) => s.setQueue);
  const [loadedTracks, setLoadedTracks] = useState<Track[] | undefined>(
    tracksLoaded ? (providedTracks ?? []) : undefined,
  );
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [logCareOpen, setLogCareOpen] = useState(false);
  const [artworkOpen, setArtworkOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const [rawData, setRawData] = useState<Awaited<
    ReturnType<typeof fetchAlbumDiscogsRawRelease>
  > | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);
  const [rawLoading, setRawLoading] = useState(false);
  useEffect(() => {
    if (tracksLoaded) setLoadedTracks(providedTracks ?? []);
  }, [providedTracks, tracksLoaded]);
  const tracks = useMemo(
    () =>
      [...(loadedTracks ?? providedTracks ?? [])].sort((a, b) =>
        compareTrackPositions(a.position, b.position),
      ),
    [loadedTracks, providedTracks],
  );
  const ensureTracks = useCallback(async () => {
    if (loadedTracks)
      return [...loadedTracks].sort((a, b) => compareTrackPositions(a.position, b.position));
    setLoadingTracks(true);
    try {
      const result = await getAlbumWithTracks(album.release_id, album.friend_id);
      const sorted = [...result.tracks].sort((a, b) =>
        compareTrackPositions(a.position, b.position),
      );
      setLoadedTracks(sorted);
      return sorted;
    } catch (error) {
      toaster.create({
        title: "Failed to load album tracks",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
      return [];
    } finally {
      setLoadingTracks(false);
    }
  }, [album.friend_id, album.release_id, loadedTracks]);
  const loadTracks = useCallback(() => {
    void ensureTracks();
  }, [ensureTracks]);
  const playable = (items: Track[]) => items.filter((track) => !!track.local_audio_url);
  const play = async () => {
    const items = playable(await ensureTracks());
    if (!items.length) return;
    replacePlaylist(items, { autoplay: true, startIndex: 0 });
    toaster.create({
      title: `Playing ${album.title}`,
      description: `Playing ${album.title} by ${album.artist}`,
      type: "success",
    });
  };
  const queue = async () => {
    const items = playable(await ensureTracks());
    if (!items.length) return;
    appendToQueue(items);
    toaster.create({ title: `Added ${items.length} tracks to the queue`, type: "success" });
  };
  const enrich = async () => {
    const items = await ensureTracks();
    setEnrichmentQueue(
      items.map((track) => ({ trackId: track.track_id, friendId: track.friend_id })),
    );
    router.push("/enrich");
  };
  const download = async () => {
    setIsDownloading(true);
    try {
      const result = await queueAlbumDownloads(album.release_id, album.friend_id);
      toaster.create(
        result.tracksQueued === 0
          ? {
              title: "No Downloads Needed",
              description: "All tracks already have audio files or no URLs available",
              type: "info",
            }
          : {
              title: "Downloads Queued",
              description: `${result.tracksQueued} track${result.tracksQueued === 1 ? "" : "s"} queued for download`,
              type: "success",
            },
      );
    } catch (error) {
      toaster.create({
        title: "Download Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    } finally {
      setIsDownloading(false);
    }
  };
  const viewRaw = async () => {
    setRawData(null);
    setRawError(null);
    setRawLoading(true);
    // The phone action also closes its parent dialog; open the viewer after
    // that close commits so the modal library doesn't discard the new dialog.
    window.setTimeout(() => setRawOpen(true), 0);
    try {
      setRawData(await fetchAlbumDiscogsRawRelease(album.release_id, album.friend_id));
    } catch (error) {
      setRawError(error instanceof Error ? error.message : "No Discogs raw file found");
    } finally {
      setRawLoading(false);
    }
  };
  const hasPlayable = (loadedTracks ?? (tracksLoaded ? (providedTracks ?? []) : [])).some(
    (track) => !!track.local_audio_url,
  );
  const menuProps: AlbumActionsMenuProps = {
    albumTitle: album.title,
    albumArtist: album.artist,
    coverUrl,
    catalogue,
    subtitle,
    prominent,
    onOpen: loadTracks,
    onPlayAlbum: hasPlayable ? play : undefined,
    onAddToQueue: hasPlayable ? queue : undefined,
    isLoadingTracks: loadingTracks,
    onDownloadMissing: tracks.length ? download : undefined,
    isDownloading,
    onEnrichAlbum: tracks.length ? enrich : undefined,
    onLogCare: () => setLogCareOpen(true),
    onChangeArtwork: () => setArtworkOpen(true),
    discogsUrl: album.discogs_url,
    onViewRawDiscogs: () => void viewRaw(),
    editAlbumHref,
    onDeleteAlbum: () => setDeleteOpen(true),
  };
  const menu = <AlbumActionsMenu {...menuProps} />;
  const dialogs = (
    <>
      {logCareOpen && (
        <RecordActionDialog
          open
          onOpenChange={setLogCareOpen}
          releaseId={album.release_id}
          friendId={album.friend_id}
          albumTitle={album.title}
        />
      )}
      {artworkOpen && (
        <AlbumArtworkDialog
          open
          onOpenChange={setArtworkOpen}
          releaseId={album.release_id}
          friendId={album.friend_id}
          albumTitle={album.title}
        />
      )}
      {deleteOpen && (
        <DeleteAlbumDialog
          open
          releaseId={album.release_id}
          friendId={album.friend_id}
          albumTitle={album.title}
          onClose={() => setDeleteOpen(false)}
          onDeleted={onDeleted ?? (() => router.push("/albums"))}
          notify={(opts) =>
            toaster.create({ title: opts.title, type: opts.type as "success" | "error" })
          }
        />
      )}
      {rawOpen && (
        <RetroDialog open onOpenChange={setRawOpen} title="Discogs Raw Release File" maxW="980px">
          <Box p={4} minW={0}>
            {rawLoading ? (
              <Spinner size="sm" />
            ) : rawError ? (
              <Text color="fg.muted">{rawError}</Text>
            ) : rawData ? (
              <>
                <MetaTag variant="raw" mb={3}>
                  {rawData.file_path}
                </MetaTag>
                <Box
                  as="pre"
                  p={3}
                  borderRadius="md"
                  borderWidth="1px"
                  overflow="auto"
                  maxH="65vh"
                  fontSize="xs"
                  whiteSpace="pre-wrap"
                >
                  {JSON.stringify(rawData.data, null, 2)}
                </Box>
              </>
            ) : (
              <Text color="fg.muted">No Discogs raw file available.</Text>
            )}
            <Flex justify="flex-end" mt={4}>
              <Button minH="44px" variant="outline" onClick={() => setRawOpen(false)}>
                Close
              </Button>
            </Flex>
          </Box>
        </RetroDialog>
      )}
    </>
  );
  return {
    menu,
    menuProps,
    dialogs,
    tracks,
    tracksLoaded: !!loadedTracks || tracksLoaded,
    loadTracks,
  };
}

"use client";

import React, { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Box,
  Button,
  Flex,
  Spinner,
  Text,
  Badge,
  Dialog,
  Portal,
  CloseButton,
  useBreakpointValue,
} from "@chakra-ui/react";

import { useAlbumDetailQuery, useUpdateAlbumMutation } from "@/hooks/useAlbumsQuery";
import { useAlbum, useAlbumHydrated } from "@/hooks/useAlbum";
import { useTracksByRelease, useTracksByReleaseHydrated } from "@/hooks/useTrack";
import { ALBUM_SPINS_PAGE, useAlbumSpins } from "@/hooks/useAlbumSpins";
import { useAddToPlaylistDialog } from "@/hooks/useAddToPlaylistDialog";
import PageHeader from "@/components/layout/PageHeader";
import AlbumHeader from "@/components/album-detail/AlbumHeader";
import AlbumTracklist from "@/components/album-detail/AlbumTracklist";
import AlbumSpinPanel from "@/components/spins/AlbumSpinPanel";
import SpinFormDialog from "@/components/spins/SpinFormDialog";
import AlbumRecordCarePanel from "@/components/records/AlbumRecordCarePanel";
import RecordActionDialog from "@/components/records/RecordActionDialog";
import TrackActionsMenu from "@/components/TrackActionsMenu";
import AlbumActionsMenu from "@/components/AlbumActionsMenu";
import AlbumArtworkDialog from "@/components/AlbumArtworkDialog";
import DeleteAlbumDialog from "@/components/DeleteAlbumDialog";
import { usePlaybackPlayer } from "@/providers/PlaybackTargetProvider";
import { toaster } from "@/components/ui/toaster";
import PageContainer from "@/components/layout/PageContainer";
import { compareTrackPositions } from "@/lib/albumTrackPosition";
import { summarizeSides, summarizeSpinStats } from "@/lib/albumStats";
import { fetchAlbumDiscogsRawRelease, queueAlbumDownloads } from "@/services/internalApi/albums";
import { useEnrichmentStore } from "@/stores/enrichmentStore";

function AlbumDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const releaseId = params.releaseId as string;
  const friendId = parseInt(searchParams.get("friend_id") || "0");

  const { error } = useAlbumDetailQuery(releaseId, friendId);
  const albumFromStore = useAlbum(releaseId, friendId);
  const albumHydrated = useAlbumHydrated(releaseId, friendId);
  const tracksHydrated = useTracksByReleaseHydrated(releaseId, friendId);
  const tracksFromStore = useTracksByRelease(releaseId, friendId);
  const discogsRawQuery = useQuery({
    queryKey: ["album-discogs-raw", releaseId, friendId],
    queryFn: () => fetchAlbumDiscogsRawRelease(releaseId, friendId),
    enabled: !!releaseId && !!friendId,
  });
  const updateMutation = useUpdateAlbumMutation();
  const { replacePlaylist } = usePlaybackPlayer();
  const setEnrichmentQueue = useEnrichmentStore((s) => s.setQueue);

  const [rating, setRating] = React.useState(0);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [discogsRawModalOpen, setDiscogsRawModalOpen] = React.useState(false);
  const [logCareOpen, setLogCareOpen] = React.useState(false);
  const [artworkOpen, setArtworkOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const subtleText = "fg.muted";
  const isMobile = useBreakpointValue({ base: true, md: false }) ?? true;
  const [logSpinOpen, setLogSpinOpen] = React.useState(false);
  const { openForTracks, playlistDialog, nameDialog } = useAddToPlaylistDialog();
  const spinsQuery = useAlbumSpins(releaseId, friendId);
  const album = albumFromStore;
  const tracks = React.useMemo(() => {
    return [...tracksFromStore].sort((a, b) => compareTrackPositions(a.position, b.position));
  }, [tracksFromStore]);
  const sides = React.useMemo(() => summarizeSides(tracks), [tracks]);
  const spinStats = React.useMemo(
    () => (spinsQuery.data ? summarizeSpinStats(spinsQuery.spins, ALBUM_SPINS_PAGE) : null),
    [spinsQuery.data, spinsQuery.spins],
  );

  React.useEffect(() => {
    if (album) {
      setRating(album.album_rating || 0);
    }
  }, [album]);

  const handleRate = (value: number) => {
    if (!album) return;
    setRating(value);
    updateMutation.mutate({
      release_id: album.release_id,
      friend_id: album.friend_id,
      album_rating: value,
    });
  };

  const handleEnqueueAlbum = () => {
    if (tracks.length === 0 || !album) {
      toaster.create({
        title: "No Tracks",
        description: "This album has no tracks to play",
        type: "warning",
      });
      return;
    }

    replacePlaylist(tracks, {
      autoplay: true,
      startIndex: 0,
    });

    toaster.create({
      title: "Album Enqueued",
      description: `Playing ${album.title} by ${album.artist}`,
      type: "success",
    });
  };

  const handleEnrichAlbum = () => {
    if (tracks.length === 0) {
      toaster.create({
        title: "No tracks to enrich",
        description: "This album has no tracks.",
        type: "info",
      });
      return;
    }
    setEnrichmentQueue(
      tracks.map((track) => ({
        trackId: track.track_id,
        friendId: track.friend_id,
      })),
    );
    router.push("/enrich");
  };

  const handleDownloadAlbum = async () => {
    if (!album) return;

    setIsDownloading(true);
    try {
      const result = await queueAlbumDownloads(releaseId, friendId);

      if (result.tracksQueued === 0) {
        toaster.create({
          title: "No Downloads Needed",
          description: "All tracks already have audio files or no URLs available",
          type: "info",
        });
      } else {
        toaster.create({
          title: "Downloads Queued",
          description: `${result.tracksQueued} track${result.tracksQueued === 1 ? "" : "s"} queued for download`,
          type: "success",
        });
      }
    } catch (error) {
      console.error("Error downloading album:", error);
      toaster.create({
        title: "Download Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  if (!friendId) {
    return (
      <PageContainer size="standard" py={8}>
        <Text color="fg.error">Error: friend_id parameter is required</Text>
      </PageContainer>
    );
  }

  if ((!albumHydrated || !tracksHydrated) && !error) {
    return (
      <PageContainer size="standard" py={8}>
        <Flex justify="center" align="center" minH="400px">
          <Spinner size="xl" />
        </Flex>
      </PageContainer>
    );
  }

  if (error || !album) {
    return (
      <PageContainer size="standard" py={8}>
        <Text color="fg.error">
          Error loading album: {error instanceof Error ? error.message : "Unknown error"}
        </Text>
      </PageContainer>
    );
  }

  const albumArtwork =
    album.audio_file_album_art_url ||
    tracks.find((t) => t.audio_file_album_art_url)?.audio_file_album_art_url ||
    album.album_thumbnail;

  const menu = (
    <AlbumActionsMenu
      prominent={isMobile}
      albumTitle={album.title}
      albumArtist={album.artist}
      coverUrl={albumArtwork ?? undefined}
      catalogue={["Album", album.library_identifier].filter(Boolean).join(" · ")}
      subtitle={[album.artist, album.label, album.year && album.year !== "0" ? album.year : null]
        .filter(Boolean)
        .join(" · ")}
      onPlayAlbum={tracks.length > 0 ? handleEnqueueAlbum : undefined}
      onDownloadMissing={tracks.length > 0 ? handleDownloadAlbum : undefined}
      isDownloading={isDownloading}
      onEnrichAlbum={tracks.length > 0 ? handleEnrichAlbum : undefined}
      onLogCare={() => setLogCareOpen(true)}
      onChangeArtwork={() => setArtworkOpen(true)}
      discogsUrl={album.discogs_url}
      onViewRawDiscogs={() => setDiscogsRawModalOpen(true)}
      editAlbumHref={`/albums/${releaseId}/edit?friend_id=${friendId}`}
      onDeleteAlbum={() => setDeleteOpen(true)}
    />
  );

  return (
    <PageContainer size="standard" mb="100px">
      <PageHeader
        title={album.title}
        // Phones go back to the list; the artist crumb is for the desktop trail.
        breadcrumbs={[
          { label: "Albums", href: "/albums" },
          ...(isMobile
            ? []
            : [{ label: album.artist, href: `/albums?q=${encodeURIComponent(album.artist)}` }]),
          { label: album.title },
        ]}
        trailing={isMobile ? menu : undefined}
      />

      <Box mb={{ base: 8, md: 10 }} pr="6px" pb="6px">
        <AlbumHeader
          album={album}
          tracks={tracks}
          sides={sides}
          spins={spinStats}
          artworkSrc={albumArtwork}
          rating={rating}
          onRate={handleRate}
          onPlay={handleEnqueueAlbum}
          onAddToPlaylist={() => openForTracks(tracks, album.title)}
          onLogSpin={() => setLogSpinOpen(true)}
          onChangeArtwork={() => setArtworkOpen(true)}
          menu={isMobile ? undefined : menu}
          isMobile={isMobile}
        />
      </Box>

      <Box mb={{ base: 8, md: 10 }} pr="6px" pb="6px">
        <AlbumTracklist
          sides={sides}
          albumArtist={album.artist}
          isMobile={isMobile}
          onPlayTrack={(track) => replacePlaylist([track], { autoplay: true, startIndex: 0 })}
          onPlaySide={(side) => replacePlaylist(side.tracks, { autoplay: true, startIndex: 0 })}
          renderActions={(track) => <TrackActionsMenu track={track} />}
        />
      </Box>

      <Box
        display="grid"
        gap={{ base: 8, md: 8 }}
        pr="6px"
        pb="6px"
        css={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 480px), 1fr))" }}
      >
        <AlbumSpinPanel releaseId={releaseId} friendId={friendId} albumTitle={album.title} />
        <AlbumRecordCarePanel releaseId={releaseId} friendId={friendId} albumTitle={album.title} />
      </Box>

      <SpinFormDialog
        open={logSpinOpen}
        onOpenChange={setLogSpinOpen}
        releaseId={releaseId}
        friendId={friendId}
        albumTitle={album.title}
      />
      {playlistDialog}
      {nameDialog}
      <RecordActionDialog
        open={logCareOpen}
        onOpenChange={setLogCareOpen}
        releaseId={releaseId}
        friendId={friendId}
        albumTitle={album.title}
      />
      <AlbumArtworkDialog
        open={artworkOpen}
        onOpenChange={setArtworkOpen}
        releaseId={releaseId}
        friendId={friendId}
        albumTitle={album.title}
      />
      <DeleteAlbumDialog
        open={deleteOpen}
        releaseId={releaseId}
        friendId={friendId}
        albumTitle={album.title}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => router.push("/albums")}
        notify={(opts) =>
          toaster.create({ title: opts.title, type: opts.type as "success" | "error" })
        }
      />

      <Dialog.Root
        open={discogsRawModalOpen}
        onOpenChange={(details) => setDiscogsRawModalOpen(details.open)}
        size="xl"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content maxW="980px" maxH="90vh">
              <Dialog.Header>
                <Dialog.Title>Discogs Raw Release File</Dialog.Title>
                <Dialog.CloseTrigger asChild>
                  <CloseButton size="sm" />
                </Dialog.CloseTrigger>
              </Dialog.Header>
              <Dialog.Body overflowY="auto" pb={6}>
                {discogsRawQuery.isLoading ? (
                  <Spinner size="sm" />
                ) : discogsRawQuery.error ? (
                  <Text color={subtleText}>
                    {discogsRawQuery.error instanceof Error
                      ? discogsRawQuery.error.message
                      : "No Discogs raw file found"}
                  </Text>
                ) : discogsRawQuery.data ? (
                  <Box>
                    <Badge variant="outline" mb={3}>
                      {discogsRawQuery.data.file_path}
                    </Badge>
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
                      {JSON.stringify(discogsRawQuery.data.data, null, 2)}
                    </Box>
                  </Box>
                ) : (
                  <Text color={subtleText}>No Discogs raw file available.</Text>
                )}
              </Dialog.Body>
              <Dialog.Footer>
                <Button variant="outline" onClick={() => setDiscogsRawModalOpen(false)}>
                  Close
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </PageContainer>
  );
}

export default function AlbumDetailPage() {
  return (
    <Suspense
      fallback={
        <PageContainer size="standard" py={8}>
          <Flex justify="center" align="center" minH="400px">
            <Spinner size="xl" />
          </Flex>
        </PageContainer>
      }
    >
      <AlbumDetailContent />
    </Suspense>
  );
}

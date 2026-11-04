"use client";

import React, { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Box, Flex, Spinner, Text, useBreakpointValue } from "@chakra-ui/react";

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
import TrackActionsMenu from "@/components/TrackActionsMenu";
import { usePlaybackPlayer } from "@/providers/PlaybackTargetProvider";
import PageContainer from "@/components/layout/PageContainer";
import { compareTrackPositions } from "@/lib/albumTrackPosition";
import { summarizeSides, summarizeSpinStats } from "@/lib/albumStats";
import { useAlbumActions } from "@/hooks/useAlbumActions";
import type { Album } from "@/types/track";

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
  const updateMutation = useUpdateAlbumMutation();
  const { replacePlaylist } = usePlaybackPlayer();

  const [rating, setRating] = React.useState(0);

  const isMobile = useBreakpointValue({ base: true, md: false }) ?? true;
  const [logSpinOpen, setLogSpinOpen] = React.useState(false);
  const { openForTracks, playlistDialog, nameDialog } = useAddToPlaylistDialog();
  const spinsQuery = useAlbumSpins(releaseId, friendId);
  const album = React.useMemo(
    () =>
      albumFromStore ??
      ({
        release_id: releaseId,
        friend_id: friendId,
        title: "",
        artist: "",
        track_count: 0,
      } as Album),
    [albumFromStore, friendId, releaseId],
  );
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
    setRating(value);
    updateMutation.mutate({
      release_id: album.release_id,
      friend_id: album.friend_id,
      album_rating: value,
    });
  };

  const albumArtwork =
    album.audio_file_album_art_url ||
    tracks.find((t) => t.audio_file_album_art_url)?.audio_file_album_art_url ||
    album.album_thumbnail;

  const albumActions = useAlbumActions({
    album,
    tracks,
    tracksLoaded: true,
    prominent: isMobile,
    coverUrl: albumArtwork ?? undefined,
    catalogue: ["Album", album.library_identifier].filter(Boolean).join(" · "),
    subtitle: [album.artist, album.label, album.year && album.year !== "0" ? album.year : null]
      .filter(Boolean)
      .join(" · "),
    editAlbumHref: `/albums/${releaseId}/edit?friend_id=${friendId}`,
    onDeleted: () => router.push("/albums"),
  });
  const menu = albumActions.menu;

  if (!friendId) {
    return (
      <PageContainer py={8}>
        <Text color="fg.error">Error: friend_id parameter is required</Text>
      </PageContainer>
    );
  }

  if ((!albumHydrated || !tracksHydrated) && !error) {
    return (
      <PageContainer py={8}>
        <Flex justify="center" align="center" minH="400px">
          <Spinner size="xl" />
        </Flex>
      </PageContainer>
    );
  }

  if (error || !albumFromStore) {
    return (
      <PageContainer py={8}>
        <Text color="fg.error">
          Error loading album: {error instanceof Error ? error.message : "Unknown error"}
        </Text>
      </PageContainer>
    );
  }

  return (
    <PageContainer mb="100px">
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
          onPlay={albumActions.menuProps.onPlayAlbum}
          onAddToPlaylist={() => openForTracks(tracks, album.title)}
          onLogSpin={() => setLogSpinOpen(true)}
          onChangeArtwork={() => albumActions.menuProps.onChangeArtwork?.()}
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
      {albumActions.dialogs}
    </PageContainer>
  );
}

export default function AlbumDetailPage() {
  return (
    <Suspense
      fallback={
        <PageContainer py={8}>
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

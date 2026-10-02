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
  Image,
  Badge,
  Link,
  Heading,
  RatingGroup,
  Dialog,
  Popover,
  Portal,
  CloseButton,
} from "@chakra-ui/react";
import { FiFileText } from "react-icons/fi";
import NextLink from "next/link";

import { useAlbumDetailQuery, useUpdateAlbumMutation } from "@/hooks/useAlbumsQuery";
import { useAlbum, useAlbumHydrated } from "@/hooks/useAlbum";
import { useTracksByRelease, useTracksByReleaseHydrated } from "@/hooks/useTrack";
import AlbumTrackItem from "@/components/AlbumTrackItem";
import AlbumSpinPanel from "@/components/spins/AlbumSpinPanel";
import AlbumRecordCarePanel from "@/components/records/AlbumRecordCarePanel";
import RecordActionDialog from "@/components/records/RecordActionDialog";
import TrackActionsMenu from "@/components/TrackActionsMenu";
import AlbumActionsMenu from "@/components/AlbumActionsMenu";
import { usePlaylistPlayer } from "@/providers/PlaylistPlayerProvider";
import { toaster } from "@/components/ui/toaster";
import { useColorModeValue } from "@/components/ui/color-mode";
import PageContainer from "@/components/layout/PageContainer";
import {
  compareTrackPositions,
  normalizeAlbumTrackSides,
} from "@/lib/albumTrackPosition";
import {
  formatSeconds,
  getTrackDurationSeconds,
} from "@/lib/trackUtils";
import {
  fetchAlbumDiscogsRawRelease,
  queueAlbumDownloads,
} from "@/services/internalApi/albums";
import { fetchPlaylistCounts } from "@/services/internalApi/tracks";
import { queryKeys } from "@/lib/queryKeys";
import { useEnrichmentStore } from "@/stores/enrichmentStore";

function formatDate(dateString?: string): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString();
}

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
  const { replacePlaylist } = usePlaylistPlayer();
  const setEnrichmentQueue = useEnrichmentStore((s) => s.setQueue);

  const [rating, setRating] = React.useState(0);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [discogsRawModalOpen, setDiscogsRawModalOpen] = React.useState(false);
  const [logCareOpen, setLogCareOpen] = React.useState(false);

  const mutedText = useColorModeValue("gray.600", "gray.400");
  const subtleText = useColorModeValue("gray.500", "gray.500");
  const sideHeaderBg = useColorModeValue("gray.100", "gray.800");
  const sideHeaderAccent = useColorModeValue("gray.400", "gray.600");
  const album = albumFromStore;
  const tracks = React.useMemo(() => {
    return [...tracksFromStore].sort((a, b) =>
      compareTrackPositions(a.position, b.position)
    );
  }, [tracksFromStore]);
  const trackRefs = React.useMemo(
    () =>
      tracks.map((track) => ({
        track_id: track.track_id,
        friend_id: track.friend_id,
      })),
    [tracks]
  );
  const playlistCountsQuery = useQuery({
    queryKey: queryKeys.playlistCounts(
      trackRefs.map((track) => `${track.track_id}:${track.friend_id}`)
    ),
    queryFn: () => fetchPlaylistCounts(trackRefs),
    enabled: trackRefs.length > 0,
    staleTime: 30_000,
  });
  const trackSections = React.useMemo(() => {
    return normalizeAlbumTrackSides(tracks).map((group) => ({
      label: group.side_label,
      tracks: group.tracks,
    }));
  }, [tracks]);
  const hasSideSections = trackSections.some((section) =>
    section.label.startsWith("Side ") || section.label.startsWith("Disc ")
  );
  const albumDurationSeconds = React.useMemo(() => {
    return tracks.reduce((total, track) => {
      return total + (getTrackDurationSeconds(track) ?? 0);
    }, 0);
  }, [tracks]);

  React.useEffect(() => {
    if (album) {
      setRating(album.album_rating || 0);
    }
  }, [album]);

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
      }))
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
        <Text color="red.500">Error: friend_id parameter is required</Text>
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
        <Text color="red.500">
          Error loading album: {error instanceof Error ? error.message : "Unknown error"}
        </Text>
      </PageContainer>
    );
  }

  const albumArtwork =
    tracks.find((t) => t.audio_file_album_art_url)?.audio_file_album_art_url ||
    album.album_thumbnail;

  return (
    <PageContainer size="standard" mb="100px">

      {/* Album header */}
      <Flex
        borderWidth="1px"
        borderRadius="md"
        p={3}
        mb={{ base: 4, md: 6 }}
        gap={3}
        position="relative"
        width="100%"
        direction={{ base: "row", md: "row" }}
      >
        {albumArtwork && (
          <Box
            flexShrink={0}
            width={{ base: "90px", md: "130px" }}
            height={{ base: "90px", md: "130px" }}
          >
            <Image
              src={albumArtwork}
              alt={album.title}
              width="100%"
              height="100%"
              objectFit="cover"
              borderRadius="md"
            />
          </Box>
        )}

        <Flex flex="1" direction="column" gap={1.5} minW={0} pr={{ base: 9, md: 10 }}>
          <Box>
            <Flex alignItems="center" gap={2} flexWrap="wrap">
              {album.library_identifier && (
                <Badge colorPalette="blue" size={{ base: "sm", md: "md" }} variant="solid" fontWeight="bold">
                  {album.library_identifier}
                </Badge>
              )}
              <Heading
                size={{ base: "md", md: "lg" }}
                lineClamp={{ base: 2, md: 3 }}
                lineHeight={{ base: "1.3", md: "1.4" }}
              >
                {album.title}
              </Heading>
            </Flex>
            <Link
              asChild
              _hover={{ textDecoration: "underline" }}
            >
              <NextLink href={`/albums?q=${encodeURIComponent(album.artist)}`}>
                <Text fontSize={{ base: "xs", md: "sm" }} color={mutedText} fontWeight="medium">
                  {album.artist}
                </Text>
              </NextLink>
            </Link>
          </Box>

          <Flex alignItems="center" gap={2}>
            <RatingGroup.Root
              value={rating}
              onValueChange={(details) => {
                setRating(details.value);
                updateMutation.mutate({
                  release_id: album.release_id,
                  friend_id: album.friend_id,
                  album_rating: details.value,
                });
              }}
              count={5}
              size="xs"
            >
              {[1, 2, 3, 4, 5].map((index) => (
                <RatingGroup.Item key={index} index={index}>
                  <RatingGroup.ItemIndicator />
                </RatingGroup.Item>
              ))}
            </RatingGroup.Root>
            <Text fontSize="xs" color={subtleText}>
              ({rating}/5)
            </Text>
          </Flex>

          <Flex gap={2} flexWrap="wrap" fontSize="xs" color={mutedText}>
            {album.year && <Text fontWeight="semibold">{album.year}</Text>}
            {album.format && <Text>{album.format}</Text>}
            {album.label && <Text display={{ base: "none", md: "block" }}>{album.label}</Text>}
            {album.catalog_number && <Text display={{ base: "none", md: "block" }}>Cat: {album.catalog_number}</Text>}
            {album.country && <Text display={{ base: "none", md: "block" }}>{album.country}</Text>}
          </Flex>

          {(album.genres || album.styles) && (
            <Flex gap={1} flexWrap="wrap" display={{ base: "none", md: "flex" }}>
              {album.genres?.map((genre) => (
                <Badge key={genre} colorScheme="blue" size="sm">
                  {genre}
                </Badge>
              ))}
              {album.styles?.map((style) => (
                <Badge key={style} colorScheme="purple" size="sm">
                  {style}
                </Badge>
              ))}
            </Flex>
          )}

          <Flex gap={2} fontSize="xs" color={subtleText} flexWrap="wrap" alignItems="center">
            {album.track_count && <Text>{album.track_count} tracks</Text>}
            {albumDurationSeconds > 0 && <Text>{formatSeconds(albumDurationSeconds)}</Text>}
            {album.date_added && <Text display={{ base: "none", md: "block" }}>Added: {formatDate(album.date_added)}</Text>}
            {(album.album_notes || album.purchase_price || album.condition) && (
              <Popover.Root>
                <Popover.Trigger asChild>
                  <Box
                    as="button"
                    display="inline-flex"
                    alignItems="center"
                    color="yellow.500"
                    _hover={{ color: "yellow.400" }}
                  >
                    <FiFileText size={13} />
                  </Box>
                </Popover.Trigger>
                <Popover.Positioner>
                  <Popover.Content maxW="280px">
                    <Popover.Body>
                      {album.album_notes && (
                        <Text fontSize="sm" whiteSpace="pre-wrap" mb={(album.purchase_price || album.condition) ? 2 : 0}>
                          {album.album_notes}
                        </Text>
                      )}
                      {(album.purchase_price || album.condition) && (
                        <Flex gap={3} fontSize="xs" color={mutedText}>
                          {album.purchase_price && <Text>Price: ${album.purchase_price}</Text>}
                          {album.condition && <Text>{album.condition}</Text>}
                        </Flex>
                      )}
                    </Popover.Body>
                  </Popover.Content>
                </Popover.Positioner>
              </Popover.Root>
            )}
          </Flex>
        </Flex>

        <Flex position="absolute" top={2} right={2} gap={1} alignItems="center">
          <AlbumActionsMenu
            albumTitle={album.title}
            albumArtist={album.artist}
            onPlayAlbum={tracks.length > 0 ? handleEnqueueAlbum : undefined}
            onDownloadMissing={tracks.length > 0 ? handleDownloadAlbum : undefined}
            isDownloading={isDownloading}
            onEnrichAlbum={tracks.length > 0 ? handleEnrichAlbum : undefined}
            onLogCare={() => setLogCareOpen(true)}
            discogsUrl={album.discogs_url}
            onViewRawDiscogs={() => setDiscogsRawModalOpen(true)}
            editAlbumHref={`/albums/${releaseId}/edit?friend_id=${friendId}`}
          />
        </Flex>
      </Flex>

      <Box mb={{ base: 4, md: 6 }}>
        <AlbumSpinPanel
          releaseId={releaseId}
          friendId={friendId}
          albumTitle={album.title}
        />
      </Box>

      <Box mb={{ base: 4, md: 6 }}>
        <AlbumRecordCarePanel releaseId={releaseId} friendId={friendId} albumTitle={album.title} />
      </Box>
      <RecordActionDialog
        open={logCareOpen}
        onOpenChange={setLogCareOpen}
        releaseId={releaseId}
        friendId={friendId}
        albumTitle={album.title}
      />

      {/* Track list */}
      <Box>

        {tracks.length === 0 ? (
          <Text color={subtleText}>No tracks found for this album.</Text>
        ) : (
          <Flex direction="column" gap={{ base: 4, md: 6 }}>
            {trackSections.map((section) => (
              <Box key={section.label}>
                {(hasSideSections || section.label !== "Tracklist") && (
                  <Flex
                    alignItems="center"
                    gap={3}
                    mb={{ base: 2, md: 3 }}
                    px={3}
                    py={2}
                    bg={sideHeaderBg}
                    borderRadius="md"
                    borderLeftWidth="3px"
                    borderLeftColor={sideHeaderAccent}
                  >
                    <Heading size={{ base: "sm", md: "md" }} letterSpacing="wide">
                      {section.label}
                    </Heading>
                    <Box flex="1" />
                    <Text fontSize="xs" color={subtleText} whiteSpace="nowrap" fontWeight="medium">
                      {section.tracks.length}{" "}
                      {section.tracks.length === 1 ? "track" : "tracks"}
                    </Text>
                  </Flex>
                )}
                <Flex
                  direction="column"
                  borderWidth="1px"
                  borderRadius="md"
                  overflow="hidden"
                >
                  {section.tracks.map((track, idx) => (
                    <AlbumTrackItem
                      key={`${track.track_id}:${track.friend_id}:${idx}`}
                      track={track}
                      albumArtist={album.artist}
                      playlistCount={
                        playlistCountsQuery.data?.[
                          `${track.track_id}:${track.friend_id}`
                        ] ?? 0
                      }
                      buttons={
                        <TrackActionsMenu
                          key={`${track.track_id}:${track.friend_id}:${idx}:actions`}
                          track={track}
                        />
                      }
                    />
                  ))}
                </Flex>
              </Box>
            ))}
          </Flex>
        )}
      </Box>

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

"use client";

import { FiPlay } from "react-icons/fi";
import { usePlaybackPlayer } from "@/providers/PlaybackTargetProvider";
import { reprobeTrackAudio } from "@/services/internalApi/tracks";
import { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Box, Skeleton, Text, VStack, useBreakpointValue } from "@chakra-ui/react";
import TrackActionsMenu from "@/components/TrackActionsMenu";
import { useTrack } from "@/hooks/useTrack";
import { toaster } from "@/components/ui/toaster";
import { useUsername } from "@/providers/UsernameProvider";
import { useTrackStore } from "@/stores/trackStore";
import { useAlbumStore } from "@/stores/albumStore";
import AlbumArtworkDialog from "@/components/AlbumArtworkDialog";
import RelatedTracksSection from "@/components/RelatedTracksSection";
import PageContainer from "@/components/layout/PageContainer";
import PageHeader from "@/components/layout/PageHeader";
import type { Crumb } from "@/components/layout/Breadcrumbs";
import { useTrackDetailQueries } from "@/hooks/useTrackDetailQueries";
import {
  TrackPlaylistsSection,
  TrackHeader,
  TrackDebugModal,
  TrackLyricsDialog,
} from "@/components/track-detail";
import { useTrackLyrics } from "@/hooks/useTrackLyrics";

export default function TrackPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const trackId = params?.id ?? "";
  const friendIdRaw = searchParams?.get("friend_id") ?? "";
  const friendId = Number(friendIdRaw);
  const hasValidFriendId = Number.isFinite(friendId) && friendId > 0;
  // Attribution is only useful when this track isn't in the library already being browsed.
  const { friend: currentUserFriend } = useUsername();
  const showUsername = friendId !== currentUserFriend?.id;
  const [debugOpen, setDebugOpen] = useState(false);
  const [fileInfoOpen, setFileInfoOpen] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  // The lyrics endpoint answers `not_owner` for a friend's track (#1176), so the
  // menu offers Lyrics only once it knows this is the owner's library.
  const lyricsState = useTrackLyrics(trackId, friendId, { enabled: hasValidFriendId }).query.data;
  const canEditLyrics = lyricsState !== undefined && lyricsState.kind !== "not_owner";
  const { replacePlaylist } = usePlaybackPlayer();
  const [artworkOpen, setArtworkOpen] = useState(false);
  const isMobile = useBreakpointValue({ base: true, md: false }) ?? true;

  const {
    trackQuery,
    playlistsQuery,
    audioMetadataQuery,
    essentiaQuery,
    identityEmbeddingPreviewQuery,
    contextEmbeddingPreviewQuery,
    audioVibeEmbeddingPreviewQuery,
    extractCoverMutation,
  } = useTrackDetailQueries(trackId, friendId, hasValidFriendId, debugOpen);

  const fetchedTrack = trackQuery.data;
  const track = useTrack(trackId, friendId) ?? fetchedTrack;
  // The trail ends at the album, its link back (#1231): the h1 is the one place
  // the title shows, and the card below holds the ID, duration, BPM and key, so
  // the title carries no meta line either.
  const crumbs: Crumb[] | undefined = track
    ? [
        { label: "Tracks", href: "/tracks" },
        ...(track.release_id && track.album
          ? [{ label: track.album, href: `/albums/${track.release_id}?friend_id=${friendId}` }]
          : []),
      ]
    : undefined;

  const trackMenu = (prominent: boolean) =>
    track && (
      <TrackActionsMenu
        track={track}
        paletteScope
        prominent={prominent}
        onOpenTrackDebug={() => setDebugOpen(true)}
        onOpenFileInfo={() => setFileInfoOpen(true)}
        onOpenLyrics={canEditLyrics ? () => setLyricsOpen(true) : undefined}
        hasLyrics={lyricsState?.kind === "lyrics"}
        onChangeArtwork={track.release_id ? () => setArtworkOpen(true) : undefined}
      />
    );

  return (
    <PageContainer>
      {hasValidFriendId && crumbs && track && (
        <PageHeader>
          <PageHeader.Context crumbs={crumbs} />
          <PageHeader.Title phoneTitle="Track">{track.title}</PageHeader.Title>
          {/* The menu sits in the header at both widths, not in the card. */}
          <PageHeader.Actions
            actions={[
              {
                label: "Play",
                icon: <FiPlay />,
                primary: true,
                phone: "icon",
                disabled: !track.local_audio_url,
                title: track.local_audio_url ? undefined : "No audio file for this track",
                onClick: () => replacePlaylist([track], { autoplay: true, startIndex: 0 }),
              },
            ]}
            phone={isMobile ? trackMenu(true) : undefined}
            desktop={isMobile ? undefined : trackMenu(false)}
          />
        </PageHeader>
      )}
      {!hasValidFriendId && (
        <Box borderWidth="outline" borderColor="border.ink" boxShadow="sm" p={4} borderRadius="md">
          <Text fontWeight="medium" mb={2}>
            Missing `friend_id`
          </Text>
          <Text color="fg.muted">Open this page with a `friend_id` query param, for example:</Text>
          <Text fontFamily="mono" mt={2}>
            /tracks/{trackId || "{track_id}"}?friend_id=1
          </Text>
        </Box>
      )}

      {hasValidFriendId && (
        <>
          {trackQuery.isLoading ? (
            <VStack align="stretch" gap={3}>
              <Skeleton height="28px" />
              <Skeleton height="120px" />
            </VStack>
          ) : trackQuery.error ? (
            <Box
              borderWidth="outline"
              borderColor="border.ink"
              boxShadow="sm"
              p={4}
              borderRadius="md"
            >
              <Text color="fg.error" fontWeight="medium">
                Failed to load track
              </Text>
              <Text mt={1}>{trackQuery.error.message}</Text>
            </Box>
          ) : trackQuery.data ? (
            <>
              <TrackHeader
                trackId={trackId}
                friendId={friendId}
                fallbackTrack={trackQuery.data}
                showUsername={showUsername}
                fileInfoOpen={fileInfoOpen}
                onFileInfoOpenChange={setFileInfoOpen}
                onReprobe={async () => {
                  const updated = await reprobeTrackAudio(trackQuery.data);
                  useTrackStore.getState().setTrack(updated);
                }}
              />

              <TrackPlaylistsSection query={playlistsQuery} />

              {canEditLyrics && (
                <TrackLyricsDialog
                  trackId={trackId}
                  friendId={friendId}
                  open={lyricsOpen}
                  onOpenChange={setLyricsOpen}
                />
              )}

              <RelatedTracksSection track={trackQuery.data} />

              {trackQuery.data.release_id && (
                <AlbumArtworkDialog
                  open={artworkOpen}
                  onOpenChange={setArtworkOpen}
                  releaseId={trackQuery.data.release_id}
                  friendId={friendId}
                  albumTitle={trackQuery.data.album}
                />
              )}

              <TrackDebugModal
                open={debugOpen}
                onOpenChange={setDebugOpen}
                audioMetadataQuery={audioMetadataQuery}
                essentiaQuery={essentiaQuery}
                identityEmbeddingPreviewQuery={identityEmbeddingPreviewQuery}
                contextEmbeddingPreviewQuery={contextEmbeddingPreviewQuery}
                audioVibeEmbeddingPreviewQuery={audioVibeEmbeddingPreviewQuery}
                trackAudioCoverUrl={trackQuery.data.audio_file_album_art_url}
                extractCoverMutation={extractCoverMutation}
                onExtractCover={async () => {
                  try {
                    const savedUrl = await extractCoverMutation.mutateAsync();
                    const releaseId = trackQuery.data?.release_id;
                    if (savedUrl) {
                      // Always update the current track in store to avoid stale UI when no release_id exists.
                      useTrackStore.getState().updateTrack(trackId, friendId, {
                        audio_file_album_art_url: savedUrl,
                      });

                      if (releaseId) {
                        useTrackStore.getState().updateTracksByRelease(releaseId, friendId, {
                          audio_file_album_art_url: savedUrl,
                        });
                        useAlbumStore.getState().updateAlbum(releaseId, friendId, {
                          audio_file_album_art_url: savedUrl,
                        });
                      }
                    }
                    toaster.create({
                      title: "Album cover updated",
                      description: savedUrl || "Saved to album",
                      type: "success",
                    });
                    await Promise.all([trackQuery.refetch(), audioMetadataQuery.refetch()]);
                  } catch (err) {
                    toaster.create({
                      title: "Album cover update failed",
                      description: err instanceof Error ? err.message : String(err),
                      type: "error",
                    });
                  }
                }}
              />
            </>
          ) : (
            <Text>Track not found.</Text>
          )}
        </>
      )}
    </PageContainer>
  );
}

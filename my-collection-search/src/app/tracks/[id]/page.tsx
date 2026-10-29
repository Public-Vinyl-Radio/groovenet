"use client";

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
import { TrackPlaylistsSection, TrackHeader, TrackDebugModal } from "@/components/track-detail";

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
  } = useTrackDetailQueries(trackId, friendId, hasValidFriendId);

  const fetchedTrack = trackQuery.data;
  const track = useTrack(trackId, friendId) ?? fetchedTrack;
  const crumbs: Crumb[] | undefined = track
    ? [
        { label: "Tracks", href: "/" },
        ...(track.release_id && track.album
          ? [{ label: track.album, href: `/albums/${track.release_id}?friend_id=${friendId}` }]
          : []),
        { label: track.title },
      ]
    : undefined;

  return (
    <PageContainer size="standard">
      {hasValidFriendId && crumbs && track && (
        <PageHeader
          title={track.title}
          breadcrumbs={crumbs}
          trailing={
            isMobile ? (
              <TrackActionsMenu
                track={track}
                prominent
                onOpenTrackDebug={() => setDebugOpen(true)}
                onChangeArtwork={track.release_id ? () => setArtworkOpen(true) : undefined}
              />
            ) : undefined
          }
        />
      )}
      {!hasValidFriendId && (
        <Box borderWidth="outline" borderColor="border.ink" boxShadow="sm" p={4}>
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
            <Box borderWidth="outline" borderColor="border.ink" boxShadow="sm" p={4}>
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
                menuInPageHeader={isMobile}
                onOpenTrackDebug={() => setDebugOpen(true)}
                onChangeArtwork={
                  trackQuery.data.release_id ? () => setArtworkOpen(true) : undefined
                }
              />

              <TrackPlaylistsSection query={playlistsQuery} />

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

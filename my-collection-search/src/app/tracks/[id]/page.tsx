"use client";

import { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Box, Skeleton, Text, VStack } from "@chakra-ui/react";
import { toaster } from "@/components/ui/toaster";
import { useTrackStore } from "@/stores/trackStore";
import { useAlbumStore } from "@/stores/albumStore";
import TrackResultStore from "@/components/TrackResultStore";
import TrackActionsMenu from "@/components/TrackActionsMenu";
import RelatedTracksSection from "@/components/RelatedTracksSection";
import PageContainer from "@/components/layout/PageContainer";
import { useTrackDetailQueries } from "@/hooks/useTrackDetailQueries";
import {
  TrackPlaylistsSection,
  TrackDebugModal,
} from "@/components/track-detail";

export default function TrackPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const trackId = params?.id ?? "";
  const friendIdRaw = searchParams?.get("friend_id") ?? "";
  const friendId = Number(friendIdRaw);
  const hasValidFriendId = Number.isFinite(friendId) && friendId > 0;
  const [debugOpen, setDebugOpen] = useState(false);

  const {
    trackQuery,
    playlistsQuery,
    audioMetadataQuery,
    essentiaQuery,
    identityEmbeddingPreviewQuery,
    audioVibeEmbeddingPreviewQuery,
    extractCoverMutation,
  } = useTrackDetailQueries(trackId, friendId, hasValidFriendId);

  return (
    <PageContainer size="standard">

      {!hasValidFriendId && (
        <Box borderWidth="1px" borderRadius="md" p={4}>
          <Text fontWeight="medium" mb={2}>
            Missing `friend_id`
          </Text>
          <Text color="fg.muted">
            Open this page with a `friend_id` query param, for example:
          </Text>
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
            <Box borderWidth="1px" borderRadius="md" p={4}>
              <Text color="red.500" fontWeight="medium">
                Failed to load track
              </Text>
              <Text mt={1}>{trackQuery.error.message}</Text>
            </Box>
          ) : trackQuery.data ? (
            <>
              <TrackResultStore
                trackId={trackId}
                friendId={friendId}
                fallbackTrack={trackQuery.data}
                playlistMode={true}
                buttons={[
                  <TrackActionsMenu
                    key="menu"
                    track={trackQuery.data}
                    onOpenTrackDebug={() => setDebugOpen(true)}
                  />,
                ]}
              />

              <RelatedTracksSection track={trackQuery.data} />

              <TrackPlaylistsSection query={playlistsQuery} />

              <TrackDebugModal
                open={debugOpen}
                onOpenChange={setDebugOpen}
                audioMetadataQuery={audioMetadataQuery}
                essentiaQuery={essentiaQuery}
                identityEmbeddingPreviewQuery={identityEmbeddingPreviewQuery}
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

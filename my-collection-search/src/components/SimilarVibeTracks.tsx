"use client";

import React from "react";
import { Box, Text, Spinner, Badge, Flex } from "@chakra-ui/react";
import { Track } from "@/types/track";
import TrackResult from "./TrackResult";
import TrackActionsMenu from "./TrackActionsMenu";
import { useSimilarVibeTracks } from "@/hooks/useSimilarVibeTracks";

interface SimilarVibeTracksProps {
  track: Track;
  limit?: number;
}

/**
 * Distance color coding helper
 */
function getDistanceColor(distance: number): string {
  if (distance < 0.2) return "status.success";
  if (distance < 0.4) return "accent";
  if (distance < 0.6) return "status.analysis";
  return "neutral";
}

/**
 * Distance label helper
 */
function getDistanceLabel(distance: number): string {
  if (distance < 0.2) return "Very Similar";
  if (distance < 0.4) return "Similar";
  if (distance < 0.6) return "Somewhat Similar";
  return "Distant";
}

export default function SimilarVibeTracks({ track, limit = 50 }: SimilarVibeTracksProps) {
  const { data, isLoading, error } = useSimilarVibeTracks({
    track_id: track.track_id,
    friend_id: track.friend_id,
    limit,
  });

  if (isLoading) {
    return (
      <Box textAlign="center" py={8}>
        <Spinner size="lg" />
        <Text mt={4}>Finding tracks with similar vibes...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={4} borderWidth={1} borderRadius="md" borderColor="border.error">
        <Text color="fg.error" fontWeight="bold">
          Error loading similar vibe tracks
        </Text>
        <Text fontSize="sm" mt={2}>
          {error instanceof Error ? error.message : String(error)}
        </Text>
        {String(error).includes("no audio vibe embedding") && (
          <Text fontSize="sm" mt={2} color="fg.muted">
            This track does not have an audio vibe embedding yet. Run the backfill command to
            generate embeddings.
          </Text>
        )}
      </Box>
    );
  }

  if (!data || data.count === 0) {
    return (
      <Box p={4} borderWidth={1} borderRadius="md">
        <Text>No similar vibe tracks found.</Text>
        <Text fontSize="sm" mt={2} color="fg.muted">
          Make sure this track has audio analysis data (BPM, key, mood, etc.)
        </Text>
      </Box>
    );
  }

  return (
    <Box>
      {/* Summary */}
      <Flex gap={2} mb={4} flexWrap="wrap">
        <Text fontSize="sm" color="fg.muted">
          Found {data.count} tracks with similar vibes
        </Text>
      </Flex>

      {/* Results */}
      <Box>
        {data.tracks.map((similarTrack) => {
          // Ensure track has valid artwork or use fallback
          const trackWithArtwork = {
            ...similarTrack,
            album_thumbnail:
              similarTrack.album_thumbnail || similarTrack.audio_file_album_art_url || undefined,
          };

          return (
            <Box key={`${similarTrack.track_id}-${similarTrack.friend_id}`} mb={2}>
              <TrackResult
                track={trackWithArtwork}
                showUsername={true}
                showRating={true}
                buttons={<TrackActionsMenu track={trackWithArtwork} />}
                footer={
                  <Flex gap={1} align="center" flexWrap="wrap">
                    <Badge
                      colorPalette={getDistanceColor(similarTrack.distance)}
                      size="sm"
                      title={`Distance: ${similarTrack.distance.toFixed(3)}`}
                    >
                      {getDistanceLabel(similarTrack.distance)}
                    </Badge>
                    {similarTrack.bpm && (
                      <Badge colorPalette="status.genre" size="sm" variant="subtle">
                        {Math.round(parseFloat(similarTrack.bpm))} BPM
                      </Badge>
                    )}
                    {similarTrack.key && (
                      <Badge colorPalette="accent" size="sm" variant="subtle">
                        {similarTrack.key}
                      </Badge>
                    )}
                  </Flex>
                }
              />
            </Box>
          );
        })}
      </Box>

      {/* Help text */}
      <Box mt={4} p={3} bg="bg.subtle" borderRadius="md">
        <Text fontSize="sm" fontWeight="bold" mb={1}>
          🎵 About Similar Vibe Tracks
        </Text>
        <Text fontSize="sm" color="fg.muted">
          Tracks are ranked by audio vibe similarity based on BPM, key, energy, mood, danceability,
          acoustic/electronic balance, vocal presence, and percussiveness. Lower distance = more
          similar sound and feel.
        </Text>
      </Box>
    </Box>
  );
}

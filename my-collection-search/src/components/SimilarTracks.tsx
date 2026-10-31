"use client";

import React from "react";
import { Box, Text, Spinner, Badge, Flex } from "@chakra-ui/react";
import { Track } from "@/types/track";
import TrackResult from "./TrackResult";
import TrackActionsMenu from "./TrackActionsMenu";
import { useSimilarTracks } from "@/hooks/useSimilarTracks";

interface SimilarTracksProps {
  track: Track;
  limit?: number;
  era?: string;
  country?: string;
  tags?: string[];
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

export default function SimilarTracks({
  track,
  limit = 50,
  era,
  country,
  tags,
}: SimilarTracksProps) {
  const { data, isLoading, error } = useSimilarTracks({
    track_id: track.track_id,
    friend_id: track.friend_id,
    limit,
    era,
    country,
    tags,
  });

  if (isLoading) {
    return (
      <Box textAlign="center" py={8}>
        <Spinner size="lg" />
        <Text mt={4}>Finding similar tracks...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={4} borderWidth={1} borderRadius="md" borderColor="border.error">
        <Text color="fg.error" fontWeight="bold">
          Error loading similar tracks
        </Text>
        <Text fontSize="sm" mt={2}>
          {error instanceof Error ? error.message : String(error)}
        </Text>
        {String(error).includes("no identity embedding") && (
          <Text fontSize="sm" mt={2} color="fg.muted">
            This track does not have an identity embedding yet. Run the backfill command to generate
            embeddings.
          </Text>
        )}
      </Box>
    );
  }

  if (!data || data.count === 0) {
    return (
      <Box p={4} borderWidth={1} borderRadius="md">
        <Text>No similar tracks found.</Text>
        {(era || country || tags) && (
          <Text fontSize="sm" mt={2} color="fg.muted">
            Try removing some filters to see more results.
          </Text>
        )}
      </Box>
    );
  }

  return (
    <Box>
      {/* Summary */}
      <Flex gap={2} mb={4} flexWrap="wrap">
        <Text fontSize="sm" color="fg.muted">
          Found {data.count} similar tracks
        </Text>
        {data.filters.era && (
          <Badge colorPalette="status.genre" size="sm">
            Era: {data.filters.era}
          </Badge>
        )}
        {data.filters.country && (
          <Badge colorPalette="accent" size="sm">
            Country: {data.filters.country}
          </Badge>
        )}
        {data.filters.tags && data.filters.tags.length > 0 && (
          <Badge colorPalette="status.success" size="sm">
            Tags: {data.filters.tags.join(", ")}
          </Badge>
        )}
      </Flex>

      {/* Results */}
      <Box>
        {data.tracks.map((similarTrack) => {
          return (
            <Box key={`${similarTrack.track_id}-${similarTrack.friend_id}`} mb={2}>
              <TrackResult
                track={similarTrack}
                showUsername={true}
                showRating={true}
                buttons={<TrackActionsMenu track={similarTrack} />}
                footer={
                  <Flex gap={1} align="center" flexWrap="wrap">
                    <Badge
                      colorPalette={getDistanceColor(similarTrack.distance)}
                      size="sm"
                      title={`Distance: ${similarTrack.distance.toFixed(3)}`}
                    >
                      {getDistanceLabel(similarTrack.distance)}
                    </Badge>
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
          💡 About Similar Tracks
        </Text>
        <Text fontSize="sm" color="fg.muted">
          Tracks are ranked by identity similarity based on genre, style, era, country, and tags
          (excluding DJ notes). Lower distance = more similar.
        </Text>
      </Box>
    </Box>
  );
}

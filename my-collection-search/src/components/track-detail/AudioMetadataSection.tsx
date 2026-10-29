"use client";

import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Image,
  Skeleton,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { TrackAudioMetadataResponse } from "@/services/internalApi/tracks";

type Props = {
  query: UseQueryResult<TrackAudioMetadataResponse, Error>;
  trackAudioCoverUrl?: string | null;
  isExtractingCover: boolean;
  onExtractCover: () => Promise<void>;
};

export default function AudioMetadataSection({
  query,
  trackAudioCoverUrl,
  isExtractingCover,
  onExtractCover,
}: Props) {
  return (
    <Box borderWidth="outline" borderColor="border.ink" boxShadow="sm" p={4} mt={4}>
      <Flex justify="space-between" align="center" mb={3} gap={3} wrap="wrap">
        <Heading size="sm">Audio File Metadata (ffprobe)</Heading>
        <Button size="sm" variant="outline" loading={isExtractingCover} onClick={onExtractCover}>
          Update Album Cover
        </Button>
      </Flex>

      {query.isLoading ? (
        <VStack align="stretch" gap={2}>
          <Skeleton height="20px" />
          <Skeleton height="120px" />
        </VStack>
      ) : query.error ? (
        <Text color="fg.error">
          {query.error instanceof Error ? query.error.message : "Failed to load audio metadata"}
        </Text>
      ) : query.data ? (
        <VStack align="stretch" gap={3}>
          <HStack gap={2} flexWrap="wrap">
            <Badge colorPalette={query.data.has_embedded_cover ? "status.success" : "neutral"}>
              {query.data.has_embedded_cover ? "Embedded Cover Found" : "No Embedded Cover"}
            </Badge>
            <Badge variant="outline">{query.data.local_audio_url}</Badge>
          </HStack>

          {(trackAudioCoverUrl || query.data.audio_file_album_art_url) && (
            <Box>
              <Text fontSize="sm" mb={2}>
                Saved Audio Cover
              </Text>
              <Image
                src={trackAudioCoverUrl || query.data.audio_file_album_art_url || ""}
                alt="Audio embedded cover"
                boxSize="120px"
                objectFit="cover"
                borderRadius="md"
                borderWidth="1px"
              />
            </Box>
          )}

          <Box
            as="pre"
            p={3}
            borderRadius="md"
            borderWidth="1px"
            overflow="auto"
            maxH="420px"
            fontSize="xs"
            whiteSpace="pre-wrap"
          >
            {JSON.stringify(query.data.probe, null, 2)}
          </Box>
        </VStack>
      ) : (
        <Text color="fg.muted">No audio metadata available.</Text>
      )}
    </Box>
  );
}

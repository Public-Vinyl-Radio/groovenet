"use client";

import { SectionHeading } from "@/components/ui/SectionHeading";
import Cover from "@/components/Cover";

import { Box, Button, Flex, HStack, Skeleton, Text, VStack } from "@chakra-ui/react";
import { MetaTag, StatusTag } from "@/components/ui/RoleTags";
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
    <Box
      borderWidth="outline"
      borderColor="border.ink"
      boxShadow="sm"
      p={4}
      mt={4}
      borderRadius="md"
    >
      <Flex justify="space-between" align="center" mb={3} gap={3} wrap="wrap">
        <SectionHeading>Audio File Metadata (ffprobe)</SectionHeading>
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
            <StatusTag tone={query.data.has_embedded_cover ? "success" : "neutral"}>
              {query.data.has_embedded_cover ? "Embedded Cover Found" : "No Embedded Cover"}
            </StatusTag>
            <MetaTag variant="raw">{query.data.local_audio_url}</MetaTag>
          </HStack>

          <Box>
            <Text fontSize="sm" mb={2}>
              Saved Audio Cover
            </Text>
            <Cover
              src={trackAudioCoverUrl || query.data.audio_file_album_art_url}
              alt="Audio embedded cover"
              size="120px"
            />
          </Box>

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

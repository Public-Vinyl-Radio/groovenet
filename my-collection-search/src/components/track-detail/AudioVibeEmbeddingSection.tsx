"use client";

import { Badge, Box, Heading, HStack, Skeleton, Text, VStack } from "@chakra-ui/react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { AudioVibeEmbeddingPreviewResponse } from "@/services/internalApi/tracks";

type Props = {
  query: UseQueryResult<AudioVibeEmbeddingPreviewResponse, Error>;
};

export default function AudioVibeEmbeddingSection({ query }: Props) {
  return (
    <Box borderWidth="outline" borderColor="border.ink" boxShadow="sm" p={4} mt={4}>
      <Heading size="sm" mb={3}>
        Audio Vibe Embedding Preview
      </Heading>

      {query.isLoading ? (
        <VStack align="stretch" gap={2}>
          <Skeleton height="20px" />
          <Skeleton height="120px" />
        </VStack>
      ) : query.error ? (
        <Text color="fg.error">
          {query.error instanceof Error
            ? query.error.message
            : "Failed to load audio vibe embedding preview"}
        </Text>
      ) : query.data ? (
        <VStack align="stretch" gap={3}>
          <HStack gap={2} flexWrap="wrap">
            <Badge colorPalette="accent">Audio Vibe</Badge>
            {query.data.vibeData.bpm !== "unknown" && (
              <Badge variant="outline">{query.data.vibeData.bpm} BPM</Badge>
            )}
            {query.data.vibeData.key !== "unknown" && (
              <Badge variant="outline">{query.data.vibeData.key}</Badge>
            )}
            {query.data.vibeData.energy && (
              <Badge variant="outline" colorPalette="status.analysis">
                {query.data.vibeData.energy} energy
              </Badge>
            )}
          </HStack>
          <Box
            as="pre"
            p={3}
            borderRadius="md"
            borderWidth="1px"
            overflow="auto"
            maxH="420px"
            fontSize="xs"
            whiteSpace="pre-wrap"
            bg="bg.subtle"
            _dark={{ bg: "bg.subtle" }}
          >
            {query.data.vibeText}
          </Box>
          <Box fontSize="xs" color="fg.muted">
            <Text fontWeight="medium" mb={1}>
              Vibe Profile:
            </Text>
            <Text>Descriptors: {query.data.vibeData.vibeDescriptors.join(", ")}</Text>
            <Text>Dominant Mood: {query.data.vibeData.dominantMood}</Text>
            <Text>Danceability: {query.data.vibeData.danceability}</Text>
            {query.data.vibeData.acoustic && <Text>Acoustic: {query.data.vibeData.acoustic}</Text>}
            {query.data.vibeData.vocalPresence && (
              <Text>Vocals: {query.data.vibeData.vocalPresence}</Text>
            )}
            {query.data.vibeData.percussiveness && (
              <Text>Percussiveness: {query.data.vibeData.percussiveness}</Text>
            )}
          </Box>
        </VStack>
      ) : (
        <Text color="fg.muted">
          No audio vibe embedding preview available. This track may not have audio analysis data.
        </Text>
      )}
    </Box>
  );
}

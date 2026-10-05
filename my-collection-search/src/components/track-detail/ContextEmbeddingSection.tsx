"use client";

import { Badge, Box, Heading, HStack, Skeleton, Text, VStack } from "@chakra-ui/react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ContextEmbeddingPreviewResponse } from "@/services/internalApi/tracks";

type Props = {
  query: UseQueryResult<ContextEmbeddingPreviewResponse, Error>;
};

/** The text semantic and hybrid search embed for this track (#408, #409). */
export default function ContextEmbeddingSection({ query }: Props) {
  return (
    <Box borderWidth="1px" borderRadius="md" p={4} mt={4}>
      <Heading size="sm" mb={1}>
        Context Embedding Preview
      </Heading>
      <Text fontSize="xs" color="fg.muted" mb={3}>
        What natural-language search embeds: descriptors first, identifiers last. Built from the
        track as it is now, so it matches the stored vector unless the track changed since its last
        embed.
      </Text>

      {query.isLoading ? (
        <VStack align="stretch" gap={2}>
          <Skeleton height="20px" />
          <Skeleton height="80px" />
        </VStack>
      ) : query.error ? (
        <Text color="red.500">{query.error.message || "Failed to load context embedding preview"}</Text>
      ) : query.data ? (
        <VStack align="stretch" gap={3}>
          <HStack gap={2} flexWrap="wrap">
            <Badge colorPalette="teal">Natural-language search</Badge>
            <Badge variant="outline">{query.data.contextData.era}</Badge>
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
            bg="gray.50"
            _dark={{ bg: "gray.900" }}
          >
            {query.data.contextText}
          </Box>
        </VStack>
      ) : (
        <Text color="fg.muted">No context embedding preview available.</Text>
      )}
    </Box>
  );
}

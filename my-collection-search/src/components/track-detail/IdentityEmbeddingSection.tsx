"use client";

import { Box, Heading, HStack, Skeleton, Text, VStack } from "@chakra-ui/react";
import { MetaTag, SourceTag } from "@/components/ui/RoleTags";
import type { UseQueryResult } from "@tanstack/react-query";
import type { IdentityEmbeddingPreviewResponse } from "@/services/internalApi/tracks";

type Props = {
  query: UseQueryResult<IdentityEmbeddingPreviewResponse, Error>;
};

export default function IdentityEmbeddingSection({ query }: Props) {
  return (
    <Box
      borderWidth="outline"
      borderColor="border.ink"
      boxShadow="sm"
      p={4}
      mt={4}
      borderRadius="md"
    >
      <Heading size="sm" mb={3}>
        Identity Embedding Preview
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
            : "Failed to load identity embedding preview"}
        </Text>
      ) : query.data ? (
        <VStack align="stretch" gap={3}>
          <HStack gap={2} flexWrap="wrap">
            <SourceTag stroke="solid">Music Identity</SourceTag>
            <MetaTag>{query.data.identityData.era}</MetaTag>
            <MetaTag>{query.data.identityData.country}</MetaTag>
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
            {query.data.identityText}
          </Box>
          <Box fontSize="xs" color="fg.muted">
            <Text fontWeight="medium" mb={1}>
              Normalized Data:
            </Text>
            <Text>Genres: {query.data.identityData.genres.join(", ") || "none"}</Text>
            <Text>Styles: {query.data.identityData.styles.join(", ") || "none"}</Text>
            <Text>Tags: {query.data.identityData.tags.join(", ") || "none"}</Text>
            <Text>Labels: {query.data.identityData.labels.join(", ") || "none"}</Text>
          </Box>
        </VStack>
      ) : (
        <Text color="fg.muted">No identity embedding preview available.</Text>
      )}
    </Box>
  );
}

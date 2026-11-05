"use client";

import { SectionHeading } from "@/components/ui/SectionHeading";
import { Box, Skeleton, Text, VStack } from "@chakra-ui/react";
import { MetaTag } from "@/components/ui/RoleTags";
import type { UseQueryResult } from "@tanstack/react-query";
import type { TrackEssentiaResponse } from "@/services/internalApi/tracks";

type Props = {
  query: UseQueryResult<TrackEssentiaResponse, Error>;
};

export default function EssentiaSection({ query }: Props) {
  return (
    <Box
      borderWidth="outline"
      borderColor="border.ink"
      boxShadow="sm"
      p={4}
      mt={4}
      borderRadius="md"
    >
      <SectionHeading mb={3}>Essentia Raw Analysis</SectionHeading>

      {query.isLoading ? (
        <VStack align="stretch" gap={2}>
          <Skeleton height="20px" />
          <Skeleton height="120px" />
        </VStack>
      ) : query.error ? (
        <Text color="fg.muted">
          {query.error instanceof Error ? query.error.message : "No Essentia file available yet"}
        </Text>
      ) : query.data ? (
        <VStack align="stretch" gap={3}>
          <MetaTag variant="raw">{query.data.file_path}</MetaTag>
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
            {JSON.stringify(query.data.data, null, 2)}
          </Box>
        </VStack>
      ) : (
        <Text color="fg.muted">No Essentia file available yet.</Text>
      )}
    </Box>
  );
}

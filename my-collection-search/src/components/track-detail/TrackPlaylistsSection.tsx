"use client";

import NextLink from "next/link";
import { Box, Heading, HStack, Link, Text, VStack } from "@chakra-ui/react";
import { MetaTag } from "@/components/ui/RoleTags";
import type { UseQueryResult } from "@tanstack/react-query";
import type { TrackPlaylistMembership } from "@/services/internalApi/tracks";

type Props = {
  query: UseQueryResult<TrackPlaylistMembership[], Error>;
};

/** Hidden until the track is known to be in a playlist (or the lookup failed); an empty section is noise. */
export default function TrackPlaylistsSection({ query }: Props) {
  const hasPlaylists = !!query.data && query.data.length > 0;
  if (!hasPlaylists && !query.error) return null;

  return (
    <Box borderWidth="outline" borderColor="border.ink" boxShadow="sm" p={4} mt={4}>
      <Heading size="sm" mb={3}>
        In Playlists
      </Heading>

      {query.error ? (
        <Text color="fg.error">
          {query.error instanceof Error
            ? query.error.message
            : "Failed to load playlist memberships"}
        </Text>
      ) : (
        <VStack align="stretch" gap={2}>
          {query.data?.map((playlist) => (
            <HStack key={`${playlist.id}:${playlist.position}`} justify="space-between">
              <Link as={NextLink} href={`/playlists/${playlist.id}`} fontWeight="medium">
                {playlist.name}
              </Link>
              <MetaTag>Position {playlist.position}</MetaTag>
            </HStack>
          ))}
        </VStack>
      )}
    </Box>
  );
}

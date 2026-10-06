"use client";

import { Box, Flex, Heading, Text, VStack } from "@chakra-ui/react";
import { GenreBadgeList } from "@/components/GenreBadge";
import { useGenreLookup } from "@/hooks/useGenreTaxonomyQuery";
import { useTrack } from "@/hooks/useTrack";
import { discogsGenreBadges, trackGenreBadges } from "@/lib/genres/links";
import type { Track } from "@/types/track";

type Props = {
  trackId: string;
  friendId: number;
  fallbackTrack: Track;
};

/**
 * The track's DJ genres and its album's Discogs genres and styles, each a
 * link into track search (#376). Reads the store, so an edit shows at once.
 */
export default function TrackGenresSection({ trackId, friendId, fallbackTrack }: Props) {
  const track = useTrack(trackId, friendId) ?? fallbackTrack;
  const lookup = useGenreLookup();
  const trackGenres = trackGenreBadges(track, lookup);
  const discogsGenres = discogsGenreBadges(track.genres, lookup);
  const discogsStyles = discogsGenreBadges(track.styles, lookup);

  return (
    <Box borderWidth="1px" borderRadius="md" p={4} mt={4} data-testid="track-genres-section">
      <Heading size="sm" mb={3}>
        Genres
      </Heading>
      <VStack align="stretch" gap={3}>
        <Box>
          <Text fontSize="xs" color="fg.muted" mb={1}>
            Track
          </Text>
          {trackGenres.length > 0 ? (
            <Flex gap={1.5} flexWrap="wrap">
              <GenreBadgeList items={trackGenres} kind="track" scope="tracks" />
            </Flex>
          ) : (
            <Text fontSize="sm" color="fg.muted">
              No genres yet
            </Text>
          )}
        </Box>
        {(discogsGenres.length > 0 || discogsStyles.length > 0) && (
          <Box>
            <Text fontSize="xs" color="fg.muted" mb={1}>
              Album (Discogs)
            </Text>
            <Flex gap={1.5} flexWrap="wrap">
              <GenreBadgeList items={discogsGenres} kind="discogs-genre" scope="tracks" />
              <GenreBadgeList items={discogsStyles} kind="discogs-style" scope="tracks" />
            </Flex>
          </Box>
        )}
      </VStack>
    </Box>
  );
}

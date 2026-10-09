"use client";

import React, { Suspense } from "react";
import {
  Badge,
  Box,
  EmptyState,
  Flex,
  Grid,
  Heading,
  HStack,
  Spinner,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { FiActivity, FiClock, FiDisc } from "react-icons/fi";
import TrackActionsMenu from "@/components/TrackActionsMenu";
import TrackResultStore from "@/components/TrackResultStore";
import PageContainer from "@/components/layout/PageContainer";
import SpinRow from "@/components/spins/SpinRow";
import { groupSpinsByDay } from "@/components/spins/spinSummary";
import { useSpinsQuery, useSpinTopTracksQuery } from "@/hooks/useSpinsQuery";
import { useUsername } from "@/providers/UsernameProvider";
import type { Track } from "@/types/track";

function buildTopTrackFallback(track: {
  track_id: string;
  friend_id: number;
  title_snapshot: string;
  artist_snapshot: string;
  album_snapshot: string;
  album_thumbnail?: string | null;
  audio_file_album_art_url?: string | null;
  local_audio_url?: string | null;
  bpm?: number | string | null;
  key?: string | null;
  star_rating?: number | null;
  styles?: string[];
  library_identifier?: string | null;
  hasVectors?: boolean;
  track_genres?: Track["track_genres"];
}): Track {
  return {
    id: 0,
    track_id: track.track_id,
    friend_id: track.friend_id,
    title: track.title_snapshot,
    artist: track.artist_snapshot,
    album: track.album_snapshot,
    year: "",
    duration: "",
    position: "",
    discogs_url: "",
    apple_music_url: "",
    album_thumbnail: track.album_thumbnail ?? undefined,
    audio_file_album_art_url: track.audio_file_album_art_url ?? undefined,
    local_audio_url: track.local_audio_url ?? undefined,
    bpm:
      typeof track.bpm === "number" ? String(track.bpm) : track.bpm ?? undefined,
    key: track.key ?? undefined,
    star_rating: track.star_rating ?? undefined,
    styles: track.styles,
    library_identifier: track.library_identifier ?? undefined,
    hasVectors: track.hasVectors,
    track_genres: track.track_genres,
  };
}

function SpinsPageContent() {
  const { friend: currentUserFriend, isHydrated } = useUsername();
  const selectedFriendId = currentUserFriend?.id ?? null;

  const spinsQuery = useSpinsQuery(
    { friend_id: selectedFriendId ?? 0, limit: 50, offset: 0 },
    { enabled: typeof selectedFriendId === "number" && selectedFriendId > 0 }
  );
  const topTracksQuery = useSpinTopTracksQuery(
    { friend_id: selectedFriendId ?? 0, limit: 12, offset: 0 },
    { enabled: typeof selectedFriendId === "number" && selectedFriendId > 0 }
  );
  if (!isHydrated || !selectedFriendId) {
    return (
      <PageContainer size="standard">
        <Flex justify="center" py={10}><Spinner /></Flex>
      </PageContainer>
    );
  }

  return (
    <PageContainer size="standard">
      <Stack gap={4}>
        {/* Header */}
        <Flex align="center" justify="space-between" gap={3}>
          <Box>
            <Heading size={{ base: "md", md: "lg" }}>Vinyl Spins</Heading>
            <Text color="fg.muted" fontSize="sm" display={{ base: "none", md: "block" }}>
              Global history and most-played physical vinyl tracks.
            </Text>
          </Box>
        </Flex>

        <Grid templateColumns={{ base: "1fr", xl: "1.2fr 0.8fr" }} gap={4} minW={0}>
          {/* Recent Spins */}
          <Box minW={0} w="full">
            <HStack justify="space-between" mb={3} w="full" minW={0}>
              <HStack gap={2}>
                <FiClock />
                <Heading size="sm">Recent Spins</Heading>
              </HStack>
              <Badge variant="outline">{spinsQuery.spins.length}</Badge>
            </HStack>

            {spinsQuery.isLoading ? (
              <Flex justify="center" py={6}><Spinner size="sm" /></Flex>
            ) : spinsQuery.spins.length === 0 ? (
              <EmptyState.Root size="sm">
                <EmptyState.Content>
                  <EmptyState.Indicator><FiDisc /></EmptyState.Indicator>
                  <VStack textAlign="center">
                    <EmptyState.Title>No spins logged yet</EmptyState.Title>
                    <EmptyState.Description>
                      Log a vinyl spin from an album page to start building history.
                    </EmptyState.Description>
                  </VStack>
                </EmptyState.Content>
              </EmptyState.Root>
            ) : (
              <Stack gap={4}>
                {groupSpinsByDay(spinsQuery.spins).map((day) => (
                  <Box key={day.key}>
                    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mb={1.5}>
                      {day.label}
                    </Text>
                    <Box borderWidth="1px" borderRadius="md">
                      {day.items.map((item) => (
                        <SpinRow
                          key={item.session.id}
                          item={item}
                          showAlbum
                          timeOnly
                        />
                      ))}
                    </Box>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>

          {/* Most Played Tracks */}
          <Box minW={0} w="full">
            <HStack justify="space-between" mb={3} w="full" minW={0}>
              <HStack gap={2}>
                <FiActivity />
                <Heading size="sm">Most Played Tracks</Heading>
              </HStack>
              <Badge variant="outline">{topTracksQuery.topTracks.length}</Badge>
            </HStack>

            {topTracksQuery.isLoading ? (
              <Flex justify="center" py={6}><Spinner size="sm" /></Flex>
            ) : topTracksQuery.topTracks.length === 0 ? (
              <EmptyState.Root size="sm">
                <EmptyState.Content>
                  <EmptyState.Indicator><FiDisc /></EmptyState.Indicator>
                  <VStack textAlign="center">
                    <EmptyState.Title>No top tracks yet</EmptyState.Title>
                    <EmptyState.Description>
                      Track analytics will appear after you log vinyl spins.
                    </EmptyState.Description>
                  </VStack>
                </EmptyState.Content>
              </EmptyState.Root>
            ) : (
              <Stack gap={2}>
                {topTracksQuery.topTracks.map((track, index) => (
                  <TrackResultStore
                    key={`${track.track_id}:${track.friend_id}`}
                    trackId={track.track_id}
                    friendId={track.friend_id}
                    fallbackTrack={buildTopTrackFallback(track)}
                    playlistMode={true}
                    showUsername={false}
                    buttons={<TrackActionsMenu track={buildTopTrackFallback(track)} />}
                    footer={
                      <Flex gap={1} align="center" flexWrap="wrap">
                        <Badge colorPalette="blue" size="sm">#{index + 1}</Badge>
                        <Badge variant="outline" size="sm">{track.play_count}× played</Badge>
                        {track.position_snapshot && (
                          <Badge variant="subtle" size="sm">{track.position_snapshot}</Badge>
                        )}
                      </Flex>
                    }
                  />
                ))}
              </Stack>
            )}
          </Box>
        </Grid>
      </Stack>
    </PageContainer>
  );
}

export default function SpinsPage() {
  return (
    <Suspense
      fallback={
        <PageContainer size="standard">
          <Flex justify="center" py={10}><Spinner /></Flex>
        </PageContainer>
      }
    >
      <SpinsPageContent />
    </Suspense>
  );
}

"use client";

import React from "react";
import NextLink from "next/link";
import {
  Box,
  Flex,
  Text,
  Button,
  Icon,
  RatingGroup,
  Badge,
  Popover,
  Link,
} from "@chakra-ui/react";
import { FiFileText, FiPlay } from "react-icons/fi";
import { Track } from "@/types/track";
import { keyToCamelot } from "@/lib/playlistOrder";
import { usePlaylistPlayer } from "@/providers/PlaylistPlayerProvider";
import { getTrackDurationSeconds } from "@/lib/trackUtils";
import { trackGenreBadges } from "@/lib/genres/links";
import { useGenreLookup } from "@/hooks/useGenreTaxonomyQuery";
import { GenreBadgeList } from "./GenreBadge";
import { useColorModeValue } from "@/components/ui/color-mode";
import TrackPlaylistUsage from "@/components/TrackPlaylistUsage";

function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export type AlbumTrackItemProps = {
  track: Track;
  albumArtist: string;
  playlistCount?: number;
  buttons?: React.ReactNode;
};

export default function AlbumTrackItem({
  track,
  albumArtist,
  playlistCount = 0,
  buttons,
}: AlbumTrackItemProps) {
  const { replacePlaylist } = usePlaylistPlayer();
  const trackHref = `/tracks/${encodeURIComponent(track.track_id)}?friend_id=${track.friend_id}`;
  const hasNotes = Boolean(track.notes?.trim());
  const genreLookup = useGenreLookup();
  const genreLabels = trackGenreBadges(track, genreLookup);
  const positionLabel = String(track.position ?? "").trim();
  const rowHoverBg = useColorModeValue("gray.50", "gray.800");
  const positionBg = useColorModeValue("gray.100", "gray.700");
  const positionColor = useColorModeValue("gray.700", "gray.200");

  // Only show artist if different from album artist (for compilations)
  const showArtist = track.artist !== albumArtist;

  return (
    <Flex
      p={{ base: 2.5, md: 3 }}
      gap={{ base: 2.5, md: 3 }}
      alignItems="center"
      position="relative"
      borderBottomWidth="1px"
      _last={{ borderBottomWidth: 0 }}
      _hover={{ bg: rowHoverBg }}
    >
      <Flex
        alignItems="center"
        gap={{ base: 2, md: 3 }}
        flexShrink={0}
      >
        {positionLabel && (
          <Box
            minW={{ base: "34px", md: "42px" }}
            px={2}
            py={1}
            borderRadius="sm"
            bg={positionBg}
            color={positionColor}
            textAlign="center"
            fontFamily="mono"
            fontSize={{ base: "xs", md: "sm" }}
            fontWeight="semibold"
            lineHeight="1"
          >
            {positionLabel}
          </Box>
        )}
        {track.local_audio_url && (
          <Button
            variant="ghost"
            size="xs"
            minW="28px"
            h="28px"
            p={0}
            aria-label={`Play ${track.title}`}
            display={{ base: "none", md: "flex" }}
            onClick={() =>
              replacePlaylist([track], { autoplay: true, startIndex: 0 })
            }
          >
            <Icon as={FiPlay} />
          </Button>
        )}
      </Flex>

      <Flex flex="1" direction="column" gap={1.5} minW={0}>
        <Flex gap={2} alignItems="baseline" minW={0}>
          <Text
            fontWeight="semibold"
            fontSize={{ base: "sm", md: "md" }}
            lineClamp={1}
            minW={0}
          >
            <Link
              as={NextLink}
              href={trackHref}
              _hover={{ textDecoration: "underline" }}
            >
              {track.title}
            </Link>
          </Text>
        </Flex>

        {showArtist && (
          <Text
            fontSize={{ base: "xs", md: "sm" }}
            color="gray.600"
            lineClamp={1}
          >
            {track.artist}
          </Text>
        )}

        <Flex
          gap={{ base: 1.5, md: 2 }}
          fontSize={{ base: "xs", md: "sm" }}
          color="gray.600"
          flexWrap="wrap"
          alignItems="center"
        >
          {track.library_identifier && (
            <Badge colorPalette="blue" size="xs" fontWeight="bold">
              {track.library_identifier}
            </Badge>
          )}
          <TrackPlaylistUsage track={track} count={playlistCount} />
          {getTrackDurationSeconds(track) && (
            <Text>{formatSeconds(getTrackDurationSeconds(track) || 0)}</Text>
          )}
          {track.bpm && (
            <Badge colorPalette="purple" size="xs" variant="subtle">
              {track.bpm} BPM
            </Badge>
          )}
          {track.key && (
            <Text display={{ base: "none", sm: "inline" }}>
              {track.key} ({keyToCamelot(track.key)})
            </Text>
          )}
          <Box display={{ base: "none", md: "block" }}>
            <RatingGroup.Root value={track.star_rating ?? 0} readOnly size="xs">
              {Array.from({ length: 5 }).map((_, index) => (
                <RatingGroup.Item key={index} index={index + 1}>
                  <RatingGroup.ItemIndicator />
                </RatingGroup.Item>
              ))}
            </RatingGroup.Root>
          </Box>
        </Flex>

        {(genreLabels.length > 0 || hasNotes) && (
          <Flex gap={1} flexWrap="wrap" alignItems="center">
            <GenreBadgeList items={genreLabels} kind="track" scope="tracks" size="xs" />
            {hasNotes && (
              <Popover.Root>
                <Popover.Trigger asChild>
                  <Box
                    as="button"
                    display="inline-flex"
                    alignItems="center"
                    color="yellow.500"
                    _hover={{ color: "yellow.400" }}
                    w="fit-content"
                  >
                    <FiFileText size={13} />
                  </Box>
                </Popover.Trigger>
                <Popover.Positioner>
                  <Popover.Content maxW="320px">
                    <Popover.Body>
                      <Text fontSize="sm" whiteSpace="pre-wrap">
                        {track.notes}
                      </Text>
                    </Popover.Body>
                  </Popover.Content>
                </Popover.Positioner>
              </Popover.Root>
            )}
          </Flex>
        )}
      </Flex>

      <Box flexShrink={0}>{buttons}</Box>
    </Flex>
  );
}

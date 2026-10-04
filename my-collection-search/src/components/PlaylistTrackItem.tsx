"use client";
import React from "react";
import NextLink from "next/link";
import ArtistLink from "./ArtistLink";
import AlbumLink from "./AlbumLink";
import {
  Box,
  Flex,
  Text,
  Image,
  Icon,
  Link,
  RatingGroup,
  Badge,
  Dialog,
  Portal,
} from "@chakra-ui/react";
import { FaPlay } from "react-icons/fa";
import { keyToCamelot } from "@/lib/playlistOrder";
import { getTrackDurationSeconds } from "@/lib/trackUtils";
import { usePlaylistPlayer } from "@/providers/PlaylistPlayerProvider";
import { Track } from "@/types/track";
import ExpandableMarkdown from "./ExpandableMarkdown";
import type { SortPositionChange } from "@/hooks/usePlaylistMutations";

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

type PlaylistTrackItemProps = {
  track: Track;
  buttons?: React.ReactNode;
  showUsername?: boolean;
  sortPositionChange?: SortPositionChange;
};

export default function PlaylistTrackItem({
  track,
  buttons,
  showUsername = false,
  sortPositionChange,
}: PlaylistTrackItemProps) {
  const { replacePlaylist } = usePlaylistPlayer();
  const [notesModalOpen, setNotesModalOpen] = React.useState(false);
  const trackHref = `/tracks/${encodeURIComponent(track.track_id)}?friend_id=${track.friend_id}`;
  const artworkSrc =
    track.audio_file_album_art_url ||
    track.album_thumbnail ||
    "/images/placeholder-artwork.png";
  const hasEmbedding = track.hasVectors === true;

  const bpmNum =
    typeof track.bpm === "number"
      ? track.bpm
      : typeof track.bpm === "string"
      ? Number.parseFloat(track.bpm)
      : NaN;
  const hasBpm = Number.isFinite(bpmNum) && bpmNum > 0;
  const hasDataIssue = !hasEmbedding || !hasBpm;

  return (
    <>
      <Flex
        borderBottomWidth="1px"
        borderLeftWidth={hasDataIssue ? "3px" : "0"}
        borderLeftColor={hasDataIssue ? "red.400" : "transparent"}
        p={{ base: 2, md: 3 }}
        gap={{ base: 2, md: 3 }}
        position="relative"
        width="100%"
        bg={hasDataIssue ? "red.50" : undefined}
        _hover={{ bg: hasDataIssue ? "red.100" : "bg.muted" }}
      >
        {/* Album Art with Play Overlay */}
        <Box
          position="relative"
          flexShrink={0}
          width={{ base: "50px", md: "70px" }}
          height={{ base: "50px", md: "70px" }}
        >
          {track.local_audio_url ? (
            <Box
              position="relative"
              borderRadius="md"
              overflow="hidden"
              cursor="pointer"
              width="100%"
              height="100%"
              tabIndex={0}
              onClick={() =>
                replacePlaylist([track], { autoplay: true, startIndex: 0 })
              }
              _hover={{ "& .overlay": { opacity: 1 } }}
            >
              <Image
                src={artworkSrc}
                alt={track.title}
                width="100%"
                height="100%"
                objectFit="cover"
                borderRadius="md"
                transition="opacity 0.2s ease"
                draggable={false}
              />

              <Box
                className="overlay"
                position="absolute"
                top={0}
                left={0}
                right={0}
                bottom={0}
                display="flex"
                alignItems="center"
                justifyContent="center"
                opacity={0}
                transition="opacity 0.15s ease"
                pointerEvents="none"
                bg="blackAlpha.500"
                borderRadius="md"
              >
                <Icon as={FaPlay} boxSize={{ base: 5, md: 7 }} color="white" />
              </Box>
            </Box>
          ) : (
            <Image
              src={artworkSrc}
              alt={track.title}
              width="100%"
              height="100%"
              objectFit="cover"
              borderRadius="md"
            />
          )}
        </Box>

        {/* Main Content */}
        <Flex direction="column" flex={1} minW={0} gap={1}>
          {/* Title */}
          <Text
            fontSize={{ base: "sm", md: "md" }}
            fontWeight="semibold"
            overflow="hidden"
            textOverflow="ellipsis"
            whiteSpace="nowrap"
            pr={{ base: 8, md: 10 }}
          >
            <Link
              as={NextLink}
              href={trackHref}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              _hover={{ textDecoration: "underline" }}
            >
              {track.title}
            </Link>
          </Text>

          {/* Artist & Album */}
          <Flex
            gap={2}
            fontSize={{ base: "xs", md: "sm" }}
            color="gray.600"
            alignItems="center"
            flexWrap="wrap"
          >
            <ArtistLink artist={track.artist} friendId={track.friend_id}>
              <Text fontWeight="medium">{track.artist}</Text>
            </ArtistLink>
            <Text color="gray.400">•</Text>
            <Box overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
              <AlbumLink releaseId={track.release_id} friendId={track.friend_id}>
                <Text as="span">{track.album}</Text>
              </AlbumLink>
            </Box>
          </Flex>

          {/* Metadata Row */}
          <Flex
            gap={{ base: 1.5, md: 2 }}
            fontSize={{ base: "xs", md: "sm" }}
            color="gray.500"
            alignItems="center"
            flexWrap="wrap"
          >
            {!hasEmbedding && (
              <Badge colorPalette="red" size={{ base: "xs", md: "sm" }}>
                No embedding
              </Badge>
            )}
            {!hasBpm && (
              <Badge colorPalette="orange" size={{ base: "xs", md: "sm" }}>
                No BPM
              </Badge>
            )}
            {track.library_identifier && (
              <Badge colorPalette="blue" size={{ base: "xs", md: "sm" }}>
                {track.library_identifier}
              </Badge>
            )}
            {sortPositionChange && (
              <Badge colorPalette="purple" size={{ base: "xs", md: "sm" }}>
                #{sortPositionChange.currentPosition} was #
                {sortPositionChange.previousPosition}
              </Badge>
            )}
            {getTrackDurationSeconds(track) && (
              <Text>{formatSeconds(getTrackDurationSeconds(track) || 0)}</Text>
            )}
            {track.bpm && (
              <>
                <Text display={{ base: "none", md: "block" }} color="gray.400">
                  •
                </Text>
                <Text>{track.bpm} bpm</Text>
              </>
            )}
            {track.key && (
              <>
                <Text display={{ base: "none", md: "block" }} color="gray.400">
                  •
                </Text>
                <Text display={{ base: "none", md: "block" }}>
                  {track.key} ({keyToCamelot(track.key)})
                </Text>
              </>
            )}
            {showUsername && track.username && (
              <>
                <Text color="gray.400">•</Text>
                <Text fontSize="xs">{track.username}</Text>
              </>
            )}
          </Flex>

          {/* Rating (desktop only) */}
          <Box display={{ base: "none", md: "block" }}>
            <RatingGroup.Root value={track.star_rating ?? 0} readOnly size="xs">
              {Array.from({ length: 5 }).map((_, index) => (
                <RatingGroup.Item key={index} index={index + 1}>
                  <RatingGroup.ItemIndicator />
                </RatingGroup.Item>
              ))}
            </RatingGroup.Root>
          </Box>

          {/* Notes (desktop only) */}
          {track.notes && (
            <Box display={{ base: "none", md: "block" }}>
              <ExpandableMarkdown text={track.notes} maxLength={80} />
            </Box>
          )}

          {/* Notes button (mobile only) */}
          {track.notes && (
            <Text
              display={{ base: "block", md: "none" }}
              fontSize="xs"
              color="blue.500"
              cursor="pointer"
              onClick={() => setNotesModalOpen(true)}
            >
              View notes
            </Text>
          )}
        </Flex>

        {/* Action Menu - Absolute positioned top-right */}
        <Box
          position="absolute"
          top={{ base: 1, md: 2 }}
          right={{ base: 1, md: 2 }}
          display="flex"
          gap={2}
        >
          {buttons}
        </Box>
      </Flex>

      {/* Notes Modal (mobile only) */}
      {track.notes && (
        <Portal>
          <Dialog.Root
            open={notesModalOpen}
            onOpenChange={(e) => setNotesModalOpen(e.open)}
          >
            <Dialog.Backdrop />
            <Dialog.Positioner>
              <Dialog.Content>
                <Dialog.Header>
                  <Dialog.Title>Notes</Dialog.Title>
                  <Dialog.CloseTrigger />
                </Dialog.Header>
                <Dialog.Body>
                  <ExpandableMarkdown text={track.notes} maxLength={1000} />
                </Dialog.Body>
              </Dialog.Content>
            </Dialog.Positioner>
          </Dialog.Root>
        </Portal>
      )}
    </>
  );
}

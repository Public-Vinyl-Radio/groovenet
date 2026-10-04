"use client";

import React, { useState } from "react";
import NextLink from "next/link";
import {
  Box, Table, Badge, RatingGroup, Link, Icon, Flex,
  Image, Checkbox, Popover, Text,
} from "@chakra-ui/react";

import { Track } from "@/types/track";
import { FaPlay } from "react-icons/fa";
import { FiFileText } from "react-icons/fi";
import { keyToCamelot } from "@/lib/playlistOrder";
import { usePlaylistPlayer } from "@/providers/PlaylistPlayerProvider";
import { useTrack } from "@/hooks/useTrack";
import { useTracksQuery } from "@/hooks/useTracksQuery";
import { dedupeDisplayTags, getTrackDurationSeconds } from "@/lib/trackUtils";

const PLACEHOLDER_SRC =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23374151' width='100' height='100'/%3E%3Ctext fill='%23ffffff' font-family='Arial' font-size='14' x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle'%3E%F0%9F%8E%B5%3C/text%3E%3C/svg%3E";

function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function InlineRatingCell({ track }: { track: Track }) {
  const [localRating, setLocalRating] = useState(track.star_rating ?? 0);
  const { saveTrack } = useTracksQuery();

  React.useEffect(() => {
    setLocalRating(track.star_rating ?? 0);
  }, [track.star_rating]);

  return (
    <RatingGroup.Root
      value={localRating}
      onValueChange={({ value }) => {
        setLocalRating(value);
        saveTrack({ track_id: track.track_id, friend_id: track.friend_id, star_rating: value });
      }}
      count={5}
      size="xs"
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <RatingGroup.Item key={i} index={i}>
          <RatingGroup.ItemIndicator />
        </RatingGroup.Item>
      ))}
    </RatingGroup.Root>
  );
}

const TrackTableRow: React.FC<{
  trackId: string;
  friendId: number;
  buttons?: (track: Track) => React.ReactNode;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}> = ({ trackId, friendId, buttons, isSelected, onToggleSelect }) => {
  const track = useTrack(trackId, friendId);
  const { replacePlaylist } = usePlaylistPlayer();

  if (!track) return null;

  const genres = dedupeDisplayTags(track.genres);
  const styles = dedupeDisplayTags(track.styles);
  const allGenres = [...genres, ...styles];
  const artworkSrc = track.audio_file_album_art_url || track.album_thumbnail || PLACEHOLDER_SRC;
  const trackHref = `/tracks/${encodeURIComponent(track.track_id)}?friend_id=${track.friend_id}`;
  const hasNotes = Boolean(track.notes?.trim());

  return (
    <Table.Row bg={isSelected ? "blue.subtle" : undefined}>
      {/* Checkbox */}
      <Table.Cell p={1} onClick={(e) => e.stopPropagation()}>
        {onToggleSelect && (
          <Checkbox.Root checked={isSelected} onChange={onToggleSelect}>
            <Checkbox.HiddenInput />
            <Checkbox.Control />
          </Checkbox.Root>
        )}
      </Table.Cell>

      {/* Artwork + play overlay */}
      <Table.Cell p={1}>
        <Box
          position="relative"
          width="44px"
          height="44px"
          borderRadius="sm"
          overflow="hidden"
          cursor={track.local_audio_url ? "pointer" : "default"}
          onClick={track.local_audio_url
            ? () => replacePlaylist([track], { autoplay: true, startIndex: 0 })
            : undefined}
          _hover={track.local_audio_url ? { "& .play-overlay": { opacity: 1 } } : undefined}
        >
          <Image src={artworkSrc} alt={track.title} width="100%" height="100%" objectFit="cover" />
          {track.local_audio_url && (
            <Box
              className="play-overlay"
              position="absolute"
              inset={0}
              display="flex"
              alignItems="center"
              justifyContent="center"
              bg="blackAlpha.600"
              opacity={0}
              transition="opacity 0.15s ease"
            >
              <Icon as={FaPlay} boxSize={3} color="white" />
            </Box>
          )}
        </Box>
      </Table.Cell>

      {/* Title + notes icon */}
      <Table.Cell maxW="280px">
        <Flex align="center" gap={1.5} overflow="hidden">
          <Link
            as={NextLink}
            href={trackHref}
            fontWeight="medium"
            overflow="hidden"
            textOverflow="ellipsis"
            whiteSpace="nowrap"
            flex="1"
            _hover={{ textDecoration: "underline" }}
          >
            {track.title}
          </Link>
          {hasNotes && (
            <Popover.Root>
              <Popover.Trigger asChild>
                <Box
                  as="button"
                  flexShrink={0}
                  color="yellow.400"
                  _hover={{ color: "yellow.300" }}
                  display="flex"
                  alignItems="center"
                >
                  <FiFileText size={12} />
                </Box>
              </Popover.Trigger>
              <Popover.Positioner>
                <Popover.Content maxW="280px">
                  <Popover.Body>
                    <Text fontSize="sm" whiteSpace="pre-wrap">{track.notes}</Text>
                  </Popover.Body>
                </Popover.Content>
              </Popover.Positioner>
            </Popover.Root>
          )}
        </Flex>
      </Table.Cell>

      {/* Artist */}
      <Table.Cell maxW="160px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
        {track.artist}
      </Table.Cell>

      {/* Album */}
      <Table.Cell maxW="160px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
        {track.album}
      </Table.Cell>

      {/* Genre — 1 badge, no wrap */}
      <Table.Cell>
        <Flex gap={1} flexWrap="nowrap" overflow="hidden" maxW="120px">
          {allGenres.slice(0, 1).map((genre, idx) => (
            <Badge key={idx} size="xs" variant="subtle" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" maxW="90px">
              {genre}
            </Badge>
          ))}
          {allGenres.length > 1 && (
            <Badge size="xs" variant="outline" flexShrink={0}>+{allGenres.length - 1}</Badge>
          )}
        </Flex>
      </Table.Cell>

      {/* Duration */}
      <Table.Cell whiteSpace="nowrap" color="gray.600" fontSize="xs">
        {getTrackDurationSeconds(track) ? formatSeconds(getTrackDurationSeconds(track) || 0) : "-"}
      </Table.Cell>

      {/* BPM */}
      <Table.Cell color="gray.600" fontSize="xs">{track.bpm || "-"}</Table.Cell>

      {/* Key */}
      <Table.Cell whiteSpace="nowrap" color="gray.600" fontSize="xs">
        {track.key ? `${track.key} (${keyToCamelot(track.key)})` : "-"}
      </Table.Cell>

      {/* Rating */}
      <Table.Cell><InlineRatingCell track={track} /></Table.Cell>

      {/* Actions */}
      <Table.Cell>{buttons && buttons(track)}</Table.Cell>
    </Table.Row>
  );
};

export type TrackTableViewWithLoaderProps = {
  trackInfo: Array<{ trackId: string; friendId: number }>;
  playlistCounts?: Record<string, number>;
  buttons?: (track: Track) => React.ReactNode;
  selectedTracks?: Set<string>;
  onToggleTrack?: (trackId: string, friendId: number) => void;
};

export default function TrackTableViewWithLoader({
  trackInfo,
  buttons,
  selectedTracks,
  onToggleTrack,
}: TrackTableViewWithLoaderProps) {
  return (
    <Box overflowX="auto">
      <Table.Root size="sm" variant="outline" interactive>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader width="40px" />
            <Table.ColumnHeader width="52px" />
            <Table.ColumnHeader minW="200px">Title</Table.ColumnHeader>
            <Table.ColumnHeader minW="140px">Artist</Table.ColumnHeader>
            <Table.ColumnHeader minW="140px">Album</Table.ColumnHeader>
            <Table.ColumnHeader width="130px">Genre</Table.ColumnHeader>
            <Table.ColumnHeader width="64px">Time</Table.ColumnHeader>
            <Table.ColumnHeader width="60px">BPM</Table.ColumnHeader>
            <Table.ColumnHeader width="90px">Key</Table.ColumnHeader>
            <Table.ColumnHeader width="110px">Rating</Table.ColumnHeader>
            <Table.ColumnHeader width="52px" />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {trackInfo.map((info) => (
            <TrackTableRow
              key={`${info.trackId}-${info.friendId}`}
              trackId={info.trackId}
              friendId={info.friendId}
              buttons={buttons}
              isSelected={selectedTracks?.has(`${info.trackId}:${info.friendId}`)}
              onToggleSelect={onToggleTrack ? () => onToggleTrack(info.trackId, info.friendId) : undefined}
            />
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}

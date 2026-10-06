"use client";
import React, { useState } from "react";
import NextLink from "next/link";
import ArtistLink from "./ArtistLink";
import AlbumLink from "./AlbumLink";
import TrackPlaylistUsage from "./TrackPlaylistUsage";
import {
  Box,
  Flex,
  Text,
  Link,
  Image,
  Icon,
  RatingGroup,
  Badge,
  Checkbox,
  Popover,
} from "@chakra-ui/react";
import { Track } from "@/types/track";
import { FaPlay } from "react-icons/fa";
import { FiFileText } from "react-icons/fi";
import { keyToCamelot } from "@/lib/playlistOrder";
import { getTrackDurationSeconds } from "@/lib/trackUtils";
import { discogsGenreBadges, trackGenreBadges } from "@/lib/genres/links";
import { useGenreLookup } from "@/hooks/useGenreTaxonomyQuery";
import { GenreBadgeList } from "./GenreBadge";
import { usePlaylistPlayer } from "@/providers/PlaylistPlayerProvider";
import { useTracksQuery } from "@/hooks/useTracksQuery";
import type { SortPositionChange } from "@/hooks/usePlaylistMutations";

function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const PLACEHOLDER_SRC =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23374151' width='100' height='100'/%3E%3Ctext fill='%23ffffff' font-family='Arial' font-size='14' x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle'%3E%F0%9F%8E%B5%3C/text%3E%3C/svg%3E";

export type TrackResultProps = {
  track: Track | (Track & { camelot_key?: string });
  buttons?: React.ReactNode;
  footer?: React.ReactNode;
  playlistCount?: number;
  showUsername?: boolean;
  showRating?: boolean;
  showDetails?: boolean;
  showGenres?: boolean;
  showLinks?: boolean;
  showNotes?: boolean;
  showPlaylistCount?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  // Playlist mode: compact artwork, data-issue indicator, no minimize
  playlistMode?: boolean;
  /** In playlist mode, also badge the track's DJ genres (#371). */
  showTrackGenres?: boolean;
  sortPositionChange?: SortPositionChange;
};

export default function TrackResult({
  track,
  buttons,
  footer,
  playlistCount,
  showUsername = true,
  showRating = true,
  showDetails = true,
  showGenres = true,
  showNotes = true,
  showPlaylistCount = true,
  isSelected,
  onToggleSelect,
  playlistMode = false,
  showTrackGenres = false,
  sortPositionChange,
}: TrackResultProps) {
  const [imageError, setImageError] = React.useState(false);
  const [localRating, setLocalRating] = useState(track.star_rating ?? 0);

  const { saveTrack } = useTracksQuery();

  React.useEffect(() => {
    setImageError(false);
  }, [track.track_id, track.audio_file_album_art_url, track.album_thumbnail]);

  React.useEffect(() => {
    setLocalRating(track.star_rating ?? 0);
  }, [track.star_rating]);

  const { replacePlaylist } = usePlaylistPlayer();

  const artworkSrc = imageError
    ? PLACEHOLDER_SRC
    : (track.audio_file_album_art_url || track.album_thumbnail || PLACEHOLDER_SRC);

  const trackHref = `/tracks/${encodeURIComponent(track.track_id)}?friend_id=${track.friend_id}`;
  const hasNotes = Boolean(track.notes?.trim());

  // Data quality indicators for playlist mode
  const hasEmbedding = track.hasVectors === true;
  const bpmNum = typeof track.bpm === "number" ? track.bpm : parseFloat(track.bpm as string);
  const hasBpm = Number.isFinite(bpmNum) && bpmNum > 0;
  const hasDataIssue = playlistMode && (!hasEmbedding || !hasBpm);

  const handleRatingChange = (value: number) => {
    setLocalRating(value);
    saveTrack({ track_id: track.track_id, friend_id: track.friend_id, star_rating: value });
  };

  const genreLookup = useGenreLookup();
  const displayGenres = discogsGenreBadges(track.genres, genreLookup);
  const displayStyles = discogsGenreBadges(track.styles, genreLookup);
  const displayLocalTags = trackGenreBadges(track, genreLookup);

  const artworkSize = { base: "60px", md: "68px", lg: "76px" };

  // --- Album art block (shared) ---
  const artworkBlock = (
    <Box position="relative" flexShrink={0} width={artworkSize} height={artworkSize}>
      {track.local_audio_url ? (
        <Box
          position="relative"
          borderRadius="md"
          overflow="hidden"
          cursor="pointer"
          width="100%"
          height="100%"
          tabIndex={0}
          onClick={() => replacePlaylist([track], { autoplay: true, startIndex: 0 })}
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
            onError={() => setImageError(true)}
          />
          <Box
            className="overlay"
            position="absolute"
            top={0} left={0} right={0} bottom={0}
            display="flex" alignItems="center" justifyContent="center"
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
          onError={() => setImageError(true)}
        />
      )}
    </Box>
  );

  // --- Details row (shared) ---
  const detailsRow = showDetails && (
    <Flex gap={3} fontSize="xs" flexWrap="wrap" alignItems="center" color="gray.500" mt={0.5}>
      {playlistMode && !hasEmbedding && (
        <Badge colorPalette="red" size="sm">No embedding</Badge>
      )}
      {playlistMode && !hasBpm && (
        <Badge colorPalette="orange" size="sm">No BPM</Badge>
      )}
      {track.library_identifier && (
        <Badge colorPalette="blue" size="sm" fontWeight="bold">{track.library_identifier}</Badge>
      )}
      {sortPositionChange && (
        <Badge colorPalette="purple" size="sm">
          #{sortPositionChange.currentPosition} was #{sortPositionChange.previousPosition}
        </Badge>
      )}
      {track.position && (
        <Text color="gray.400" display={{ base: "none", md: "block" }}>{track.position}</Text>
      )}
      {getTrackDurationSeconds(track) && (
        <Text>{formatSeconds(getTrackDurationSeconds(track) || 0)}</Text>
      )}
      {track.bpm && <Text>{track.bpm} BPM</Text>}
      {track.key && (
        <Text display={{ base: "none", md: "block" }}>
          {track.key} ({keyToCamelot(track.key)})
        </Text>
      )}
      {showNotes && (
        <Box display={{ base: "none", md: "contents" }}>
        <Popover.Root>
          <Popover.Trigger asChild>
            <Box
              as="button"
              display="flex"
              alignItems="center"
              color={hasNotes ? "yellow.400" : "gray.300"}
              cursor={hasNotes ? "pointer" : "default"}
              pointerEvents={hasNotes ? "auto" : "none"}
              _hover={hasNotes ? { color: "yellow.300" } : undefined}
            >
              <FiFileText size={13} />
            </Box>
          </Popover.Trigger>
          {hasNotes && (
            <Popover.Positioner>
              <Popover.Content maxW="320px">
                <Popover.Body>
                  <Text fontSize="sm" whiteSpace="pre-wrap">{track.notes}</Text>
                </Popover.Body>
              </Popover.Content>
            </Popover.Positioner>
          )}
        </Popover.Root>
        </Box>
      )}
    </Flex>
  );

  // --- Main content rows (shared) ---
  const score = track._semanticScore !== undefined ? track._semanticScore * 100 : undefined;

  const mainContent = (
    <Flex direction="column" gap={1}>
      {/* Title */}
      <Flex alignItems="baseline" gap={2} pr={10}>
        <Text
          fontSize={{ base: "md", md: playlistMode ? "lg" : "xl" }}
          fontWeight={playlistMode ? "semibold" : "bold"}
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
          flex="1 1 auto"
          minW={0}
        >
          <Link
            as={NextLink}
            href={trackHref}
            display="block"
            overflow="hidden"
            textOverflow="ellipsis"
            whiteSpace="nowrap"
            onMouseDown={playlistMode ? (e) => e.stopPropagation() : undefined}
            onPointerDown={playlistMode ? (e) => e.stopPropagation() : undefined}
            _hover={{ textDecoration: "underline" }}
          >
            {track.title}
          </Link>
          {score && (
            <Badge
              ml={2}
              colorPalette={score > 90 ? "green" : score > 75 ? "yellow" : "red"}
              size="sm"
            >
              {score.toFixed(1)}%
            </Badge>
          )}
        </Text>
      </Flex>

      {/* Artist + rating */}
      <Flex
        gap={2}
        alignItems="center"
        flexWrap={{ base: "nowrap", md: "wrap" }}
        pr={10}
        overflow="hidden"
      >
        <Box flex="1 1 auto" minW={0} overflow="hidden">
          <ArtistLink artist={track.artist} friendId={track.friend_id}>
            <Text
              fontSize={{ base: "sm", md: "md" }}
              fontWeight="medium"
              overflow="hidden"
              textOverflow="ellipsis"
              whiteSpace="nowrap"
            >
              {track.artist}
            </Text>
          </ArtistLink>
        </Box>
        {showRating && (
          <RatingGroup.Root
            value={localRating}
            onValueChange={(details) => handleRatingChange(details.value)}
            count={5}
            size="xs"
            flexShrink={0}
            display={playlistMode ? { base: "none", md: "inline-flex" } : undefined}
          >
            {[1, 2, 3, 4, 5].map((index) => (
              <RatingGroup.Item key={index} index={index}>
                <RatingGroup.ItemIndicator />
              </RatingGroup.Item>
            ))}
          </RatingGroup.Root>
        )}
      </Flex>

      {/* Album + secondary meta */}
      <Flex
        gap={2}
        fontSize={{ base: "sm", md: "md" }}
        color="gray.500"
        alignItems="center"
        flexWrap={{ base: "nowrap", md: "wrap" }}
        pr={10}
        overflow="hidden"
      >
        <Box
          flex={1}
          minW={0}
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
        >
          <AlbumLink releaseId={track.release_id} friendId={track.friend_id}>
            <Text
              as="span"
              display="block"
              overflow="hidden"
              textOverflow="ellipsis"
              whiteSpace="nowrap"
            >
              {track.album}
              {track.year && ` (${track.year})`}
            </Text>
          </AlbumLink>
        </Box>
        {showUsername && track.username && (
          <>
            <Text color="gray.400" flexShrink={0} display={playlistMode ? { base: "none", md: "block" } : undefined}>·</Text>
            <Text color="gray.400" flexShrink={0} display={playlistMode ? { base: "none", md: "block" } : undefined}>{track.username}</Text>
          </>
        )}
        {showPlaylistCount && typeof playlistCount === "number" && playlistCount > 0 && (
          <>
            <Text color="gray.400" flexShrink={0}>·</Text>
            <TrackPlaylistUsage track={track} count={playlistCount} />
          </>
        )}
      </Flex>

      {playlistMode && (showRating || (showUsername && track.username)) && (
        <Flex
          display={{ base: "flex", md: "none" }}
          alignItems="center"
          gap={2}
          pr={10}
          minH="20px"
        >
          {showRating && (
            <RatingGroup.Root
              value={localRating}
              onValueChange={(details) => handleRatingChange(details.value)}
              count={5}
              size="xs"
              flexShrink={0}
            >
              {[1, 2, 3, 4, 5].map((index) => (
                <RatingGroup.Item key={`mobile-${index}`} index={index}>
                  <RatingGroup.ItemIndicator />
                </RatingGroup.Item>
              ))}
            </RatingGroup.Root>
          )}
          {showUsername && track.username && (
            <Text fontSize="xs" color="gray.400" lineClamp={1}>
              {track.username}
            </Text>
          )}
        </Flex>
      )}

      {detailsRow}

      {/* Genres/Styles/Tags — desktop only, non-playlist mode */}
      {!playlistMode && showGenres &&
        (displayGenres.length > 0 ||
          displayStyles.length > 0 ||
          displayLocalTags.length > 0) && (
        <Flex gap={2} flexWrap="wrap" display={{ base: "none", md: "flex" }} mt={0.5}>
          <GenreBadgeList items={displayGenres} kind="discogs-genre" scope="tracks" />
          <GenreBadgeList items={displayStyles} kind="discogs-style" scope="tracks" />
          <GenreBadgeList items={displayLocalTags} kind="track" scope="tracks" />
        </Flex>
      )}
    </Flex>
  );

  const playlistContent = (
    <Flex direction="column" gap={{ base: 1, md: 1.5 }} minW={0}>
      <Flex alignItems="center" gap={2} pr={{ base: 14, lg: 24 }}>
        <Text
          fontSize={{ base: "sm", md: "lg" }}
          fontWeight="bold"
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
          flex="1 1 auto"
          minW={0}
        >
          <Link
            as={NextLink}
            href={trackHref}
            display="block"
            overflow="hidden"
            textOverflow="ellipsis"
            whiteSpace="nowrap"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            _hover={{ textDecoration: "underline" }}
          >
            {track.title}
          </Link>
          {score && (
            <Badge
              ml={2}
              colorPalette={score > 90 ? "green" : score > 75 ? "yellow" : "red"}
              size="sm"
            >
              {score.toFixed(1)}%
            </Badge>
          )}
        </Text>
      </Flex>

      <ArtistLink artist={track.artist} friendId={track.friend_id}>
        <Text
          fontSize={{ base: "xs", md: "sm" }}
          fontWeight="medium"
          color="gray.600"
          lineClamp={1}
        >
          {track.artist}
        </Text>
      </ArtistLink>

      <Flex
        gap={2}
        fontSize="xs"
        color="gray.500"
        alignItems="center"
        flexWrap={{ base: "wrap", md: "nowrap" }}
        minW={0}
      >
        <Box minW={0} flex="1 1 auto" overflow="hidden">
          <AlbumLink releaseId={track.release_id} friendId={track.friend_id}>
            <Text
              as="span"
              display="block"
              overflow="hidden"
              textOverflow="ellipsis"
              whiteSpace="nowrap"
            >
              {track.album}
              {track.year && ` (${track.year})`}
            </Text>
          </AlbumLink>
        </Box>
        {showUsername && track.username && (
          <>
            <Text color="gray.400" flexShrink={0}>·</Text>
            <Text flexShrink={0}>{track.username}</Text>
          </>
        )}
      </Flex>

      <Flex
        gap={3}
        fontSize="xs"
        flexWrap={{ base: "wrap", md: "nowrap" }}
        alignItems="center"
        color="gray.500"
        mt={0.5}
        minW={0}
        overflow="hidden"
      >
        {showRating && (
          <RatingGroup.Root
            value={localRating}
            onValueChange={(details) => handleRatingChange(details.value)}
            count={5}
            size="xs"
            flexShrink={0}
          >
            {[1, 2, 3, 4, 5].map((index) => (
              <RatingGroup.Item key={`playlist-${index}`} index={index}>
                <RatingGroup.ItemIndicator />
              </RatingGroup.Item>
            ))}
          </RatingGroup.Root>
        )}
        {!hasEmbedding && (
          <Badge colorPalette="red" size="sm" flexShrink={0}>No embedding</Badge>
        )}
        {!hasBpm && (
          <Badge colorPalette="orange" size="sm" flexShrink={0}>No BPM</Badge>
        )}
        {track.library_identifier && (
          <Text color="blue.600" fontWeight="bold" flexShrink={0}>
            {track.library_identifier}
          </Text>
        )}
        {sortPositionChange && (
          <Badge colorPalette="purple" size="sm" flexShrink={0}>
            #{sortPositionChange.currentPosition} was #{sortPositionChange.previousPosition}
          </Badge>
        )}
        {track.position && (
          <Text color="gray.400" flexShrink={0}>{track.position}</Text>
        )}
        {getTrackDurationSeconds(track) && (
          <Text flexShrink={0}>{formatSeconds(getTrackDurationSeconds(track) || 0)}</Text>
        )}
        {track.bpm && <Text flexShrink={0}>{track.bpm} BPM</Text>}
        {track.key && (
          <Text display={{ base: "none", md: "block" }} flexShrink={0}>
            {track.key} ({keyToCamelot(track.key)})
          </Text>
        )}
        {showNotes && (
          <Box display={{ base: "none", md: "contents" }}>
            <Popover.Root>
              <Popover.Trigger asChild>
                <Box
                  as="button"
                  display="flex"
                  alignItems="center"
                  color={hasNotes ? "yellow.400" : "gray.300"}
                  cursor={hasNotes ? "pointer" : "default"}
                  pointerEvents={hasNotes ? "auto" : "none"}
                  _hover={hasNotes ? { color: "yellow.300" } : undefined}
                >
                  <FiFileText size={14} />
                </Box>
              </Popover.Trigger>
              {hasNotes && (
                <Popover.Positioner>
                  <Popover.Content maxW="320px">
                    <Popover.Body>
                      <Text fontSize="sm" whiteSpace="pre-wrap">{track.notes}</Text>
                    </Popover.Body>
                  </Popover.Content>
                </Popover.Positioner>
              )}
            </Popover.Root>
          </Box>
        )}
      </Flex>

      {/* The track's DJ genres, on screens that opt in (search). */}
      {showTrackGenres && displayLocalTags.length > 0 && (
        <Flex gap={1.5} flexWrap="wrap" mt={0.5} data-testid="track-genres">
          <GenreBadgeList items={displayLocalTags} kind="track" scope="tracks" />
        </Flex>
      )}

      {footer && <Box mt={1}>{footer}</Box>}
    </Flex>
  );

  // ---- PLAYLIST MODE ----
  if (playlistMode) {
    return (
      <Flex
        borderWidth="1px"
        borderLeftWidth={hasDataIssue ? "3px" : "1px"}
        borderLeftColor={hasDataIssue ? "red.400" : undefined}
        borderRadius="md"
        mb={3}
        py={[2.5, 3]}
        px={3}
        gap={3}
        position="relative"
        width="100%"
        borderColor={isSelected ? "blue.500" : undefined}
        bg={hasDataIssue ? "red.50" : undefined}
        _dark={{ bg: hasDataIssue ? "red.900" : undefined }}
        _hover={{ bg: hasDataIssue ? undefined : "bg.muted" }}
      >
        {onToggleSelect && (
          <Box flexShrink={0} alignSelf="center" onClick={(e) => e.stopPropagation()}>
            <Checkbox.Root checked={isSelected} onChange={onToggleSelect}>
              <Checkbox.HiddenInput />
              <Checkbox.Control />
            </Checkbox.Root>
          </Box>
        )}
        {artworkBlock}
        <Flex direction="column" flex={1} minW={0}>
          {playlistContent}
        </Flex>
        <Flex position="absolute" top={2} right={2} gap={1} alignItems="center">
          {buttons}
        </Flex>
      </Flex>
    );
  }

  // ---- EXPANDED / DEFAULT VIEW ----
  return (
    <Flex
      borderWidth="1px"
      borderRadius="md"
      py={[2.5, 3]}
      px={3}
      mb={2}
      gap={3}
      position="relative"
      width="100%"
      borderColor={isSelected ? "blue.500" : undefined}
    >
      {onToggleSelect && (
        <Box flexShrink={0} alignSelf="center" onClick={(e) => e.stopPropagation()}>
          <Checkbox.Root checked={isSelected} onChange={onToggleSelect}>
            <Checkbox.HiddenInput />
            <Checkbox.Control />
          </Checkbox.Root>
        </Box>
      )}
      {artworkBlock}
      <Flex direction="column" flex={1} minW={0}>
        {mainContent}
        {footer && <Box mt={1}>{footer}</Box>}
      </Flex>
      <Flex position="absolute" top={2} right={2} gap={1} alignItems="center">
        {buttons}
      </Flex>
    </Flex>
  );
}

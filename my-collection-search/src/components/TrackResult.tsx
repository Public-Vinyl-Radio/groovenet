"use client";
import React, { useState } from "react";
import NextLink from "next/link";
import ArtistLink from "./ArtistLink";
import AlbumLink from "./AlbumLink";
import TrackPlaylistUsage from "./TrackPlaylistUsage";
import {
  Box,
  Flex,
  Grid,
  Text,
  Link,
  Image,
  Icon,
  RatingGroup,
  Badge,
  Checkbox,
  Popover,
  Portal,
} from "@chakra-ui/react";
import { Track } from "@/types/track";
import { FaPlay } from "react-icons/fa";
import { FiFileText, FiPlus } from "react-icons/fi";
import { keyToCamelot } from "@/lib/playlistOrder";
import { camelotDotColor } from "@/lib/mixCompat";
import { formatBpmConfidencePercent, isBpmConfidenceLow } from "@/lib/essentiaBpm";
import { formatKeyConfidencePercent, isKeyConfidenceLow } from "@/lib/essentiaKey";
import { getTrackDurationSeconds } from "@/lib/trackUtils";
import {
  discogsGenreBadges,
  primaryGenreBadges,
  trackGenreBadges,
  type GenreBadgeItem,
} from "@/lib/genres/links";
import { useGenreLookup } from "@/hooks/useGenreTaxonomyQuery";
import { GenreBadgeList, GenreBadgeRow, type GenreBadgeKind } from "./GenreBadge";
import { TrackCardContext } from "./trackCardContext";
import { usePlaybackPlayer } from "@/providers/PlaybackTargetProvider";
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

// Artwork (left) and actions (right) sit outside the grid, as plain flex items that
// never shrink — the grid in between holds everything squeezable (title through
// rating) and is the only part allowed to clip when a row doesn't have full width.
// That guarantees the "more actions" menu is never pushed off-screen by a narrow
// container; the Rate/Genre/Key columns degrade instead.
export const TRACK_ROW_EDGE_WIDTH = "44px";
/**
 * The full grid every `layout="row"` track shares with `TrackListHeader`, so columns never drift apart.
 * Track, Release, Time, BPM / Key, Genre, Rating.
 */
export const TRACK_ROW_GRID_TEMPLATE =
  "minmax(200px, 2fr) 112px 48px 112px minmax(168px, 1.4fr) 76px";
const TRACK_ROW_GRID_BASE = "minmax(150px, 2fr) 112px 48px 56px";
const TRACK_ROW_GRID_WITH_KEY = "minmax(150px, 2fr) 112px 48px 112px";
/** Width of the list block at which the key joins BPM, then Genre and Rating have room to show. */
const TRACK_ROW_KEY_MIN_WIDTH = "780px";
const TRACK_ROW_FULL_MIN_WIDTH = "1040px";

/**
 * Styles for the grid in a row and in the header. Columns drop off the right as the
 * list block (a `container-type: inline-size` ancestor) narrows, rather than being
 * cut mid-cell: below 780px the key (beside BPM), Genre and Rating go, below 1040px Genre and Rating.
 */
export const trackRowGridCss = {
  gridTemplateColumns: TRACK_ROW_GRID_BASE,
  "& [data-col]": { display: "none" },
  [`@container (min-width: ${TRACK_ROW_KEY_MIN_WIDTH})`]: {
    gridTemplateColumns: TRACK_ROW_GRID_WITH_KEY,
    "& [data-col=key]": { display: "contents" },
  },
  [`@container (min-width: ${TRACK_ROW_FULL_MIN_WIDTH})`]: {
    gridTemplateColumns: TRACK_ROW_GRID_TEMPLATE,
    "& [data-col=key]": { display: "contents" },
    "& [data-col=genre]": { display: "block" },
    "& [data-col=rating]": { display: "flex" },
  },
};
/** Three lines (title, artist, album) plus padding; also the virtualiser's `estimateSize`. */
export const TRACK_ROW_HEIGHT = 80;

export type TrackResultProps = {
  track: Track | (Track & { camelot_key?: string });
  buttons?: React.ReactNode;
  footer?: React.ReactNode;
  playlistCount?: number;
  showUsername?: boolean;
  showRating?: boolean;
  showDetails?: boolean;
  showGenres?: boolean;
  showNotes?: boolean;
  showPlaylistCount?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  /**
   * "card" (default): the artwork-forward card used everywhere a track is shown.
   * "row": the dense, grid-aligned desktop row used by the main search results
   * list (paired with `TrackListHeader`).
   */
  layout?: "row" | "card";
  /** "standard" (default) or the lower-height presentation used in jobs and queues. */
  density?: "standard" | "dense";
  /** Called when a dense row is clicked (used by the queue to play that track). */
  onRowClick?: () => void;
  sortPositionChange?: SortPositionChange;
  /** 1-based place in an ordered list (a playlist); shown at the start of the Release cell in `layout="row"`. */
  listPosition?: number;
};

/** Header for `layout="row"`: same column template as each row, rendered once above the list. */
export function TrackListHeader() {
  return (
    <Flex
      align="center"
      gap={4}
      height="36px"
      px={4}
      bg="bg.subtle"
      borderBottomWidth="1px"
      borderColor="border"
      fontSize="11px"
      lineHeight="16px"
      fontFamily="label"
      letterSpacing="0.08em"
      textTransform="uppercase"
      color="fg.muted"
      minW={0}
    >
      <Box aria-hidden="true" flexShrink={0} w={TRACK_ROW_EDGE_WIDTH} />
      <Grid
        css={trackRowGridCss}
        columnGap={4}
        alignItems="center"
        flex="1"
        minW={0}
        overflow="hidden"
      >
        <Text>Track</Text>
        <Text>Release</Text>
        <Text textAlign="right">Time</Text>
        <Text>
          BPM<span data-col="key"> / Key</span>
        </Text>
        <Text data-col="genre">Genre</Text>
        <Text data-col="rating">Rating</Text>
      </Grid>
      <Box aria-hidden="true" flexShrink={0} minW="80px" />
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** Camelot code bold, key name muted, optional dot coloured by wheel position. */
export function KeyChip({
  keyName,
  camelot,
  keyConfidence,
  showName = true,
}: {
  keyName?: string | null;
  camelot: string;
  keyConfidence?: number | null;
  /** False in the dense row, where the Camelot code stands for the key and the name is a tooltip. */
  showName?: boolean;
}) {
  if (!keyName || !camelot || camelot === "-") {
    return (
      <Text fontSize="sm" color="fg.subtle">
        —
      </Text>
    );
  }
  return (
    <Flex
      display="inline-flex"
      alignItems="center"
      gap={1.5}
      h="24px"
      px={2}
      borderRadius="sm"
      bg="bg.muted"
      borderWidth="1px"
      borderColor="border"
      whiteSpace="nowrap"
      minW={0}
      maxW="100%"
      justifySelf="start"
      title={showName ? undefined : keyName}
    >
      <Box
        aria-hidden="true"
        boxSize="8px"
        borderRadius="full"
        bg={camelotDotColor(camelot)}
        flexShrink={0}
      />
      <Text
        as="span"
        fontSize="xs"
        fontWeight="bold"
        color="fg"
        fontVariantNumeric="tabular-nums"
        flexShrink={0}
      >
        {camelot}
      </Text>
      {showName && (
        <Text
          as="span"
          fontSize="xs"
          color="fg.muted"
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
          minW={0}
          title={keyName}
        >
          {keyName}
        </Text>
      )}
      {typeof keyConfidence === "number" && (
        <KeyConfidenceIndicator keyConfidence={keyConfidence} />
      )}
    </Flex>
  );
}

/**
 * Trigger that always reveals a confidence on click — an orange "!" below the
 * low threshold, a neutral "i" above it. Showing the number is the point: a
 * confident estimate used to look identical to a dubious one with nothing to
 * click at all (#524, #531). `subject` is "key" or "BPM".
 */
function ConfidenceIndicator({
  subject,
  low,
  percent,
}: {
  subject: "key" | "BPM";
  low: boolean;
  percent: number | null;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Box
          as="button"
          display="inline-flex"
          alignItems="center"
          flexShrink={0}
          color={low ? "fg.warning" : "fg.subtle"}
          _hover={{ color: low ? "fg.warning" : "fg.muted" }}
          aria-label={
            low ? `Uncertain ${subject}` : `${subject === "key" ? "Key" : "BPM"} confidence`
          }
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <Text as="span" fontSize="xs" fontWeight="bold">
            {low ? "!" : "i"}
          </Text>
        </Box>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content maxW="260px">
            <Popover.Body>
              <Text fontSize="sm">
                {low
                  ? `Uncertain ${subject} — Essentia's estimate is only ${percent}% confident. Worth a listen before trusting it.`
                  : `${percent}% confident in this ${subject}.`}
              </Text>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

function KeyConfidenceIndicator({ keyConfidence }: { keyConfidence: number }) {
  return (
    <ConfidenceIndicator
      subject="key"
      low={isKeyConfidenceLow(keyConfidence)}
      percent={formatKeyConfidencePercent(keyConfidence)}
    />
  );
}

/** Bold, tabular-nums BPM; an orange "No BPM" badge when there's none. */
function BpmValue({
  bpm,
  bpmConfidence,
  align = "right",
}: {
  bpm?: string | number | null;
  bpmConfidence?: number | null;
  align?: "left" | "right";
}) {
  const num = typeof bpm === "number" ? bpm : parseFloat(bpm ?? "");
  const hasBpm = Number.isFinite(num) && num > 0;
  if (!hasBpm) {
    return (
      <Badge colorPalette="status.analysis" variant="subtle" size="sm" whiteSpace="nowrap">
        No BPM
      </Badge>
    );
  }
  return (
    <Flex
      display="inline-flex"
      alignItems="center"
      gap={1}
      justifyContent={align === "right" ? "flex-end" : "flex-start"}
    >
      <Text fontSize="sm" fontWeight="semibold" fontVariantNumeric="tabular-nums" textAlign={align}>
        {num}
      </Text>
      {typeof bpmConfidence === "number" && (
        <ConfidenceIndicator
          subject="BPM"
          low={isBpmConfidenceLow(bpmConfidence)}
          percent={formatBpmConfidencePercent(bpmConfidence)}
        />
      )}
    </Flex>
  );
}

/** Up to `max` purple-subtle genre badges, plus a "+N" overflow badge. */
function GenreList({
  items,
  kind,
  max = 2,
  wrap = false,
}: {
  items: GenreBadgeItem[];
  kind: GenreBadgeKind;
  max?: number;
  /** Wrap onto more lines instead of shrinking a tag to an ellipsis (the card has the height). */
  wrap?: boolean;
}) {
  if (items.length === 0) return null;
  const shown = items.slice(0, max);
  const overflow = items.length - shown.length;
  return (
    <Flex
      gap={1.5}
      alignItems="center"
      overflow="hidden"
      minW={0}
      flexWrap={wrap ? "wrap" : "nowrap"}
      data-testid="track-genres"
      // A tag shrinks and ends in an ellipsis rather than being cut mid-letter.
      css={{
        "& > a, & > span:not([data-overflow])": {
          display: "block",
          minWidth: 0,
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        },
      }}
    >
      <GenreBadgeList
        items={shown}
        kind={kind}
        scope="tracks"
        colorPalette="status.genre"
        variant="subtle"
      />
      {overflow > 0 && (
        <Badge data-overflow="" size="sm" variant="subtle" colorPalette="neutral" flexShrink={0}>
          +{overflow}
        </Badge>
      )}
    </Flex>
  );
}

/** Star rating: hidden unless rated or the ancestor row/card carries the hover class. */
export function RatingStars({
  value,
  onChange,
  size = "xs",
}: {
  value: number;
  onChange: (value: number) => void;
  size?: "xs" | "sm";
}) {
  const rated = value > 0;
  return (
    <RatingGroup.Root
      value={value}
      onValueChange={(details) => onChange(details.value)}
      count={5}
      size={size}
      className="track-result-rating"
      opacity={rated ? 1 : 0}
      transition="opacity 0.12s ease"
      aria-label={rated ? `Rated ${value} of 5` : "Not rated"}
    >
      {[1, 2, 3, 4, 5].map((index) => (
        <RatingGroup.Item key={index} index={index}>
          <RatingGroup.ItemIndicator />
        </RatingGroup.Item>
      ))}
    </RatingGroup.Root>
  );
}

/** The whole artwork is a real `<button aria-label="Play">`; a dark scrim + play icon on hover/focus. */
export function ArtworkPlay({
  track,
  size,
  iconSize,
}: {
  track: Track;
  size: string | { base: string; md: string };
  iconSize: number;
}) {
  const [imageError, setImageError] = useState(false);
  const { replacePlaylist } = usePlaybackPlayer();

  React.useEffect(() => {
    setImageError(false);
  }, [track.track_id, track.audio_file_album_art_url, track.album_thumbnail]);

  const artworkSrc = imageError
    ? PLACEHOLDER_SRC
    : track.audio_file_album_art_url || track.album_thumbnail || PLACEHOLDER_SRC;

  if (!track.local_audio_url) {
    return (
      <Box
        position="relative"
        flexShrink={0}
        width={size}
        height={size}
        borderRadius="md"
        overflow="hidden"
      >
        <Image
          src={artworkSrc}
          alt=""
          width="100%"
          height="100%"
          objectFit="cover"
          draggable={false}
          onError={() => setImageError(true)}
        />
      </Box>
    );
  }

  return (
    <Box
      as="button"
      aria-label="Play"
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        replacePlaylist([track], { autoplay: true, startIndex: 0 });
      }}
      onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
      position="relative"
      flexShrink={0}
      width={size}
      height={size}
      borderRadius="md"
      overflow="hidden"
      p={0}
      border="none"
      bg="transparent"
      cursor="pointer"
      _hover={{ "& .artwork-play-scrim": { opacity: 1 } }}
      _focusVisible={{
        "& .artwork-play-scrim": { opacity: 1 },
        outline: "2px solid",
        outlineColor: "accent.focusRing",
      }}
    >
      <Image
        src={artworkSrc}
        alt=""
        width="100%"
        height="100%"
        objectFit="cover"
        draggable={false}
        onError={() => setImageError(true)}
      />
      <Box
        className="artwork-play-scrim"
        position="absolute"
        inset={0}
        display="flex"
        alignItems="center"
        justifyContent="center"
        bg="overlay.scrim"
        opacity={0}
        transition="opacity 0.15s ease"
        pointerEvents="none"
      >
        <Icon as={FaPlay} boxSize={iconSize} color="overlay.fg" />
      </Box>
    </Box>
  );
}

/** Notes icon (yellow-400), shown only when the track actually has notes; click to read them. */
export function NotesIndicator({ notes }: { notes: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Box
          as="button"
          display="inline-flex"
          alignItems="center"
          flexShrink={0}
          color="fg.warning"
          _hover={{ color: "fg.warning" }}
          aria-label="Has notes"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <FiFileText size={13} />
        </Box>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content maxW="320px">
            <Popover.Body>
              <Text fontSize="sm" whiteSpace="pre-wrap">
                {notes}
              </Text>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

/** Quick "add to the play queue" action, revealed on row/card hover (`_hover`/`_focusWithin`). */
function AddToCrateButton({ track }: { track: Track }) {
  const { appendToQueue } = usePlaybackPlayer();
  return (
    <Box
      as="button"
      aria-label="Add to crate"
      className="track-result-quick-add"
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        appendToQueue(track);
      }}
      onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
      opacity={0}
      transition="opacity 0.12s ease"
      display="flex"
      alignItems="center"
      justifyContent="center"
      w="36px"
      h="36px"
      borderRadius="md"
      border="none"
      bg="transparent"
      color="fg.muted"
      cursor="pointer"
      _hover={{ bg: "bg.muted", color: "fg" }}
    >
      <Icon as={FiPlus} boxSize={4} />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// TrackResult
// ---------------------------------------------------------------------------

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
  layout = "card",
  density = "standard",
  onRowClick,
  sortPositionChange,
  listPosition,
}: TrackResultProps) {
  const [localRating, setLocalRating] = useState(track.star_rating ?? 0);
  const { saveTrack } = useTracksQuery();

  React.useEffect(() => {
    setLocalRating(track.star_rating ?? 0);
  }, [track.star_rating]);

  const trackHref = `/tracks/${encodeURIComponent(track.track_id)}?friend_id=${track.friend_id}`;
  const hasNotes = Boolean(track.notes?.trim());

  // Data quality indicators. `hasVectors === undefined` means the endpoint
  // didn't report it, not that the track lacks one.
  const missingEmbedding = track.hasVectors === false;
  const bpmNum = typeof track.bpm === "number" ? track.bpm : parseFloat(track.bpm as string);
  const hasBpm = Number.isFinite(bpmNum) && bpmNum > 0;
  const hasDataIssue = missingEmbedding || !hasBpm;

  const handleRatingChange = (value: number) => {
    setLocalRating(value);
    saveTrack({ track_id: track.track_id, friend_id: track.friend_id, star_rating: value });
  };

  const genreLookup = useGenreLookup();
  const genreBadges = primaryGenreBadges(track, genreLookup);
  const discogsGenres = discogsGenreBadges(track.album_genres ?? track.genres, genreLookup);
  const discogsStyles = discogsGenreBadges(track.album_styles ?? track.styles, genreLookup);
  const trackGenres = trackGenreBadges(track, genreLookup);

  const camelot = keyToCamelot(track.key);
  const durationSeconds = getTrackDurationSeconds(track);
  const score = track._semanticScore !== undefined ? track._semanticScore * 100 : undefined;

  const albumLine = [track.album, track.year].filter(Boolean).join(" · ");

  // In the row the position joins the identifier as one tag ("LP-347-B1"); the card lists them apart.
  const libraryLabel =
    layout === "row" && track.position
      ? `${track.library_identifier}-${track.position}`
      : track.library_identifier;

  const metaExtras: React.ReactNode[] = [];
  if (track.library_identifier) {
    metaExtras.push(
      <Badge
        key="lib"
        colorPalette="accent"
        size="sm"
        fontWeight="bold"
        flexShrink={0}
        whiteSpace="nowrap"
      >
        {libraryLabel}
      </Badge>,
    );
  }
  if (sortPositionChange) {
    metaExtras.push(
      <Badge key="sort" colorPalette="status.genre" size="sm" flexShrink={0}>
        #{sortPositionChange.currentPosition} was #{sortPositionChange.previousPosition}
      </Badge>,
    );
  }
  // No separate "No embedding" badge: it has nowhere to go without crowding the
  // album cell (#TrackResult row-layout), and the red data-issue styling below
  // already flags it — missingEmbedding still drives hasDataIssue.
  if (showUsername && track.username) {
    metaExtras.push(
      <Text key="username" color="fg.subtle" flexShrink={0}>
        {track.username}
      </Text>,
    );
  }
  if (showPlaylistCount && typeof playlistCount === "number" && playlistCount > 0) {
    metaExtras.push(<TrackPlaylistUsage key="playlists" track={track} count={playlistCount} />);
  }

  const containerHoverReveal = {
    "& .track-result-quick-add": { opacity: 1 },
    "& .track-result-rating": { opacity: 1 },
  };

  const stopRowEvent = (event: React.SyntheticEvent) => event.stopPropagation();

  if (density === "dense" && layout === "row") {
    return (
      <Flex
        data-testid="track-result-dense-row"
        role="group"
        aria-label={`Queue item: ${track.title} by ${track.artist}`}
        tabIndex={onRowClick ? 0 : undefined}
        onClick={onRowClick}
        onKeyDown={(event) => {
          if (
            onRowClick &&
            event.target === event.currentTarget &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();
            onRowClick();
          }
        }}
        align="center"
        gap={3}
        py={1.25}
        px={1}
        mb={1}
        borderBottomWidth="1px"
        borderColor="border"
        width="100%"
        minW={0}
        cursor={onRowClick ? "pointer" : "default"}
        _hover={{ bg: "bg.muted", ...containerHoverReveal }}
        _focusVisible={{
          outline: "2px solid",
          outlineColor: "accent.solid",
          outlineOffset: "-2px",
        }}
      >
        <Box
          flexShrink={0}
          width="48px"
          height="48px"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          {onToggleSelect ? (
            <Box onMouseDown={stopRowEvent}>
              <Checkbox.Root checked={isSelected} onChange={onToggleSelect}>
                <Checkbox.HiddenInput />
                <Checkbox.Control />
              </Checkbox.Root>
            </Box>
          ) : (
            <ArtworkPlay track={track} size="48px" iconSize={5} />
          )}
        </Box>
        <Flex direction="column" flex="1" minW={0}>
          <Flex align="center" gap={1.5} minW={0}>
            <Link
              as={NextLink}
              href={trackHref}
              onClick={stopRowEvent}
              onMouseDown={stopRowEvent}
              fontSize="sm"
              fontWeight="semibold"
              lineHeight="1.2"
              overflow="hidden"
              textOverflow="ellipsis"
              whiteSpace="nowrap"
              minW={0}
              _hover={{ textDecoration: "underline" }}
            >
              {track.title}
            </Link>
            {hasNotes && showNotes && <NotesIndicator notes={track.notes as string} />}
            {showRating && (
              <Box flexShrink={0} onClick={stopRowEvent} onMouseDown={stopRowEvent}>
                <RatingStars value={localRating} onChange={handleRatingChange} />
              </Box>
            )}
          </Flex>
          <Flex gap={1.5} align="center" minW={0} overflow="hidden" fontSize="xs" color="fg.muted">
            <ArtistLink artist={track.artist} friendId={track.friend_id}>
              <Text
                as="span"
                onClick={stopRowEvent}
                onMouseDown={stopRowEvent}
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
              >
                {track.artist}
              </Text>
            </ArtistLink>
            <Text aria-hidden="true" color="fg.subtle">
              ·
            </Text>
            <AlbumLink releaseId={track.release_id} friendId={track.friend_id}>
              <Text
                as="span"
                onClick={stopRowEvent}
                onMouseDown={stopRowEvent}
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
              >
                {track.album}
              </Text>
            </AlbumLink>
            {showUsername && track.username && (
              <Text flexShrink={0} color="fg.subtle">
                {track.username}
              </Text>
            )}
            {showPlaylistCount && typeof playlistCount === "number" && playlistCount > 0 && (
              <Box flexShrink={0} onClick={stopRowEvent} onMouseDown={stopRowEvent}>
                <TrackPlaylistUsage track={track} count={playlistCount} />
              </Box>
            )}
          </Flex>
          {showGenres &&
            (discogsGenres.length > 0 || discogsStyles.length > 0 || trackGenres.length > 0) && (
              <Flex
                gap={1.5}
                alignItems="center"
                flexWrap="nowrap"
                overflow="hidden"
                data-testid="track-genres"
                onClick={stopRowEvent}
                onMouseDown={stopRowEvent}
              >
                <GenreBadgeList
                  items={discogsGenres.slice(0, 4)}
                  kind="discogs-genre"
                  scope="tracks"
                  size="xs"
                />
                <GenreBadgeList
                  items={discogsStyles.slice(0, 4)}
                  kind="discogs-style"
                  scope="tracks"
                  size="xs"
                />
                <GenreBadgeList
                  items={trackGenres}
                  kind="track"
                  scope="tracks"
                  size="xs"
                  colorPalette="accent"
                />
              </Flex>
            )}
        </Flex>
        {showDetails && durationSeconds ? (
          <Text fontSize="xs" color="fg.muted" flexShrink={0} fontVariantNumeric="tabular-nums">
            {formatSeconds(durationSeconds)}
          </Text>
        ) : null}
        <Flex
          align="center"
          gap={1}
          flexShrink={0}
          onClick={stopRowEvent}
          onMouseDown={stopRowEvent}
        >
          {buttons}
          <AddToCrateButton track={track} />
        </Flex>
      </Flex>
    );
  }

  if (density === "dense") {
    return (
      <Flex
        data-testid="track-result-dense-card"
        borderWidth={[0, "1px"]}
        borderBottomWidth="1px"
        borderRadius={[0, "md"]}
        p={[2, 3]}
        mb={2}
        gap={3}
        width="100%"
        minW={0}
        borderColor={isSelected ? "accent.border" : undefined}
        _hover={{ bg: "bg.muted", ...containerHoverReveal }}
        _focusWithin={containerHoverReveal}
      >
        {onToggleSelect && (
          <Box flexShrink={0} alignSelf="center">
            <Checkbox.Root checked={isSelected} onChange={onToggleSelect}>
              <Checkbox.HiddenInput />
              <Checkbox.Control />
            </Checkbox.Root>
          </Box>
        )}
        <ArtworkPlay track={track} size={{ base: "60px", md: "80px" }} iconSize={6} />
        <Flex direction="column" flex={1} minW={0} gap={1}>
          <Flex alignItems="center" gap={1.5} minW={0}>
            <Link
              as={NextLink}
              href={trackHref}
              title={track.title}
              fontSize={{ base: "md", md: "lg" }}
              fontWeight="bold"
              overflow="hidden"
              textOverflow="ellipsis"
              whiteSpace="nowrap"
              minW={0}
              _hover={{ textDecoration: "underline" }}
            >
              {track.title}
            </Link>
            {hasNotes && showNotes && <NotesIndicator notes={track.notes as string} />}
            {score !== undefined && (
              <Badge
                colorPalette={
                  score > 90 ? "status.success" : score > 75 ? "status.analysis" : "status.missing"
                }
                size="xs"
                flexShrink={0}
              >
                {score.toFixed(0)}%
              </Badge>
            )}
            {showRating && <RatingStars value={localRating} onChange={handleRatingChange} />}
          </Flex>
          <Flex
            gap={1.5}
            fontSize="sm"
            color="fg.muted"
            flexWrap="wrap"
            alignItems="center"
            minW={0}
          >
            <ArtistLink artist={track.artist} friendId={track.friend_id} />
            <Text aria-hidden="true" color="fg.subtle">
              ·
            </Text>
            <AlbumLink releaseId={track.release_id} friendId={track.friend_id}>
              <Text as="span">
                {track.album}
                {track.year ? ` (${track.year})` : ""}
              </Text>
            </AlbumLink>
            {showUsername && track.username && (
              <Text fontSize="xs" color="fg.subtle">
                {track.username}
              </Text>
            )}
            {showPlaylistCount && typeof playlistCount === "number" && playlistCount > 0 && (
              <TrackPlaylistUsage track={track} count={playlistCount} />
            )}
          </Flex>
          {showDetails && (
            <Flex gap={3} fontSize="xs" color="fg.muted" flexWrap="wrap" alignItems="center">
              {track.position && <Text>{track.position}</Text>}
              {durationSeconds && (
                <Text fontVariantNumeric="tabular-nums">{formatSeconds(durationSeconds)}</Text>
              )}
              {track.bpm && <Text>{track.bpm} BPM</Text>}
              {track.key && (
                <Text>
                  {track.key} ({camelot})
                </Text>
              )}
              {track.danceability && <Text>{track.danceability}</Text>}
            </Flex>
          )}
          {showGenres &&
            (discogsGenres.length > 0 || discogsStyles.length > 0 || trackGenres.length > 0) && (
              <Flex gap={1.5} alignItems="center" flexWrap="wrap" data-testid="track-genres">
                <GenreBadgeList
                  items={discogsGenres.slice(0, 4)}
                  kind="discogs-genre"
                  scope="tracks"
                  size="xs"
                />
                <GenreBadgeList
                  items={discogsStyles.slice(0, 4)}
                  kind="discogs-style"
                  scope="tracks"
                  size="xs"
                />
                <GenreBadgeList
                  items={trackGenres}
                  kind="track"
                  scope="tracks"
                  size="xs"
                  colorPalette="accent"
                />
              </Flex>
            )}
          {footer && <Box mt={1}>{footer}</Box>}
        </Flex>
        <Flex direction="column" alignItems="center" gap={0.5} flexShrink={0}>
          {buttons}
          <AddToCrateButton track={track} />
        </Flex>
      </Flex>
    );
  }

  if (layout === "row") {
    // A click on the bare row; links, buttons, popovers and portalled menus keep their own behaviour.
    const handleRowClick = onRowClick
      ? (event: React.MouseEvent<HTMLElement>) => {
          const target = event.target as HTMLElement;
          if (!event.currentTarget.contains(target)) return;
          // The drag handle around the row is itself role=button, so only look inside the row.
          const control = target.closest(
            "a,button,input,label,[role=button],[role=menuitem],[data-scope=popover]",
          );
          if (control && event.currentTarget.contains(control)) return;
          onRowClick();
        }
      : undefined;
    return (
      <Flex
        data-testid="track-result-row"
        onClick={handleRowClick}
        cursor={onRowClick ? "pointer" : undefined}
        align="center"
        gap={4}
        height={`${TRACK_ROW_HEIGHT}px`}
        px={4}
        minW={0}
        borderBottomWidth="1px"
        borderBottomColor="border"
        borderLeftWidth={hasDataIssue ? "3px" : undefined}
        borderLeftColor={hasDataIssue ? "border.error" : undefined}
        bg={hasDataIssue ? "bg.error" : isSelected ? "accent.subtle" : undefined}
        _hover={{ bg: hasDataIssue ? undefined : "bg.muted", ...containerHoverReveal }}
        _focusWithin={containerHoverReveal}
      >
        <Box flexShrink={0} w={TRACK_ROW_EDGE_WIDTH}>
          {onToggleSelect ? (
            <Box onClick={(e) => e.stopPropagation()}>
              <Checkbox.Root checked={isSelected} onChange={onToggleSelect}>
                <Checkbox.HiddenInput />
                <Checkbox.Control />
              </Checkbox.Root>
            </Box>
          ) : (
            <ArtworkPlay track={track} size="44px" iconSize={5} />
          )}
        </Box>

        {/*
          Everything squeezable lives in this grid, which is the only part allowed to
          clip (via its own overflow:hidden) when the row doesn't have full width. The
          artwork above and the actions below are plain flex items with no flex-shrink,
          so the "more actions" menu is never pushed off-screen by a narrow container.
        */}
        <Grid
          data-testid="track-row-grid"
          css={trackRowGridCss}
          columnGap={4}
          alignItems="center"
          flex="1"
          minW={0}
          overflow="hidden"
        >
          <Flex direction="column" gap={0} minW={0} overflow="hidden">
            <Flex alignItems="center" gap={1.5} minW={0}>
              <Link
                as={NextLink}
                href={trackHref}
                title={track.title}
                display="block"
                fontSize="15px"
                lineHeight="20px"
                fontWeight="600"
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
                minW={0}
                _hover={{ textDecoration: "underline" }}
              >
                {track.title}
              </Link>
              {hasNotes && showNotes && <NotesIndicator notes={track.notes as string} />}
              {score !== undefined && (
                <Badge
                  colorPalette={
                    score > 90
                      ? "status.success"
                      : score > 75
                        ? "status.analysis"
                        : "status.missing"
                  }
                  size="sm"
                  flexShrink={0}
                >
                  {score.toFixed(1)}%
                </Badge>
              )}
            </Flex>
            <ArtistLink artist={track.artist} friendId={track.friend_id}>
              <Text
                fontSize="13px"
                lineHeight="18px"
                fontWeight="500"
                color="fg.muted"
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
                title={track.artist}
              >
                {track.artist}
              </Text>
            </ArtistLink>
            <AlbumLink releaseId={track.release_id} friendId={track.friend_id}>
              <Text
                data-testid="track-album-line"
                fontSize="12px"
                lineHeight="16px"
                color="fg.subtle"
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
                title={albumLine}
              >
                {albumLine}
              </Text>
            </AlbumLink>
          </Flex>

          {/* Release: what must never clip, so it wraps instead of truncating. */}
          <Flex
            data-testid="track-release"
            minW={0}
            fontSize="13px"
            color="fg.muted"
            alignItems="center"
            gap={1}
            flexWrap="wrap"
          >
            {listPosition !== undefined && (
              <Text
                as="span"
                data-testid="track-list-position"
                fontSize="xs"
                color="fg.subtle"
                fontFamily="label"
                fontVariantNumeric="tabular-nums"
                flexShrink={0}
                title={`Position ${listPosition}`}
              >
                {listPosition}.
              </Text>
            )}
            {track.position && !track.library_identifier && (
              <Text as="span" fontSize="xs" color="fg.subtle" fontFamily="label" flexShrink={0}>
                {track.position}
              </Text>
            )}
            {metaExtras}
          </Flex>

          {showDetails ? (
            <Text
              fontSize="sm"
              color="fg.muted"
              textAlign="right"
              fontVariantNumeric="tabular-nums"
            >
              {durationSeconds ? formatSeconds(durationSeconds) : ""}
            </Text>
          ) : (
            <Box />
          )}

          {showDetails ? (
            <Flex alignItems="center" gap={2} minW={0}>
              <Flex minW="34px" flexShrink={0}>
                <BpmValue bpm={track.bpm} bpmConfidence={track.bpm_confidence} align="left" />
              </Flex>
              <Box data-col="key" minW={0}>
                <KeyChip
                  keyName={track.key}
                  camelot={camelot}
                  keyConfidence={track.key_confidence}
                  showName={false}
                />
              </Box>
            </Flex>
          ) : (
            <Box />
          )}

          {/*
            A Grid child that renders null (GenreList, for a track with no genres)
            removes the DOM node entirely, which shifts every later child left by
            one track in CSS Grid's auto-placement — this Box always renders so
            the genre cell keeps its slot in the template regardless.
          */}
          <Box data-col="genre" minW={0} overflow="hidden">
            {showGenres && <GenreList items={genreBadges.items} kind={genreBadges.kind} max={2} />}
          </Box>

          <Flex data-col="rating" gap={0.5} justifyContent="flex-start" minW={0}>
            {showRating && <RatingStars value={localRating} onChange={handleRatingChange} />}
          </Flex>
        </Grid>

        <Flex flexShrink={0} alignItems="center" justifyContent="flex-end" gap={1}>
          <AddToCrateButton track={track} />
          {buttons}
        </Flex>
      </Flex>
    );
  }

  // ---- CARD layout (default) ----
  // The library ID has its own plain-text treatment in the card's meta line.
  const cardExtras = metaExtras.filter((el) => (el as React.ReactElement).key !== "lib");
  const hasCamelot = Boolean(track.key) && Boolean(camelot) && camelot !== "-";
  const showKeyWarning =
    typeof track.key_confidence === "number" && isKeyConfidenceLow(track.key_confidence);
  const showBpmWarning =
    typeof track.bpm_confidence === "number" && isBpmConfidenceLow(track.bpm_confidence);
  const genresShown = showGenres && genreBadges.items.length > 0;

  return (
    <Flex
      data-testid="track-card"
      position="relative"
      borderWidth="outline"
      borderColor={isSelected ? "accent.border" : "border.ink"}
      boxShadow="md"
      p={3}
      gap={3}
      // Most callers stack these in a plain .map() with no wrapper gap (genres,
      // related tracks, playlist/queue views) and rely on the card to space
      // itself. A caller with its own wrapper gap (the search results grid)
      // sets rowGap to make up the difference.
      mb="14px"
      width="100%"
      minW={0}
      // A flagged track (no BPM, no embedding) keeps its tint; the outline stays ink.
      bg={hasDataIssue ? "bg.error" : undefined}
      _hover={{ bg: hasDataIssue ? undefined : "bg.muted", ...containerHoverReveal }}
      _focusWithin={containerHoverReveal}
    >
      {onToggleSelect && (
        <Box flexShrink={0} alignSelf="center" onClick={(e) => e.stopPropagation()}>
          <Checkbox.Root checked={isSelected} onChange={onToggleSelect}>
            <Checkbox.HiddenInput />
            <Checkbox.Control />
          </Checkbox.Root>
        </Box>
      )}

      <ArtworkPlay track={track} size={{ base: "64px", md: "120px" }} iconSize={7} />

      <Flex direction="column" flex={1} minW={0}>
        <Flex alignItems="flex-start" gap={2} minW={0}>
          <Flex direction="column" flex={1} minW={0}>
            <Flex alignItems="center" gap={1.5} minW={0} pr={{ base: "32px", md: 0 }}>
              <Link
                as={NextLink}
                href={trackHref}
                title={track.title}
                display="block"
                fontFamily="heading"
                fontSize={{ base: "16px", md: "20px" }}
                lineHeight={{ base: "22px", md: "28px" }}
                fontWeight="600"
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
                minW={0}
                _hover={{ textDecoration: "underline" }}
              >
                {track.title}
              </Link>
              {score !== undefined && (
                <Badge
                  colorPalette={
                    score > 90
                      ? "status.success"
                      : score > 75
                        ? "status.analysis"
                        : "status.missing"
                  }
                  size="sm"
                  flexShrink={0}
                >
                  {score.toFixed(1)}%
                </Badge>
              )}
            </Flex>
            {/* Desktop stacks artist and album; a phone has one `Artist · Album` line. */}
            <Flex
              direction={{ base: "row", md: "column" }}
              minW={0}
              pr={{ base: "32px", md: 0 }}
              fontSize={{ base: "14px", md: "16px" }}
              lineHeight={{ base: "20px", md: "24px" }}
              css={{
                "& > a": {
                  minWidth: 0,
                  display: "block",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                },
                // On a phone the artist keeps its width up to 65% of the line and the album takes the rest.
                "@media (max-width: 47.99em)": {
                  "& > a:first-of-type": { maxWidth: "65%", flex: "0 1 auto" },
                  "& > a:last-of-type": { flex: "1 1 0" },
                },
              }}
            >
              <ArtistLink artist={track.artist} friendId={track.friend_id}>
                <Text as="span" fontWeight="500" title={track.artist}>
                  {track.artist}
                </Text>
              </ArtistLink>
              {track.album && (
                <Text
                  as="span"
                  aria-hidden="true"
                  display={{ base: "inline", md: "none" }}
                  color="fg.muted"
                  mx={1}
                  flexShrink={0}
                >
                  ·
                </Text>
              )}
              <AlbumLink releaseId={track.release_id} friendId={track.friend_id}>
                <Text
                  as="span"
                  data-testid="track-album-line"
                  display="block"
                  fontSize={{ base: "inherit", md: "14px" }}
                  lineHeight={{ base: "inherit", md: "20px" }}
                  color="fg.muted"
                  overflow="hidden"
                  textOverflow="ellipsis"
                  whiteSpace="nowrap"
                  title={albumLine}
                >
                  {track.album}
                  {track.year && track.year !== "0" && (
                    <Text as="span" display={{ base: "none", md: "inline" }}>
                      {` (${track.year})`}
                    </Text>
                  )}
                </Text>
              </AlbumLink>
            </Flex>
          </Flex>

          {/*
            Desktop: a real flex sibling, so the title can never run under it. Phones:
            absolutely positioned in the corner as a 44px target, and the title and
            artist rows reserve 32px for it (the meta line below uses the full width).
          */}
          <TrackCardContext.Provider value={true}>
            <Flex
              position={{ base: "absolute", md: "static" }}
              top="2px"
              right="0"
              flexShrink={0}
              alignItems="center"
              gap={1}
              data-testid="track-card-actions"
            >
              {/* Hover affordance: desktop only, the card menu has "Add to Queue" on a phone. */}
              <Box display={{ base: "none", md: "block" }}>
                <AddToCrateButton track={track} />
              </Box>
              {buttons}
            </Flex>
          </TrackCardContext.Provider>
        </Flex>

        {showDetails && (
          <Flex
            data-testid="track-card-meta"
            flexWrap="wrap"
            alignItems="center"
            columnGap={2}
            rowGap={1}
            mt={{ base: "6px", md: 2 }}
            fontSize="xs"
            lineHeight="16px"
            color="fg.muted"
          >
            {track.library_identifier && (
              <Text
                as="span"
                fontFamily="label"
                fontWeight="bold"
                letterSpacing="0.05em"
                color="accent.fg"
                whiteSpace="nowrap"
                maxW="100%"
                overflow="hidden"
                textOverflow="ellipsis"
                title={track.library_identifier}
              >
                {track.library_identifier}
              </Text>
            )}
            {track.position && (
              <Text as="span" fontFamily="label" fontWeight="500">
                {track.position}
              </Text>
            )}
            {durationSeconds ? (
              <Text as="span" fontVariantNumeric="tabular-nums">
                {formatSeconds(durationSeconds)}
              </Text>
            ) : null}
            {hasBpm ? (
              <Flex as="span" display="inline-flex" alignItems="center" gap={1}>
                <Text as="span" fontVariantNumeric="tabular-nums">
                  {bpmNum} BPM
                </Text>
                {showBpmWarning && (
                  <ConfidenceIndicator
                    subject="BPM"
                    low
                    percent={formatBpmConfidencePercent(track.bpm_confidence as number)}
                  />
                )}
              </Flex>
            ) : (
              <Badge colorPalette="status.analysis" variant="subtle" size="sm" whiteSpace="nowrap">
                No BPM
              </Badge>
            )}
            {hasCamelot && (
              <Flex
                as="span"
                display="inline-flex"
                alignItems="center"
                gap={1}
                minW={0}
                title={track.key as string}
                data-testid="track-card-key"
              >
                <Box
                  aria-hidden="true"
                  boxSize="8px"
                  borderRadius="full"
                  bg={camelotDotColor(camelot)}
                  flexShrink={0}
                />
                <Text as="span" fontWeight="bold" color="fg" fontVariantNumeric="tabular-nums">
                  {camelot}
                </Text>
                <Text
                  as="span"
                  display={{ base: "none", md: "inline" }}
                  data-testid="track-card-key-name"
                >
                  {track.key}
                </Text>
                {showKeyWarning && (
                  <ConfidenceIndicator
                    subject="key"
                    low
                    percent={formatKeyConfidencePercent(track.key_confidence as number)}
                  />
                )}
              </Flex>
            )}
            {cardExtras}
            {hasNotes && showNotes && <NotesIndicator notes={track.notes as string} />}
          </Flex>
        )}

        {/* Phones show genres only; the rating lives in the card menu there. */}
        <Flex
          display={{
            base: genresShown ? "flex" : "none",
            md: genresShown || showRating ? "flex" : "none",
          }}
          alignItems="center"
          justifyContent="space-between"
          gap={2}
          minW={0}
          mt={2}
        >
          {genresShown && (
            <Box flex={1} minW={0}>
              <GenreBadgeRow
                data-testid="track-genres"
                items={genreBadges.items}
                kind={genreBadges.kind}
                scope="tracks"
                colorPalette="status.genre"
                variant="subtle"
                size={{ base: "xs", md: "sm" }}
              />
            </Box>
          )}
          {showRating && (
            <Box display={{ base: "none", md: "block" }} flexShrink={0} ml="auto">
              <RatingStars value={localRating} onChange={handleRatingChange} />
            </Box>
          )}
        </Flex>

        {footer && <Box mt={1}>{footer}</Box>}
      </Flex>
    </Flex>
  );
}

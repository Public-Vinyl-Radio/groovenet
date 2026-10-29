"use client";

import React from "react";
import NextLink from "next/link";
import { Box, Button, Flex, Link, SegmentGroup, Text } from "@chakra-ui/react";
import { FaPlay } from "react-icons/fa";
import { FiPlay } from "react-icons/fi";
import SectionHeader from "@/components/album-detail/SectionHeader";
import { BpmCell, dash, GenreCell, labelHead, RatingCell, Th } from "@/components/RelatedTrackRows";
import { KeyChip, NotesIndicator } from "@/components/TrackResult";
import { camelotOf } from "@/lib/mixCompat";
import { hasSides, type SideSummary } from "@/lib/albumStats";
import { formatSeconds, getTrackDurationSeconds } from "@/lib/trackUtils";
import type { Track } from "@/types/track";

type Props = {
  sides: SideSummary<Track>[];
  albumArtist: string;
  isMobile: boolean;
  onPlayTrack: (track: Track) => void;
  onPlaySide: (side: SideSummary<Track>) => void;
  /** The row's actions menu. */
  renderActions: (track: Track) => React.ReactNode;
};

const ALL = "all";

const trackHref = (t: Track) =>
  `/tracks/${encodeURIComponent(t.track_id)}?friend_id=${t.friend_id}`;
const rowKey = (t: Track, i: number) => `${t.track_id}:${t.friend_id}:${i}`;

/** "6 tracks · 21:41" */
function sideMeta(side: SideSummary<Track>) {
  const count = `${side.tracks.length} ${side.tracks.length === 1 ? "track" : "tracks"}`;
  return side.seconds > 0 ? `${count} · ${formatSeconds(side.seconds)}` : count;
}

function PlayTrackButton({
  track,
  onPlay,
  size,
  children,
}: {
  track: Track;
  onPlay: () => void;
  size: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      aria-label={`Play ${track.title}`}
      title={track.local_audio_url ? undefined : "No audio file for this track"}
      disabled={!track.local_audio_url}
      onClick={onPlay}
      boxSize={size}
      minW={size}
      p={0}
    >
      {children}
    </Button>
  );
}

function PlaySideButton({
  side,
  onPlay,
  mobile,
}: {
  side: SideSummary<Track>;
  onPlay: () => void;
  mobile: boolean;
}) {
  const label = side.key === "TRACKLIST" ? "Play all" : `Play side ${side.shortLabel}`;
  return (
    <Button
      size="xs"
      variant="outline"
      aria-label={label}
      onClick={onPlay}
      minH={mobile ? "44px" : undefined}
      px={mobile ? 3 : undefined}
    >
      <FaPlay /> {mobile ? "Play" : label}
    </Button>
  );
}

function Position({ track }: { track: Track }) {
  return (
    <Box
      as="span"
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      minW="36px"
      h="26px"
      px={1.5}
      bg="bg.subtle"
      fontFamily="mono"
      fontSize="14px"
      fontWeight="semibold"
    >
      {track.position || dash}
    </Box>
  );
}

function TitleCell({ track, albumArtist }: { track: Track; albumArtist: string }) {
  // Only a compilation's tracks carry an artist of their own worth showing.
  const showArtist = track.artist && track.artist !== albumArtist;
  return (
    <Box minW={0}>
      <Flex alignItems="center" gap={2} minW={0}>
        <Link
          as={NextLink}
          href={trackHref(track)}
          title={track.title}
          display="block"
          minW={0}
          fontWeight="semibold"
          fontSize="17px"
          lineHeight="24px"
          _hover={{ textDecoration: "underline" }}
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
        >
          {track.title}
        </Link>
        {track.notes?.trim() && <NotesIndicator notes={track.notes} />}
      </Flex>
      {showArtist && (
        <Text
          title={track.artist}
          fontSize="12px"
          lineHeight="16px"
          color="fg.muted"
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
        >
          {track.artist}
        </Text>
      )}
    </Box>
  );
}

function KeyCell({ track, showName = true }: { track: Track; showName?: boolean }) {
  const camelot = camelotOf(track.key);
  return camelot ? (
    <KeyChip keyName={track.key} camelot={camelot} showName={showName} />
  ) : (
    <Text as="span" color="fg.subtle">
      {dash}
    </Text>
  );
}

function TimeText({ track }: { track: Track }) {
  const seconds = getTrackDurationSeconds(track);
  return <>{seconds !== null ? formatSeconds(seconds) : dash}</>;
}

/** Desktop: a ruled table, a header row per side. */
function TrackTable({
  sides,
  albumArtist,
  onPlayTrack,
  onPlaySide,
  renderActions,
  showHeaders,
}: Omit<Props, "isMobile"> & { showHeaders: boolean }) {
  const rowReveal = { "& .track-result-rating": { opacity: 1 } };
  return (
    <Box
      borderWidth="outline"
      borderColor="border.ink"
      boxShadow="md"
      overflowX="auto"
      data-testid="album-track-table"
    >
      <Box
        as="table"
        w="full"
        minW="980px"
        css={{ tableLayout: "fixed", borderCollapse: "collapse" }}
      >
        <Box as="thead" bg="bg.subtle" borderBottomWidth="outline" borderColor="border.ink">
          <tr>
            <Th scope="col" px="16px" py="12px" w="72px" {...labelHead}>
              Side
            </Th>
            <Th scope="col" w="44px" p={0}>
              <Box as="span" srOnly>
                Play
              </Box>
            </Th>
            {/* Track alone takes the remaining width, so long titles shrink first. */}
            {[
              { name: "Track", width: undefined },
              { name: "Time", width: "80px" },
              { name: "BPM", width: "88px" },
              { name: "Key", width: "140px" },
              { name: "Genre", width: "216px" },
              { name: "Rating", width: "132px" },
            ].map(({ name, width }) => (
              <Th scope="col" key={name} w={width} px="16px" py="12px" {...labelHead}>
                {name}
              </Th>
            ))}
            <Th scope="col" w="56px" p={0}>
              <Box as="span" srOnly>
                Actions
              </Box>
            </Th>
          </tr>
        </Box>
        {sides.map((side) => (
          <tbody key={side.key}>
            {showHeaders && (
              <Box
                as="tr"
                bg="bg.subtle"
                borderTopWidth="rule"
                borderBottomWidth="rule"
                borderColor="border"
              >
                <Th scope="rowgroup" colSpan={9} textAlign="left" px="16px" py="10px">
                  <Flex alignItems="center" justifyContent="space-between" gap={3}>
                    <Flex alignItems="baseline" gap={3}>
                      <Text fontSize="16px" lineHeight="24px" fontWeight="semibold">
                        {side.label}
                      </Text>
                      <Text
                        fontFamily="label"
                        fontSize="12px"
                        letterSpacing="0.06em"
                        textTransform="uppercase"
                        color="fg.muted"
                      >
                        {sideMeta(side)}
                      </Text>
                    </Flex>
                    <PlaySideButton side={side} onPlay={() => onPlaySide(side)} mobile={false} />
                  </Flex>
                </Th>
              </Box>
            )}
            {side.tracks.map((track, i) => (
              <Box
                as="tr"
                key={rowKey(track, i)}
                borderTopWidth="rule"
                borderColor="border"
                _hover={{ bg: "bg.muted" }}
                css={{ "& > td": { padding: "14px 16px", verticalAlign: "middle" }, ...rowReveal }}
              >
                <td>
                  <Position track={track} />
                </td>
                <Box as="td" css={{ padding: "0 !important" }}>
                  <PlayTrackButton track={track} size="36px" onPlay={() => onPlayTrack(track)}>
                    <FiPlay />
                  </PlayTrackButton>
                </Box>
                <td>
                  <TitleCell track={track} albumArtist={albumArtist} />
                </td>
                <Box
                  as="td"
                  fontFamily="mono"
                  fontSize="14px"
                  whiteSpace="nowrap"
                  fontVariantNumeric="tabular-nums"
                >
                  <TimeText track={track} />
                </Box>
                <td>
                  <BpmCell track={track} delta={null} />
                </td>
                <td>
                  <KeyCell track={track} />
                </td>
                <td>
                  <GenreCell track={track} />
                </td>
                <td>
                  <RatingCell track={track} />
                </td>
                <Box as="td" textAlign="right" css={{ paddingLeft: "0 !important" }}>
                  {renderActions(track)}
                </Box>
              </Box>
            ))}
          </tbody>
        ))}
      </Box>
    </Box>
  );
}

/** Phone: stacked rows, the position as a 44px play button. */
function TrackRows({
  sides,
  albumArtist,
  onPlayTrack,
  onPlaySide,
  renderActions,
  showHeaders,
}: Omit<Props, "isMobile"> & { showHeaders: boolean }) {
  return (
    <Box
      borderWidth="outline"
      borderColor="border.ink"
      boxShadow="md"
      data-testid="album-track-list"
    >
      {sides.map((side) => (
        <Box key={side.key}>
          {showHeaders && (
            <Flex
              alignItems="center"
              justifyContent="space-between"
              gap={2}
              py="8px"
              pl="14px"
              pr="8px"
              bg="bg.subtle"
              borderBottomWidth="rule"
              borderColor="border"
              css={{
                "&:not(:first-of-type)": {
                  borderTopWidth: "1px",
                  borderTopStyle: "solid",
                  borderTopColor: "var(--gn-border)",
                },
              }}
            >
              <Flex alignItems="baseline" gap="10px" minW={0}>
                <Text fontSize="15px" lineHeight="22px" fontWeight="semibold">
                  {side.label}
                </Text>
                <Text
                  fontFamily="label"
                  fontSize="11px"
                  letterSpacing="0.06em"
                  textTransform="uppercase"
                  color="fg.muted"
                  whiteSpace="nowrap"
                >
                  {sideMeta(side)}
                </Text>
              </Flex>
              <PlaySideButton side={side} onPlay={() => onPlaySide(side)} mobile />
            </Flex>
          )}
          <Box as="ul" listStyleType="none" m={0} p={0}>
            {side.tracks.map((track, i) => (
              <Flex
                as="li"
                key={rowKey(track, i)}
                alignItems="flex-start"
                gap="12px"
                py="12px"
                pl="14px"
                pr="4px"
                borderBottomWidth="rule"
                borderColor="border"
                css={{ "&:last-of-type": { borderBottomWidth: 0 } }}
              >
                <PlayTrackButton track={track} size="44px" onPlay={() => onPlayTrack(track)}>
                  <Text
                    as="span"
                    bg="bg.subtle"
                    boxSize="44px"
                    display="inline-flex"
                    alignItems="center"
                    justifyContent="center"
                    fontFamily="mono"
                    fontSize="14px"
                    fontWeight="semibold"
                  >
                    {track.position || <FiPlay />}
                  </Text>
                </PlayTrackButton>
                <Flex direction="column" gap="6px" minW={0} flex={1}>
                  <TitleCell track={track} albumArtist={albumArtist} />
                  <Flex
                    flexWrap="wrap"
                    alignItems="center"
                    gap={2}
                    fontSize="12px"
                    lineHeight="16px"
                    color="fg.muted"
                  >
                    <Text as="span" fontFamily="mono" fontVariantNumeric="tabular-nums">
                      <TimeText track={track} />
                    </Text>
                    <BpmCell track={track} delta={null} />
                    <KeyCell track={track} showName={false} />
                  </Flex>
                  <GenreCell track={track} />
                </Flex>
                <Box
                  alignSelf="center"
                  css={{ "& button": { minWidth: "44px", minHeight: "44px" } }}
                >
                  {renderActions(track)}
                </Box>
              </Flex>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/** The album's tracks grouped by side, with an All / Side A / Side B filter. */
export default function AlbumTracklist(props: Props) {
  const { sides, isMobile } = props;
  const [view, setView] = React.useState(ALL);
  const sided = hasSides(sides);
  // A side that is no longer there (the tracks were re-fetched) falls back to all.
  const shown = view === ALL ? sides : sides.filter((side) => side.key === view);
  const visible = shown.length > 0 ? shown : sides;
  const trackCount = sides.reduce((sum, side) => sum + side.tracks.length, 0);
  const items = [
    { value: ALL, label: "All" },
    ...sides.map((side) => ({ value: side.key, label: side.label })),
  ];
  const body = { ...props, sides: visible, showHeaders: sided };

  return (
    <Flex as="section" aria-label="Tracklist" direction="column" gap="14px">
      <SectionHeader
        title="Tracklist"
        count={`${trackCount} ${trackCount === 1 ? "track" : "tracks"}`}
      >
        {sided && sides.length > 1 && (
          <SegmentGroup.Root
            size="sm"
            css={
              isMobile
                ? {
                    "& label": {
                      minHeight: "44px",
                      flex: 1,
                      justifyContent: "center",
                      whiteSpace: "nowrap",
                    },
                  }
                : undefined
            }
            value={shown.length > 0 ? view : ALL}
            aria-label="Show side"
            width={isMobile ? "full" : undefined}
            onValueChange={(details) => setView(details.value ?? ALL)}
          >
            <SegmentGroup.Indicator />
            <SegmentGroup.Items items={items} />
          </SegmentGroup.Root>
        )}
      </SectionHeader>
      {trackCount === 0 ? (
        <Text color="fg.muted">No tracks found for this album.</Text>
      ) : isMobile ? (
        <TrackRows {...body} />
      ) : (
        <TrackTable {...body} />
      )}
    </Flex>
  );
}

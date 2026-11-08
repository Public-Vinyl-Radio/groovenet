"use client";

import React from "react";
import { Box, Flex, Text, useBreakpointValue } from "@chakra-ui/react";
import { MetaTag } from "@/components/ui/RoleTags";
import AlbumLink from "@/components/AlbumLink";
import ArtistLink from "@/components/ArtistLink";
import { ArtworkPlay, NotesIndicator } from "@/components/TrackResult";
import TrackGenresSection from "@/components/track-detail/TrackGenresSection";
import { useTrack } from "@/hooks/useTrack";
import { camelotDotColor, camelotOf, parseBpm } from "@/lib/mixCompat";
import { formatSeconds, getTrackDurationSeconds } from "@/lib/trackUtils";
import FileInfo from "@/components/player/FileInfo";
import type { Track } from "@/types/track";

type Props = {
  trackId: string;
  friendId: number;
  fallbackTrack: Track;
  /** Attribution is only useful when the track isn't in the library already being browsed. */
  showUsername?: boolean;
  fileInfoOpen?: boolean;
  onFileInfoOpenChange?: (open: boolean) => void;
  onReprobe?: () => Promise<void>;
};

// The header sizes itself from its own width, not the viewport's: the sidebar
// takes a variable share of it. Wide is the artwork and text beside a facts block;
// narrow stacks a 4-column facts strip and the genres under the title.
const wide = "@container (min-width: 800px)";

const labelText = {
  fontFamily: "label",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "fg.muted",
} as const;

const valueText = {
  fontFamily: "mono",
  fontWeight: "semibold",
  fontVariantNumeric: "tabular-nums",
} as const;

function Missing() {
  return (
    <Text as="span" color="fg.subtle" aria-label="Unknown">
      {"–"}
    </Text>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box
      minW={0}
      px={{ base: "10px" }}
      py="8px"
      css={{
        "&:nth-of-type(n+2)": {
          borderLeftWidth: "1px",
          borderColor: "var(--gn-border)",
          borderStyle: "solid",
        },
        [wide]: {
          padding: "16px 20px",
          "&:nth-of-type(n+2)": { borderLeftWidth: 0 },
          "&:nth-of-type(odd)": {
            borderRightWidth: "1px",
            borderRightStyle: "solid",
            borderColor: "var(--gn-border)",
          },
          "&:nth-of-type(-n+2)": {
            borderBottomWidth: "1px",
            borderBottomStyle: "solid",
            borderColor: "var(--gn-border)",
          },
        },
      }}
    >
      <Text
        as="dt"
        {...labelText}
        fontSize="10px"
        lineHeight="14px"
        css={{ [wide]: { fontSize: "11px", lineHeight: "16px" } }}
      >
        {label}
      </Text>
      {children}
    </Box>
  );
}

const factValue = {
  as: "dd",
  m: 0,
  mt: "2px",
  ...valueText,
  fontSize: "20px",
  lineHeight: "26px",
  overflowWrap: "anywhere",
  css: { [wide]: { marginTop: "4px", fontSize: "32px", lineHeight: "40px" } },
} as const;

function Facts({ track }: { track: Track }) {
  const bpm = parseBpm(track.bpm);
  const camelot = camelotOf(track.key);
  const seconds = getTrackDurationSeconds(track);
  const side = track.position ? String(track.position) : null;

  return (
    <Box
      as="dl"
      data-testid="track-facts"
      m={0}
      bg="bg.subtle"
      borderTopWidth="outline"
      borderColor="border.ink"
      css={{
        gridArea: "facts",
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        [wide]: {
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          alignContent: "stretch",
          borderTopWidth: 0,
          borderLeftWidth: "2px",
        },
      }}
    >
      <Fact label="BPM">
        <Text {...factValue}>{bpm !== null ? Number(bpm.toFixed(1)) : <Missing />}</Text>
      </Fact>
      <Fact label="Key">
        <Flex
          {...factValue}
          alignItems="center"
          columnGap="5px"
          flexWrap="wrap"
          css={{
            [wide]: {
              marginTop: "4px",
              fontSize: "32px",
              lineHeight: "40px",
              columnGap: "8px",
              flexWrap: "nowrap",
            },
          }}
        >
          {camelot ? (
            <>
              <Box
                aria-hidden="true"
                flexShrink={0}
                boxSize="8px"
                borderRadius="full"
                bg={camelotDotColor(camelot)}
                css={{ [wide]: { width: "10px", height: "10px" } }}
              />
              <span>{camelot}</span>
              {track.key && (
                <Text
                  as="span"
                  fontFamily="body"
                  fontWeight="normal"
                  fontSize="11px"
                  lineHeight="14px"
                  color="fg.muted"
                  flexBasis="100%"
                  css={{ [wide]: { flexBasis: "auto", fontSize: "14px", lineHeight: "20px" } }}
                >
                  {track.key}
                </Text>
              )}
            </>
          ) : (
            <Missing />
          )}
        </Flex>
      </Fact>
      <Fact label="Duration">
        <Text {...factValue}>{seconds !== null ? formatSeconds(seconds) : <Missing />}</Text>
      </Fact>
      <Fact label="Side">
        <Text {...factValue}>{side ?? <Missing />}</Text>
      </Fact>
    </Box>
  );
}

/**
 * The track identity card: one outlined card with the artwork, artist and genres on
 * the left and the facts (BPM, key, duration, side) beside them or, narrow,
 * as a strip.
 */
export default function TrackHeader({
  trackId,
  friendId,
  fallbackTrack,
  showUsername = true,
  fileInfoOpen,
  onFileInfoOpenChange,
  onReprobe,
}: Props) {
  const track = useTrack(trackId, friendId) ?? fallbackTrack;
  const isMobile = useBreakpointValue({ base: true, md: false }) ?? true;
  const hasNotes = Boolean(track.notes?.trim());
  // Some imports store a missing year as "0".
  const year = track.year && track.year !== "0" ? track.year : null;

  return (
    <Box data-testid="track-header" css={{ containerType: "inline-size" }}>
      <Box
        as="section"
        aria-label="Track"
        borderWidth="outline"
        borderRadius="md"
        borderColor="border.ink"
        boxShadow="md"
        // Children paint their own fill: clip them to the frame's inner curve.
        overflow="clip"
        css={{
          display: "grid",
          gridTemplateColumns: "108px minmax(0, 1fr)",
          gridTemplateAreas: '"art info" "facts facts" "genres genres"',
          [wide]: {
            gridTemplateColumns: "188px minmax(0, 1fr) minmax(280px, 400px)",
            gridTemplateRows: "auto 1fr",
            gridTemplateAreas: '"art info facts" "art genres facts"',
          },
        }}
      >
        <Box
          css={{
            gridArea: "art",
            margin: "12px 0 12px 12px",
            width: "96px",
            height: "96px",
            [wide]: { margin: "20px 0 20px 20px", width: "168px", height: "168px" },
          }}
        >
          <ArtworkPlay track={track} size="100%" iconSize={6} />
        </Box>

        <Flex
          direction="column"
          gap="2px"
          minW={0}
          css={{ gridArea: "info", padding: "12px", [wide]: { padding: "20px 20px 0" } }}
        >
          <Flex alignItems="center" gap={2} minW={0}>
            <Text
              fontWeight="medium"
              fontSize="15px"
              lineHeight="20px"
              overflowWrap="anywhere"
              css={{ [wide]: { fontSize: "18px", lineHeight: "26px" } }}
            >
              <ArtistLink
                artist={track.artist}
                credits={track.artists}
                friendId={track.friend_id}
              />
            </Text>
            {hasNotes && <NotesIndicator notes={track.notes as string} />}
          </Flex>
          {/* One line: a long album ends in an ellipsis and the year stays beside it. */}
          <Flex
            color="fg.muted"
            fontSize="13px"
            lineHeight="18px"
            minW={0}
            css={{ [wide]: { fontSize: "14px", lineHeight: "20px" } }}
          >
            {track.album && (
              <Box
                minW={0}
                title={track.album}
                css={{
                  "& a": {
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  },
                }}
              >
                <AlbumLink releaseId={track.release_id} friendId={track.friend_id}>
                  {track.album}
                </AlbumLink>
              </Box>
            )}
            {year && (
              <Text as="span" flexShrink={0} whiteSpace="pre">
                {track.album ? " · " : ""}
                {year}
              </Text>
            )}
          </Flex>
          {showUsername && track.username && (
            <Text color="fg.subtle" fontSize="12px">
              {track.username}
            </Text>
          )}
          <Flex align="center" gap={3} wrap="wrap" mt={1}>
            {track.library_identifier && (
              <MetaTag variant="id" size="sm" alignSelf="flex-start">
                {track.library_identifier}
              </MetaTag>
            )}
            {track.local_audio_url && (
              <FileInfo
                track={track}
                mobile={isMobile}
                fullPath
                onReprobe={onReprobe}
                open={fileInfoOpen}
                onOpenChange={onFileInfoOpenChange}
              />
            )}
          </Flex>
        </Flex>

        <Box
          minW={0}
          borderTopWidth="1px"
          borderColor="border"
          css={{
            gridArea: "genres",
            padding: "10px 12px",
            [wide]: { padding: "8px 20px 0", borderTopWidth: 0 },
          }}
        >
          <TrackGenresSection trackId={trackId} friendId={friendId} fallbackTrack={fallbackTrack} />
        </Box>

        <Facts track={track} />
      </Box>
    </Box>
  );
}

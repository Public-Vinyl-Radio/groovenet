"use client";

import React from "react";
import { Badge, Box, Button, Flex, Heading, Text } from "@chakra-ui/react";
import { FaPlay } from "react-icons/fa";
import { FiPlus } from "react-icons/fi";
import AlbumLink from "@/components/AlbumLink";
import ArtistLink from "@/components/ArtistLink";
import TrackActionsMenu from "@/components/TrackActionsMenu";
import { ArtworkPlay, NotesIndicator } from "@/components/TrackResult";
import TrackGenresSection from "@/components/track-detail/TrackGenresSection";
import { useAddToPlaylistDialog } from "@/hooks/useAddToPlaylistDialog";
import { useTrack } from "@/hooks/useTrack";
import { camelotDotColor, camelotOf, parseBpm } from "@/lib/mixCompat";
import { formatSeconds, getTrackDurationSeconds } from "@/lib/trackUtils";
import { usePlaylistPlayer } from "@/providers/PlaylistPlayerProvider";
import type { Track } from "@/types/track";

type Props = {
  trackId: string;
  friendId: number;
  fallbackTrack: Track;
  /** Attribution is only useful when the track isn't in the library already being browsed. */
  showUsername?: boolean;
  onOpenTrackDebug?: () => void;
  onChangeArtwork?: () => void;
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

const valueText = { fontFamily: "mono", fontWeight: "semibold", fontVariantNumeric: "tabular-nums" } as const;

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
        "&:nth-of-type(n+2)": { borderLeftWidth: "1px", borderColor: "var(--gn-border)", borderStyle: "solid" },
        [wide]: {
          padding: "16px 20px",
          "&:nth-of-type(n+2)": { borderLeftWidth: 0 },
          "&:nth-of-type(odd)": { borderRightWidth: "1px", borderRightStyle: "solid", borderColor: "var(--gn-border)" },
          "&:nth-of-type(-n+2)": { borderBottomWidth: "1px", borderBottomStyle: "solid", borderColor: "var(--gn-border)" },
        },
      }}
    >
      <Text as="dt" {...labelText} fontSize="10px" lineHeight="14px" css={{ [wide]: { fontSize: "11px", lineHeight: "16px" } }}>
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
        [wide]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))", alignContent: "stretch", borderTopWidth: 0, borderLeftWidth: "2px" },
      }}
    >
      <Fact label="BPM">
        <Text {...factValue}>{bpm !== null ? Number(bpm.toFixed(1)) : <Missing />}</Text>
      </Fact>
      <Fact label="Key">
        <Flex {...factValue} alignItems="center" columnGap="5px" flexWrap="wrap" css={{ [wide]: { marginTop: "4px", fontSize: "32px", lineHeight: "40px", columnGap: "8px", flexWrap: "nowrap" } }}>
          {camelot ? (
            <>
              <Box aria-hidden="true" flexShrink={0} boxSize="8px" borderRadius="full" bg={camelotDotColor(camelot)} css={{ [wide]: { width: "10px", height: "10px" } }} />
              <span>{camelot}</span>
              {track.key && (
                <Text as="span" fontFamily="body" fontWeight="normal" fontSize="11px" lineHeight="14px" color="fg.muted" flexBasis="100%" css={{ [wide]: { flexBasis: "auto", fontSize: "14px", lineHeight: "20px" } }}>
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
 * The track page header: one outlined card with the artwork, title and genres on
 * the left and the facts (BPM, key, duration, side) beside them or, narrow,
 * as a strip. Actions sit inside the card when wide and below it when narrow.
 */
export default function TrackHeader({
  trackId,
  friendId,
  fallbackTrack,
  showUsername = true,
  onOpenTrackDebug,
  onChangeArtwork,
}: Props) {
  const track = useTrack(trackId, friendId) ?? fallbackTrack;
  const { replacePlaylist } = usePlaylistPlayer();
  const { openForTrack, playlistDialog, nameDialog } = useAddToPlaylistDialog();
  const hasNotes = Boolean(track.notes?.trim());
  // Some imports store a missing year as "0".
  const year = track.year && track.year !== "0" ? track.year : null;

  const actions = (placement: "card" | "below") => (
    <Flex
      data-testid={`track-actions-${placement}`}
      gap={placement === "below" ? "8px" : "10px"}
      alignItems="center"
      flexWrap={placement === "card" ? "wrap" : undefined}
      css={
        placement === "card"
          ? { gridArea: "actions", alignSelf: "end", display: "none", [wide]: { display: "flex", padding: "16px 20px 20px" } }
          : { marginTop: "16px", [wide]: { display: "none" } }
      }
    >
      <Button
        colorPalette="accent"
        variant="solid"
        size={placement === "below" ? "sm" : undefined}
        flex={placement === "below" ? 1 : undefined}
        minH={placement === "below" ? "44px" : undefined}
        disabled={!track.local_audio_url}
        title={track.local_audio_url ? undefined : "No audio file for this track"}
        onClick={() => replacePlaylist([track], { autoplay: true, startIndex: 0 })}
      >
        <FaPlay /> Play
      </Button>
      <Button
        variant="outline"
        size={placement === "below" ? "sm" : undefined}
        flex={placement === "below" ? 1 : undefined}
        minH={placement === "below" ? "44px" : undefined}
        minW={0}
        px={placement === "below" ? 2 : undefined}
        onClick={() => openForTrack(track)}
      >
        <FiPlus /> Add to playlist
      </Button>
      <TrackActionsMenu
        track={track}
        prominent={placement === "below"}
        onOpenTrackDebug={onOpenTrackDebug}
        onChangeArtwork={onChangeArtwork}
      />
    </Flex>
  );

  return (
    <Box data-testid="track-header" css={{ containerType: "inline-size" }}>
      <Box
        as="section"
        aria-label="Track"
        borderWidth="outline"
        borderColor="border.ink"
        boxShadow="md"
        css={{
          display: "grid",
          gridTemplateColumns: "108px minmax(0, 1fr)",
          gridTemplateAreas: '"art info" "facts facts" "genres genres"',
          [wide]: {
            gridTemplateColumns: "188px minmax(0, 1fr) minmax(280px, 400px)",
            gridTemplateRows: "auto auto 1fr",
            gridTemplateAreas: '"art info facts" "art genres facts" "art actions facts"',
          },
        }}
      >
        <Box
          borderWidth="outline"
          borderColor="border.ink"
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
            <Heading
              as="h1"
              fontSize="20px"
              lineHeight="26px"
              fontWeight="semibold"
              minW={0}
              overflowWrap="anywhere"
              css={{ [wide]: { fontSize: "28px", lineHeight: "36px" } }}
            >
              {track.title}
            </Heading>
            {hasNotes && <NotesIndicator notes={track.notes as string} />}
          </Flex>
          <Text fontWeight="medium" fontSize="15px" lineHeight="20px" overflowWrap="anywhere" css={{ [wide]: { fontSize: "18px", lineHeight: "26px" } }}>
            <ArtistLink artist={track.artist} friendId={track.friend_id} />
          </Text>
          <Text color="fg.muted" fontSize="13px" lineHeight="18px" overflowWrap="anywhere" css={{ [wide]: { fontSize: "14px", lineHeight: "20px" } }}>
            {track.album && (
              <AlbumLink releaseId={track.release_id} friendId={track.friend_id}>
                {track.album}
              </AlbumLink>
            )}
            {track.album && year ? " · " : null}
            {year}
          </Text>
          {showUsername && track.username && (
            <Text color="fg.subtle" fontSize="12px">
              {track.username}
            </Text>
          )}
          {track.library_identifier && (
            <Badge colorPalette="accent" size="sm" fontWeight="bold" alignSelf="flex-start" mt={1}>
              {track.library_identifier}
            </Badge>
          )}
        </Flex>

        <Box
          minW={0}
          borderTopWidth="1px"
          borderColor="border"
          css={{ gridArea: "genres", padding: "10px 12px", [wide]: { padding: "8px 20px 0", borderTopWidth: 0 } }}
        >
          <TrackGenresSection trackId={trackId} friendId={friendId} fallbackTrack={fallbackTrack} />
        </Box>

        {actions("card")}
        <Facts track={track} />
      </Box>
      {actions("below")}
      {playlistDialog}
      {nameDialog}
    </Box>
  );
}

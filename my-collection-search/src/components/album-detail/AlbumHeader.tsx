"use client";

import React from "react";
import { Box, Button, Flex, Heading, Image, Popover, RatingGroup, Text } from "@chakra-ui/react";
import { FaPlay } from "react-icons/fa";
import { FiDisc, FiFileText, FiPlus } from "react-icons/fi";
import ArtistLink from "@/components/ArtistLink";
import { GenreBadgeList } from "@/components/GenreBadge";
import { discogsGenreBadges } from "@/lib/genres/links";
import { useGenreLookup } from "@/hooks/useGenreTaxonomyQuery";
import {
  bpmRange,
  formatBpmRange,
  formatSideRuntimes,
  formatSideSplit,
  openingKey,
  type SideSummary,
  type SpinStats,
} from "@/lib/albumStats";
import { formatSeconds } from "@/lib/trackUtils";
import type { AlbumEntity } from "@/stores/albumStore";
import type { Track } from "@/types/track";

type Props = {
  album: AlbumEntity;
  tracks: Track[];
  sides: SideSummary<Track>[];
  spins: SpinStats | null;
  artworkSrc?: string | null;
  rating: number;
  onRate: (value: number) => void;
  onPlay: () => void;
  onAddToPlaylist: () => void;
  onLogSpin: () => void;
  onChangeArtwork: () => void;
  /** The overflow menu; the page decides where it sits on a phone. */
  menu?: React.ReactNode;
  /** Phone layout: badges under the cover, full-width actions. */
  isMobile: boolean;
};

// Sized from the card's own width, like the track page header: the sidebar takes
// a variable share of the viewport.
const wide = "@container (min-width: 760px)";

const labelText = {
  fontFamily: "label",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "fg.muted",
} as const;

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <Box
      minW={0}
      px="14px"
      py="12px"
      css={{
        "&:nth-of-type(odd)": { borderRightWidth: "1px", borderRightStyle: "solid", borderColor: "var(--gn-border)" },
        "&:nth-of-type(-n+2)": { borderBottomWidth: "1px", borderBottomStyle: "solid", borderColor: "var(--gn-border)" },
        [wide]: { padding: "18px 20px" },
      }}
    >
      <Text as="dt" {...labelText} fontSize="11px" lineHeight="16px">
        {label}
      </Text>
      <Text
        as="dd"
        m={0}
        mt="2px"
        fontFamily="mono"
        fontWeight="semibold"
        fontVariantNumeric="tabular-nums"
        fontSize="24px"
        lineHeight="30px"
        overflowWrap="anywhere"
        css={{ [wide]: { fontSize: "34px", lineHeight: "40px" } }}
      >
        {value}
      </Text>
      {note && (
        <Text as="dd" m={0} mt="2px" fontSize="12px" lineHeight="16px" color="fg.muted" css={{ [wide]: { fontSize: "13px", lineHeight: "18px" } }}>
          {note}
        </Text>
      )}
    </Box>
  );
}

const Missing = () => (
  <Text as="span" color="fg.subtle" aria-label="Unknown">
    {"–"}
  </Text>
);

/**
 * The album page's header: one outlined card with the cover, title and actions
 * on the left and a 2x2 stat panel beside it, or, narrow, under it.
 */
export default function AlbumHeader({
  album,
  tracks,
  sides,
  spins,
  artworkSrc,
  rating,
  onRate,
  onPlay,
  onAddToPlaylist,
  onLogSpin,
  onChangeArtwork,
  menu,
  isMobile,
}: Props) {
  const genreLookup = useGenreLookup();
  const genres = album.effective_genres ?? album.genres;
  const styles = album.effective_styles ?? album.styles;
  const hasBadges = Boolean(genres?.length || styles?.length);
  const hasNotes = Boolean(album.album_notes || album.purchase_price || album.condition);
  const totalSeconds = sides.reduce((sum, side) => sum + side.seconds, 0);
  const sideSplit = formatSideSplit(sides);
  const sideRuntimes = formatSideRuntimes(sides);
  const range = formatBpmRange(bpmRange(tracks));
  const opens = openingKey(tracks);
  const lastSpin = formatDate(spins?.lastPlayedAt);
  const added = formatDate(album.date_added);
  const trackCount = tracks.length || album.track_count || 0;
  const noTracks = tracks.length === 0;
  const year = album.year && album.year !== "0" ? album.year : null;
  const byline = [album.label, year, album.country].filter(Boolean).join(" · ");
  const idOrCatalog = album.library_identifier || album.catalog_number;

  const badges = (
    <Flex flexWrap="wrap" alignItems="center" gap="6px" mt={isMobile ? 0 : "4px"}>
      <GenreBadgeList items={discogsGenreBadges(genres, genreLookup)} kind="discogs-genre" scope="albums" />
      <GenreBadgeList items={discogsGenreBadges(styles, genreLookup)} kind="discogs-style" scope="albums" />
      {isMobile ? (
        <Box flex={1} />
      ) : (
        hasBadges && <Box aria-hidden="true" w="1px" h="16px" bg="border" mx={1.5} />
      )}
      <Rating rating={rating} onRate={onRate} compact={isMobile} />
    </Flex>
  );

  return (
    <Box css={{ containerType: "inline-size" }} data-testid="album-header">
      <Box
        as="section"
        aria-label="Album"
        borderWidth="outline"
        borderColor="border.ink"
        boxShadow="md"
        css={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gridTemplateAreas: '"main" "stats"',
          [wide]: { gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 440px)", gridTemplateAreas: '"main stats"' },
        }}
      >
        <Flex direction="column" gap="14px" p="14px" minW={0} css={{ gridArea: "main", [wide]: { padding: "24px", gap: "16px" } }}>
          <Flex gap="14px" minW={0} css={{ [wide]: { gap: "24px" } }}>
            <Box
              as="button"
              aria-label="Change cover art"
              onClick={onChangeArtwork}
              flexShrink={0}
              cursor="pointer"
              borderWidth="rule"
              borderColor="border.ink"
              alignSelf="flex-start"
              css={{ width: "112px", height: "112px", [wide]: { width: "192px", height: "192px" } }}
            >
              {artworkSrc ? (
                <Image src={artworkSrc} alt={`${album.title} cover`} boxSize="100%" objectFit="cover" display="block" />
              ) : (
                <Flex boxSize="100%" alignItems="center" justifyContent="center" bg="bg.muted" color="fg.subtle">
                  <FiDisc size={40} />
                </Flex>
              )}
            </Box>

            <Flex direction="column" gap="4px" minW={0} flex={1} css={{ [wide]: { gap: "6px" } }}>
              <Text {...labelText} fontWeight="medium" fontSize="11px" lineHeight="16px" css={{ [wide]: { fontSize: "12px" } }}>
                Album · Vinyl
                {idOrCatalog && (
                  <>
                    {" · "}
                    <Text as="span" fontWeight="bold" color={album.library_identifier ? "accent.fg" : undefined}>
                      {idOrCatalog}
                    </Text>
                  </>
                )}
              </Text>
              <Flex alignItems="center" gap={2.5} minW={0}>
                <Heading
                  as="h1"
                  fontSize="22px"
                  lineHeight="28px"
                  fontWeight="semibold"
                  overflowWrap="anywhere"
                  minW={0}
                  title={album.title}
                  // A long title takes three lines beside the phone's small cover, then ends in an ellipsis.
                  lineClamp={3}
                  css={{ [wide]: { fontSize: "30px", lineHeight: "38px", WebkitLineClamp: "unset", display: "block" } }}
                >
                  {album.title}
                </Heading>
                {hasNotes && (
                  <Popover.Root>
                    <Popover.Trigger asChild>
                      <Box as="button" aria-label="Album notes" display="inline-flex" color="fg.warning" flexShrink={0} minW="24px" minH="24px" alignItems="center" justifyContent="center">
                        <FiFileText size={18} />
                      </Box>
                    </Popover.Trigger>
                    <Popover.Positioner>
                      <Popover.Content maxW="280px">
                        <Popover.Body>
                          {album.album_notes && (
                            <Text fontSize="sm" whiteSpace="pre-wrap" mb={album.purchase_price || album.condition ? 2 : 0}>
                              {album.album_notes}
                            </Text>
                          )}
                          {(album.purchase_price || album.condition) && (
                            <Flex gap={3} fontSize="xs" color="fg.muted">
                              {album.purchase_price && <Text>Price: ${album.purchase_price}</Text>}
                              {album.condition && <Text>{album.condition}</Text>}
                            </Flex>
                          )}
                        </Popover.Body>
                      </Popover.Content>
                    </Popover.Positioner>
                  </Popover.Root>
                )}
              </Flex>
              <Text fontWeight="medium" fontSize="16px" lineHeight="22px" overflowWrap="anywhere" css={{ [wide]: { fontSize: "18px", lineHeight: "26px" } }}>
                <ArtistLink artist={album.artist} friendId={album.friend_id} />
              </Text>
              {byline && (
                <Text color="fg.muted" fontSize="13px" lineHeight="18px" css={{ [wide]: { fontSize: "15px", lineHeight: "22px" } }}>
                  {byline}
                </Text>
              )}

              {!isMobile && badges}

              {!isMobile && (
                <Flex gap="10px" mt="10px" flexWrap="wrap" data-testid="album-actions-card">
                  <PlayButton onPlay={onPlay} disabled={noTracks} />
                  <Button variant="outline" onClick={onAddToPlaylist} disabled={noTracks}>
                    <FiPlus /> Add to playlist
                  </Button>
                  <Button variant="outline" onClick={onLogSpin}>
                    <FiDisc /> Log spin
                  </Button>
                  {menu}
                </Flex>
              )}
            </Flex>
          </Flex>

          {isMobile && (
            <>
              {badges}
              <Flex direction="column" gap="10px" data-testid="album-actions-below">
                <PlayButton onPlay={onPlay} disabled={noTracks} minH="44px" />
                <Flex gap="10px">
                  <Button variant="outline" onClick={onAddToPlaylist} disabled={noTracks} minH="44px" flex={1} px={2}>
                    <FiPlus /> Playlist
                  </Button>
                  <Button variant="outline" onClick={onLogSpin} minH="44px" flex={1} px={2}>
                    <FiDisc /> Log spin
                  </Button>
                </Flex>
              </Flex>
            </>
          )}
        </Flex>

        <Box
          as="dl"
          data-testid="album-stats"
          m={0}
          bg="bg.subtle"
          borderTopWidth="outline"
          borderColor="border.ink"
          css={{
            gridArea: "stats",
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            alignContent: "stretch",
            [wide]: { borderTopWidth: 0, borderLeftWidth: "2px" },
          }}
        >
          <Stat label="Tracks" value={trackCount || <Missing />} note={sideSplit ? `${sides.length} sides · ${sideSplit}` : undefined} />
          <Stat label="Runtime" value={totalSeconds > 0 ? formatSeconds(totalSeconds) : <Missing />} note={sideRuntimes || undefined} />
          <Stat label="BPM" value={range ?? <Missing />} note={opens ? `Opens in ${opens.camelot} · ${opens.name}` : undefined} />
          <Stat
            label="Spins"
            value={spins ? `${spins.count}${spins.capped ? "+" : ""}` : <Missing />}
            note={[lastSpin && `Last ${lastSpin.toLocaleDateString([], { dateStyle: "medium" })}`, added && `Added ${added.toLocaleDateString()}`]
              .filter(Boolean)
              .join(" · ") || undefined}
          />
        </Box>
      </Box>
    </Box>
  );
}

function PlayButton({ onPlay, disabled, ...rest }: { onPlay: () => void; disabled?: boolean } & React.ComponentProps<typeof Button>) {
  return (
    <Button colorPalette="accent" variant="solid" onClick={onPlay} disabled={disabled} {...rest}>
      <FaPlay /> Play album
    </Button>
  );
}

function Rating({ rating, onRate, compact }: { rating: number; onRate: (value: number) => void; compact?: boolean }) {
  return (
    <Flex alignItems="center" gap={2}>
      <RatingGroup.Root value={rating} onValueChange={(details) => onRate(details.value)} count={5} size="sm" aria-label={rating ? `Rated ${rating} of 5` : "Not rated"}>
        {[1, 2, 3, 4, 5].map((index) => (
          <RatingGroup.Item key={index} index={index}>
            <RatingGroup.ItemIndicator />
          </RatingGroup.Item>
        ))}
      </RatingGroup.Root>
      {rating === 0 && !compact && (
        <Text fontSize="12px" color="fg.muted">
          Not rated
        </Text>
      )}
    </Flex>
  );
}

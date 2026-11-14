"use client";

import { artworkOf } from "@/components/player/trackMeta";
import Cover from "@/components/Cover";
import React, { useState } from "react";
import NextLink from "next/link";
import { Box, Flex, Table, Text, Link, useBreakpointValue } from "@chakra-ui/react";
import { CountTag, MetaTag, StatusTag } from "@/components/ui/RoleTags";
import { Album } from "@/types/track";
import { useUpdateAlbumMutation } from "@/hooks/useAlbumsQuery";
import { useAlbum } from "@/hooks/useAlbum";
import { useAlbumActions } from "@/hooks/useAlbumActions";
import { discogsGenreBadges } from "@/lib/genres/links";
import { useGenreLookup } from "@/hooks/useGenreTaxonomyQuery";
import GenreBadge, { GenreBadgeList } from "@/components/GenreBadge";
import ArtistLink from "@/components/ArtistLink";
import { RatingStars, TRACK_CARD_COVER_SIZE, TRACK_ROW_COVER_SIZE } from "@/components/TrackResult";

/**
 * The Missing checks that show as a tag on a result while their filter is on:
 * what the list was narrowed to is visible on every row and card.
 */
export const ALBUM_MISSING_TAGS = {
  missing_library_identifier: { label: "No identifier", tone: "missing" },
  missing_local_cover_art_url: { label: "No local cover", tone: "missing" },
  missing_audio: { label: "No audio", tone: "analysis" },
} as const;
export type AlbumMissingKey = keyof typeof ALBUM_MISSING_TAGS;

function MissingTags({ keys }: { keys: AlbumMissingKey[] }) {
  if (keys.length === 0) return null;
  return (
    <>
      {keys.map((key) => (
        <StatusTag
          key={key}
          tone={ALBUM_MISSING_TAGS[key].tone}
          size="sm"
          whiteSpace="nowrap"
          flexShrink={0}
        >
          {ALBUM_MISSING_TAGS[key].label}
        </StatusTag>
      ))}
    </>
  );
}

const ellipsis = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

const cell = {
  py: "2px",
  px: 4,
  borderColor: "border",
  borderBottomWidth: "rule",
  verticalAlign: "middle",
} as const;
const revealRating = { "& .track-result-rating": { opacity: 1 } };

export type AlbumResultProps = {
  album?: Album;
  albumRef?: { release_id: string; friend_id: number };
  showEditFields?: boolean;
  /** "card": the album card (grids, scrollers); "row": the album table's row (the LIST view). */
  layout?: "card" | "row";
  /**
   * The card's size: "full" (default) for grids at every width, "compact" (a
   * vertical tile, one link) for horizontal scrollers only. Takes a responsive
   * value, e.g. `{ base: "compact", md: "full" }`. Ignored by `row`.
   */
  size?: AlbumCardSize | Partial<Record<AlbumCardBreakpoint, AlbumCardSize>>;
  /**
   * The caller's meta. Compact: replaces the default `year · format` line.
   * Full: its own line under the card's meta line (an artist page's "Appears on").
   */
  meta?: React.ReactNode;
  /** Active Missing filters, shown as tags. */
  missingTags?: AlbumMissingKey[];
};

export type AlbumCardSize = "full" | "compact";
type AlbumCardBreakpoint = "base" | "sm" | "md" | "lg" | "xl" | "2xl";

export default function AlbumResult({
  album,
  albumRef,
  layout = "card",
  size = "full",
  meta,
  missingTags = [],
}: AlbumResultProps) {
  const releaseId = albumRef?.release_id ?? album?.release_id ?? "";
  const friendId = albumRef?.friend_id ?? album?.friend_id ?? -1;
  const albumFromStore = useAlbum(releaseId, friendId);
  const resolvedAlbum: Album = React.useMemo(
    () =>
      albumFromStore ??
      album ??
      ({
        release_id: releaseId,
        friend_id: friendId,
        title: "",
        artist: "",
        track_count: 0,
      } as Album),
    [album, albumFromStore, friendId, releaseId],
  );

  const sizeValues = typeof size === "string" ? { base: size } : size;
  // A responsive value with no base is the full card below its first breakpoint.
  const resolvedSize: AlbumCardSize =
    useBreakpointValue({ base: "full", ...sizeValues }) === "compact" ? "compact" : "full";

  if (!albumFromStore && !album) return null;
  if (layout === "card" && resolvedSize === "compact") {
    return <CompactAlbumCard album={resolvedAlbum} meta={meta} />;
  }
  return (
    <FullAlbumResult
      resolvedAlbum={resolvedAlbum}
      layout={layout}
      meta={meta}
      missingTags={missingTags}
    />
  );
}

function FullAlbumResult({
  resolvedAlbum,
  layout,
  meta,
  missingTags,
}: {
  resolvedAlbum: Album;
  layout: "card" | "row";
  meta?: React.ReactNode;
  missingTags: AlbumMissingKey[];
}) {
  const artworkSrc = artworkOf(resolvedAlbum);
  const [rating, setRating] = useState(resolvedAlbum?.album_rating || 0);

  const updateMutation = useUpdateAlbumMutation();
  const genreLookup = useGenreLookup();
  const albumActions = useAlbumActions({
    album: resolvedAlbum,
    editAlbumHref: `/albums/${resolvedAlbum.release_id}/edit?friend_id=${resolvedAlbum.friend_id}`,
    coverUrl: artworkSrc ?? undefined,
    catalogue: ["Album", resolvedAlbum.library_identifier].filter(Boolean).join(" · "),
  });
  const displayYear = resolvedAlbum?.year && resolvedAlbum.year !== "0" ? resolvedAlbum.year : "";

  React.useEffect(() => {
    setRating(resolvedAlbum.album_rating || 0);
  }, [resolvedAlbum, resolvedAlbum.album_rating]);

  const displayGenres = discogsGenreBadges(
    resolvedAlbum.effective_genres ?? resolvedAlbum.genres,
    genreLookup,
  );
  const displayStyles = discogsGenreBadges(
    resolvedAlbum.effective_styles ?? resolvedAlbum.styles,
    genreLookup,
  );
  const hasGenres = displayGenres.length > 0 || displayStyles.length > 0;
  const albumHref = `/albums/${resolvedAlbum.release_id}?friend_id=${resolvedAlbum.friend_id}`;
  const trackCount = resolvedAlbum.track_count;
  const tracksText = `${trackCount} track${trackCount !== 1 ? "s" : ""}`;

  const handleRatingChange = (value: number) => {
    setRating(value);
    updateMutation.mutate({
      release_id: resolvedAlbum.release_id,
      friend_id: resolvedAlbum.friend_id,
      album_rating: value,
    });
  };

  const genreBadges = (badgeSize: "xs" | "sm") => (
    <>
      <GenreBadgeList items={displayGenres} kind="discogs-genre" size={badgeSize} />
      <GenreBadgeList items={displayStyles} kind="discogs-style" size={badgeSize} />
    </>
  );

  // A card shows the first two tags and counts the rest; a row has the room for all.
  const MAX_CARD_GENRES = 2;
  const cardGenres = [
    ...displayGenres.map((item) => ({ item, kind: "discogs-genre" as const })),
    ...displayStyles.map((item) => ({ item, kind: "discogs-style" as const })),
  ];
  const hiddenGenres = cardGenres.slice(MAX_CARD_GENRES);
  const cardGenreBadges = (
    <>
      {cardGenres.slice(0, MAX_CARD_GENRES).map(({ item, kind }) => (
        <GenreBadge
          key={`${kind}:${item.label}`}
          item={item}
          kind={kind}

          size="sm"
        />
      ))}
      {hiddenGenres.length > 0 && (
        <CountTag
          size="sm"
          title={hiddenGenres.map(({ item }) => item.label).join(", ")}
          aria-label={`${hiddenGenres.length} more genres`}
        >
          +{hiddenGenres.length}
        </CountTag>
      )}
    </>
  );

  const menu = (
    // The menu's button is sized by its own component; the phone gets a 44px target.
    <Flex
      alignItems="center"
      css={{
        "@media (max-width: 47.99em)": { "& button": { minWidth: "44px", minHeight: "44px" } },
      }}
    >
      {albumActions.menu}
      {albumActions.dialogs}
    </Flex>
  );

  const cover = (coverSize: string | Record<string, string>) => (
    <Cover src={artworkSrc} alt="" size={coverSize} />
  );

  const libraryId = resolvedAlbum.library_identifier ? (
    <Text
      as="span"
      fontFamily="label"
      fontWeight="bold"
      letterSpacing="0.05em"
      color="accent.fg"
      whiteSpace="nowrap"
    >
      {resolvedAlbum.library_identifier}
    </Text>
  ) : null;

  if (layout === "row") {
    return (
      <Table.Row
        data-testid="album-row"
        bg="transparent"
        _hover={{ bg: "bg.muted", ...revealRating }}
        _focusWithin={revealRating}
      >
        {/* The table is fixed-layout, so a long title ellipsizes in its column. */}
        <Table.Cell {...cell} overflow="hidden">
          <Flex align="center" gap={4} minW={0}>
            {cover(TRACK_ROW_COVER_SIZE)}
            <Flex direction="column" gap="2px" minW={0}>
              <Link
                as={NextLink}
                href={albumHref}
                title={resolvedAlbum.title}
                fontSize="16px"
                lineHeight="22px"
                fontWeight="600"
                {...ellipsis}
                _hover={{ textDecoration: "underline" }}
              >
                {resolvedAlbum.title}
              </Link>
              <Text
                fontSize="14px"
                lineHeight="20px"
                fontWeight="500"
                title={resolvedAlbum.artist}
                {...ellipsis}
              >
                <ArtistLink
                  artist={resolvedAlbum.artist}
                  credits={resolvedAlbum.artists}
                  friendId={resolvedAlbum.friend_id}
                />
              </Text>
              <Text fontSize="13px" lineHeight="18px" color="fg.muted" {...ellipsis}>
                {[resolvedAlbum.label, displayYear].filter(Boolean).join(" · ")}
              </Text>
              {missingTags.length > 0 && (
                <Flex gap={1.5} mt={1} flexWrap="wrap">
                  <MissingTags keys={missingTags} />
                </Flex>
              )}
            </Flex>
          </Flex>
        </Table.Cell>
        <Table.Cell {...cell}>
          {resolvedAlbum.library_identifier && (
            <MetaTag variant="id" size="sm" whiteSpace="nowrap">
              {resolvedAlbum.library_identifier}
            </MetaTag>
          )}
        </Table.Cell>
        <Table.Cell
          {...cell}
          fontFamily="label"
          fontSize="15px"
          fontWeight="600"
          fontVariantNumeric="tabular-nums"
        >
          {trackCount > 0 ? trackCount : ""}
        </Table.Cell>
        <Table.Cell {...cell}>
          <Flex gap={1.5} flexWrap="wrap">
            {genreBadges("sm")}
          </Flex>
        </Table.Cell>
        <Table.Cell {...cell}>
          <RatingStars value={rating} onChange={handleRatingChange} />
        </Table.Cell>
        <Table.Cell {...cell} pl={0} pr={3.5} textAlign="right">
          {menu}
        </Table.Cell>
      </Table.Row>
    );
  }

  // Full card: the shape of a track card (outline, shadow-md, mb 14px for stacking).
  return (
    <Flex
      data-testid="album-card"
      data-size="full"
      position="relative"
      borderWidth="outline"
      borderRadius="md"
      borderColor="border.ink"
      boxShadow="md"
      p={3}
      gap={3}
      mb="14px"
      width="100%"
      minW={0}
      _hover={{ bg: "bg.muted", ...revealRating }}
      _focusWithin={revealRating}
    >
      <Box alignSelf="start" flexShrink={0}>
        {cover(TRACK_CARD_COVER_SIZE)}
      </Box>

      <Flex direction="column" flex={1} minW={0} gap="2px" pr={{ base: "36px", md: "40px" }}>
        <Link
          as={NextLink}
          href={albumHref}
          title={resolvedAlbum.title}
          fontFamily="heading"
          fontSize={{ base: "16px", md: "20px" }}
          lineHeight={{ base: "22px", md: "28px" }}
          fontWeight="600"
          {...ellipsis}
          _hover={{ textDecoration: "underline" }}
        >
          {resolvedAlbum.title}
        </Link>
        <Text
          fontSize={{ base: "14px", md: "16px" }}
          lineHeight={{ base: "20px", md: "24px" }}
          fontWeight="500"
          title={resolvedAlbum.artist}
          {...ellipsis}
        >
          <ArtistLink
            artist={resolvedAlbum.artist}
            credits={resolvedAlbum.artists}
            friendId={resolvedAlbum.friend_id}
          />
        </Text>
        <Text
          fontSize={{ base: "13px", md: "14px" }}
          lineHeight={{ base: "18px", md: "20px" }}
          color="fg.muted"
          {...ellipsis}
        >
          {resolvedAlbum.label}
          {/* Phones drop the country: one short line. */}
          {resolvedAlbum.country && (
            <Text
              as="span"
              display={{ base: "none", md: "inline" }}
            >{` · ${resolvedAlbum.country}`}</Text>
          )}
          {displayYear && ` (${displayYear})`}
        </Text>

        <Flex
          data-testid="album-card-meta"
          alignItems="center"
          columnGap={2}
          rowGap={1}
          flexWrap={{ base: "nowrap", md: "wrap" }}
          mt={{ base: "4px", md: 2 }}
          minH="16px"
          fontFamily="label"
          fontSize="xs"
          lineHeight="16px"
          color="fg.muted"
          whiteSpace="nowrap"
        >
          {libraryId}
          {trackCount > 0 && <Text as="span">{tracksText}</Text>}
          {resolvedAlbum.catalog_number && (
            <Text as="span" display={{ base: "none", md: "inline" }}>
              Cat {resolvedAlbum.catalog_number}
            </Text>
          )}
          <Box display={{ base: "none", md: "block" }}>
            <RatingStars value={rating} onChange={handleRatingChange} />
          </Box>
          <MissingTags keys={missingTags} />
        </Flex>

        {/* Desktop wraps; a phone keeps one scrolling line so every card is the same height. */}
        <Flex
          data-testid="album-genres"
          aria-label={hasGenres ? "Genres" : undefined}
          gap={1.5}
          mt={2}
          minH={{ base: "20px", md: hasGenres ? "22px" : 0 }}
          flexWrap={{ base: "nowrap", md: "wrap" }}
          overflowX={{ base: "auto", md: "visible" }}
          mr={{ base: "-36px", md: 0 }}
          css={{
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
            "@media (max-width: 47.99em)": { "& > *": { flexShrink: 0 } },
          }}
        >
          {cardGenreBadges}
        </Flex>
        {meta !== undefined && (
          <Flex data-testid="album-card-extra" mt={2} minW={0} gap={1.5} flexWrap="wrap">
            {meta}
          </Flex>
        )}
      </Flex>

      <Box position="absolute" top={{ base: "4px", md: 2 }} right={{ base: "4px", md: 2 }}>
        {menu}
      </Box>
    </Flex>
  );
}

/** The compact card: a vertical tile for horizontal scrollers. The whole tile is
 * one link, so nothing inside it is a link and the tile is the 44px target. It
 * carries no menu or rating, so it needs none of the full card's action hooks. */
function CompactAlbumCard({ album, meta }: { album: Album; meta?: React.ReactNode }) {
  const albumHref = `/albums/${album.release_id}?friend_id=${album.friend_id}`;
  const displayYear = album.year && album.year !== "0" ? album.year : "";
  const defaultMeta = [displayYear, album.format].filter(Boolean).join(" · ");
  return (
    <Link
      asChild
      data-testid="album-card"
      data-size="compact"
      display="flex"
      flexDirection="column"
      alignItems="stretch"
      width="100%"
      height="100%"
      minW={0}
      overflow="clip"
      borderWidth="outline"
      borderRadius="md"
      borderColor="border.ink"
      boxShadow="md"
      color="fg"
      textDecoration="none"
      _hover={{ textDecoration: "none", bg: "bg.muted" }}
    >
      <NextLink href={albumHref} aria-label={`Open ${album.title}`}>
        <Box mx="-2px" mt="-2px">
          <Cover src={artworkOf(album)} alt="" size="100%" fill />
        </Box>
        <Flex as="span" direction="column" gap="2px" p="8px" minW={0}>
          <Text
            as="span"
            fontFamily="heading"
            fontSize="14px"
            lineHeight="18px"
            fontWeight="600"
            {...ellipsis}
            title={album.title}
          >
            {album.title}
          </Text>
          <Text
            as="span"
            fontSize="12px"
            lineHeight="16px"
            fontWeight="500"
            {...ellipsis}
            title={album.artist}
          >
            {album.artist}
          </Text>
          {meta !== undefined ? (
            <Flex as="span" data-testid="album-card-meta" mt="6px" align="center" gap="4px">
              {meta}
            </Flex>
          ) : (
            defaultMeta && (
              <Text
                as="span"
                data-testid="album-card-meta"
                fontFamily="mono"
                fontSize="10px"
                lineHeight="14px"
                mt="4px"
                color="fg.muted"
                {...ellipsis}
              >
                {defaultMeta}
              </Text>
            )
          )}
        </Flex>
      </NextLink>
    </Link>
  );
}

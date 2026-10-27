"use client";
import React, { useState } from "react";
import NextLink from "next/link";
import { Badge, Box, Flex, Table, Text, Link, Image } from "@chakra-ui/react";
import { Album } from "@/types/track";
import { useUpdateAlbumMutation } from "@/hooks/useAlbumsQuery";
import { useAlbum } from "@/hooks/useAlbum";
import AlbumActionsMenu from "@/components/AlbumActionsMenu";
import RecordActionDialog from "@/components/records/RecordActionDialog";
import { useEnrichmentStore } from "@/stores/enrichmentStore";
import { getAlbumWithTracks } from "@/services/internalApi/albums";
import { useRouter } from "next/navigation";
import { toaster } from "@/components/ui/toaster";
import { discogsGenreBadges } from "@/lib/genres/links";
import { useGenreLookup } from "@/hooks/useGenreTaxonomyQuery";
import GenreBadge, { GenreBadgeList } from "@/components/GenreBadge";
import ArtistLink from "@/components/ArtistLink";
import { RatingStars } from "@/components/TrackResult";

/**
 * The Missing checks that show as a tag on a result while their filter is on:
 * what the list was narrowed to is visible on every row and card.
 */
export const ALBUM_MISSING_TAGS = {
  missing_library_identifier: { label: "No identifier", palette: "status.missing" },
  missing_local_cover_art_url: { label: "No local cover", palette: "status.missing" },
  missing_audio: { label: "No audio", palette: "status.analysis" },
} as const;
export type AlbumMissingKey = keyof typeof ALBUM_MISSING_TAGS;

function MissingTags({ keys }: { keys: AlbumMissingKey[] }) {
  if (keys.length === 0) return null;
  return (
    <>
      {keys.map((key) => (
        <Badge
          key={key}
          colorPalette={ALBUM_MISSING_TAGS[key].palette}
          variant="subtle"
          size="sm"
          whiteSpace="nowrap"
          flexShrink={0}
        >
          {ALBUM_MISSING_TAGS[key].label}
        </Badge>
      ))}
    </>
  );
}

const ellipsis = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

const cell = { py: 3, px: 4, borderColor: "border", borderBottomWidth: "rule", verticalAlign: "middle" } as const;
const revealRating = { "& .track-result-rating": { opacity: 1 } };

export type AlbumResultProps = {
  album?: Album;
  albumRef?: { release_id: string; friend_id: number };
  showEditFields?: boolean;
  /** "card": outlined card; "row": album table row; "discovery": compact recent arrival; "cover": artwork grid. */
  layout?: "card" | "row" | "discovery" | "cover";
  /** Active Missing filters, shown as tags. */
  missingTags?: AlbumMissingKey[];
};

export default function AlbumResult({
  album,
  albumRef,
  showEditFields = false,
  layout = "card",
  missingTags = [],
}: AlbumResultProps) {
  const releaseId = albumRef?.release_id ?? album?.release_id ?? "";
  const friendId = albumRef?.friend_id ?? album?.friend_id ?? -1;
  const albumFromStore = useAlbum(releaseId, friendId);
  const resolvedAlbum = albumFromStore ?? album;

  const artworkSrc =
    resolvedAlbum?.audio_file_album_art_url ||
    resolvedAlbum?.album_thumbnail ||
    "/images/placeholder-artwork.png";
  const [rating, setRating] = useState(resolvedAlbum?.album_rating || 0);

  const updateMutation = useUpdateAlbumMutation();
  const genreLookup = useGenreLookup();
  const setEnrichmentQueue = useEnrichmentStore((s) => s.setQueue);
  const router = useRouter();
  const [isEnriching, setIsEnriching] = useState(false);
  const [logCareOpen, setLogCareOpen] = useState(false);
  const displayYear =
    resolvedAlbum?.year && resolvedAlbum.year !== "0" ? resolvedAlbum.year : "";

  React.useEffect(() => {
    if (!resolvedAlbum) return;
    setRating(resolvedAlbum.album_rating || 0);
  }, [resolvedAlbum, resolvedAlbum?.album_rating]);

  if (!resolvedAlbum) return null;

  const handleEnrichAlbum = async () => {
    setIsEnriching(true);
    try {
      const { tracks } = await getAlbumWithTracks(
        resolvedAlbum.release_id,
        resolvedAlbum.friend_id
      );
      if (tracks.length === 0) {
        toaster.create({
          title: "No tracks to enrich",
          description: "This album has no tracks.",
          type: "info",
        });
        return;
      }
      setEnrichmentQueue(
        tracks.map((track) => ({
          trackId: track.track_id,
          friendId: track.friend_id,
        }))
      );
      router.push("/enrich");
    } catch (error) {
      toaster.create({
        title: "Failed to open enrichment",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      setIsEnriching(false);
    }
  };

  const displayGenres = discogsGenreBadges(resolvedAlbum.effective_genres ?? resolvedAlbum.genres, genreLookup);
  const displayStyles = discogsGenreBadges(resolvedAlbum.effective_styles ?? resolvedAlbum.styles, genreLookup);
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

  const genreBadges = (size: "xs" | "sm") => (
    <>
      <GenreBadgeList items={displayGenres} kind="discogs-genre" scope="albums" size={size} />
      <GenreBadgeList items={displayStyles} kind="discogs-style" scope="albums" size={size} />
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
        <GenreBadge key={`${kind}:${item.label}`} item={item} kind={kind} scope="albums" size="sm" />
      ))}
      {hiddenGenres.length > 0 && (
        <Badge
          size="sm"
          colorPalette="neutral"
          variant="subtle"
          title={hiddenGenres.map(({ item }) => item.label).join(", ")}
          aria-label={`${hiddenGenres.length} more genres`}
        >
          +{hiddenGenres.length}
        </Badge>
      )}
    </>
  );

  const menu = (
    // The menu's button is sized by its own component; the phone gets a 44px target.
    <Flex alignItems="center" css={{ "@media (max-width: 47.99em)": { "& button": { minWidth: "44px", minHeight: "44px" } } }}>
      <AlbumActionsMenu
        albumTitle={resolvedAlbum.title}
        albumArtist={resolvedAlbum.artist}
        coverUrl={resolvedAlbum.album_thumbnail ?? undefined}
        catalogue={["Album", resolvedAlbum.library_identifier].filter(Boolean).join(" · ")}
        discogsUrl={resolvedAlbum.discogs_url}
        editAlbumHref={showEditFields ? `/albums/${resolvedAlbum.release_id}/edit?friend_id=${resolvedAlbum.friend_id}` : undefined}
        onEnrichAlbum={handleEnrichAlbum}
        isEnriching={isEnriching}
        onLogCare={() => setLogCareOpen(true)}
      />
      {/* Mounted only while open: a list holds many rows. */}
      {logCareOpen && (
        <RecordActionDialog
          open
          onOpenChange={setLogCareOpen}
          releaseId={resolvedAlbum.release_id}
          friendId={resolvedAlbum.friend_id}
          albumTitle={resolvedAlbum.title}
        />
      )}
    </Flex>
  );

  const cover = (size: string | Record<string, string>) => (
    <Image
      src={artworkSrc}
      alt=""
      boxSize={layout === "cover" ? undefined : size}
      width={layout === "cover" ? "full" : undefined}
      aspectRatio={layout === "cover" ? 1 : undefined}
      flexShrink={0}
      objectFit="cover"
      borderWidth={layout === "cover" ? "outline" : "rule"}
      borderColor="border.ink"
    />
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

  // Compact arrivals on the genre index: artwork above on phones, beside the title on desktop.
  if (layout === "discovery" || layout === "cover") {
    return (
      <Flex
        data-testid="album-discovery-card"
        direction={layout === "cover" ? "column" : { base: "column", md: "row" }}
        borderWidth={layout === "cover" ? 0 : { base: 0, md: "outline" }}
        borderColor="border.ink"
        boxShadow={layout === "cover" ? "none" : { base: "none", md: "sm" }}
        p={layout === "cover" ? 0 : { base: 0, md: 3 }}
        gap={2}
        minW={0}
        css={{ "@media (max-width: 47.99em)": { "& a": { minHeight: "44px", alignItems: "center" } } }}
      >
        <Link asChild flexShrink={0} alignSelf="start" w={layout === "cover" ? "full" : undefined} aria-label={`Open ${resolvedAlbum.title}`}>
          <NextLink href={albumHref}>{cover({ base: "144px", md: "64px" })}</NextLink>
        </Link>
        <Box minW={0}>
          <Link asChild display="flex" fontWeight="semibold" title={resolvedAlbum.title}>
            <NextLink href={albumHref}><Text truncate>{resolvedAlbum.title}</Text></NextLink>
          </Link>
          <Text fontSize="sm" color="fg.muted" truncate title={resolvedAlbum.artist}>{resolvedAlbum.artist}</Text>
          <Flex gap={1} flexWrap="wrap" mt={1} css={layout === "cover" ? { "& > a, & > span": { maxWidth: "100%", whiteSpace: "normal", overflowWrap: "anywhere" } } : undefined}>
            <GenreBadgeList items={displayGenres} kind="discogs-genre" scope="albums" size="sm" />
          </Flex>
        </Box>
      </Flex>
    );
  }

  if (layout === "row") {
    return (
      <Table.Row data-testid="album-row" bg="transparent" _hover={{ bg: "bg.muted", ...revealRating }} _focusWithin={revealRating}>
        {/* The table is fixed-layout, so a long title ellipsizes in its column. */}
        <Table.Cell {...cell} overflow="hidden">
          <Flex align="center" gap={4} minW={0}>
            {cover("64px")}
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
              <ArtistLink artist={resolvedAlbum.artist} friendId={resolvedAlbum.friend_id}>
                <Text fontSize="14px" lineHeight="20px" fontWeight="500" {...ellipsis}>
                  {resolvedAlbum.artist}
                </Text>
              </ArtistLink>
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
            <Badge colorPalette="accent" variant="subtle" size="sm" fontWeight="bold" whiteSpace="nowrap">
              {resolvedAlbum.library_identifier}
            </Badge>
          )}
        </Table.Cell>
        <Table.Cell {...cell} fontFamily="label" fontSize="15px" fontWeight="600" fontVariantNumeric="tabular-nums">
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

  // Card: the shape of a track card (outline, shadow-md, mb 14px for stacking).
  return (
    <Flex
      data-testid="album-card"
      position="relative"
      borderWidth="outline"
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
      {cover({ base: "88px", md: "120px" })}

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
        <ArtistLink artist={resolvedAlbum.artist} friendId={resolvedAlbum.friend_id}>
          <Text fontSize={{ base: "14px", md: "16px" }} lineHeight={{ base: "20px", md: "24px" }} fontWeight="500" {...ellipsis}>
            {resolvedAlbum.artist}
          </Text>
        </ArtistLink>
        <Text fontSize={{ base: "13px", md: "14px" }} lineHeight={{ base: "18px", md: "20px" }} color="fg.muted" {...ellipsis}>
          {resolvedAlbum.label}
          {/* Phones drop the country: one short line. */}
          {resolvedAlbum.country && (
            <Text as="span" display={{ base: "none", md: "inline" }}>{` · ${resolvedAlbum.country}`}</Text>
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
      </Flex>

      <Box position="absolute" top={{ base: "4px", md: 2 }} right={{ base: "4px", md: 2 }}>
        {menu}
      </Box>
    </Flex>
  );
}

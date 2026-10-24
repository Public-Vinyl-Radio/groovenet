"use client";

import React, { useMemo, useState } from "react";
import NextLink from "next/link";
import { Badge, Box, Card, Flex, Link, Progress, SimpleGrid, Text, VStack } from "@chakra-ui/react";

import GenreBadge from "@/components/GenreBadge";
import { useGenreLookup } from "@/hooks/useGenreTaxonomyQuery";
import {
  countGenreBadges,
  discogsGenreBadges,
  genreSearchHref,
  primaryGenreBadges,
  type GenreBadgeCount,
  type GenreBadgeItem,
} from "@/lib/genres/links";
import { Track } from "@/types/track";

/** Appends the count to a badge's label, the way the plain `Badge`s used to (#480). */
const withCount = (item: GenreBadgeCount): GenreBadgeItem => ({
  label: `${item.label} (${item.count})`,
  slug: item.slug,
});

const top = (counts: Map<string, number>, limit = 4): Array<[string, number]> =>
  Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

function usePlaylistStats(tracks: Track[]) {
  const lookup = useGenreLookup();

  return useMemo(() => {
    const keyCounts = new Map<string, number>();
    const genreItemLists: GenreBadgeItem[][] = [];
    const styleItemLists: GenreBadgeItem[][] = [];
    const trackGenreItemLists: GenreBadgeItem[][] = [];
    let bpmCount = 0;
    let bpmSum = 0;
    let bpmMin = Number.POSITIVE_INFINITY;
    let bpmMax = Number.NEGATIVE_INFINITY;
    let ratingCount = 0;
    let ratingSum = 0;
    let favoritesCount = 0;
    let localAudioCount = 0;

    for (const track of tracks) {
      genreItemLists.push(discogsGenreBadges(track.album_genres ?? track.genres, lookup));
      styleItemLists.push(discogsGenreBadges(track.album_styles ?? track.styles, lookup));
      // The DJ-facing genre (#368): a track's own taxonomy links, falling
      // back to its album's Discogs styles when it has none.
      trackGenreItemLists.push(primaryGenreBadges(track, lookup).items);

      const key = typeof track.key === "string" ? track.key.trim() : "";
      if (key) {
        keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
      }

      const bpmValueRaw = typeof track.bpm === "string" ? Number(track.bpm) : Number(track.bpm);
      if (Number.isFinite(bpmValueRaw) && bpmValueRaw > 0) {
        bpmCount += 1;
        bpmSum += bpmValueRaw;
        bpmMin = Math.min(bpmMin, bpmValueRaw);
        bpmMax = Math.max(bpmMax, bpmValueRaw);
      }

      const rating = typeof track.star_rating === "number" ? track.star_rating : null;
      if (rating !== null) {
        ratingCount += 1;
        ratingSum += rating;
        if (rating >= 4) favoritesCount += 1;
      }

      if (track.local_audio_url) {
        localAudioCount += 1;
      }
    }

    return {
      trackCount: tracks.length,
      topGenres: countGenreBadges(genreItemLists, 4),
      topStyles: countGenreBadges(styleItemLists, 4),
      topTrackGenres: countGenreBadges(trackGenreItemLists, 4),
      topKeys: top(keyCounts, 3),
      bpmSummary:
        bpmCount > 0
          ? {
              avg: Math.round(bpmSum / bpmCount),
              min: Math.round(bpmMin),
              max: Math.round(bpmMax),
              coverage: Math.round((bpmCount / tracks.length) * 100),
            }
          : null,
      ratingSummary:
        ratingCount > 0
          ? {
              avg: Number((ratingSum / ratingCount).toFixed(1)),
              favoritesCount,
            }
          : null,
      localAudioCoverage:
        tracks.length > 0 ? Math.round((localAudioCount / tracks.length) * 100) : 0,
    };
  }, [tracks, lookup]);
}

/** A genre/style/track-genre row: linked badges, each carrying its count (#480). */
function CountedGenreBadges({
  items,
  kind,
  size,
  empty,
}: {
  items: GenreBadgeCount[];
  kind: "track" | "discogs-genre" | "discogs-style";
  size?: "xs" | "sm";
  empty: string;
}) {
  if (items.length === 0) {
    return (
      <Text fontSize="xs" color="fg.muted">
        {empty}
      </Text>
    );
  }
  return (
    // A long genre wraps inside its card instead of running past the edge and being cut mid-glyph.
    <Flex
      gap={1}
      wrap="wrap"
      minW={0}
      maxW="100%"
      css={{ "& > *": { maxW: "100%", whiteSpace: "normal", overflowWrap: "anywhere", height: "auto" } }}
    >
      {items.map((item) => (
        <GenreBadge key={`${kind}-${item.label}`} item={withCount(item)} kind={kind} scope="tracks" size={size} />
      ))}
    </Flex>
  );
}

/**
 * The playlist stats panel (#480): counts of genres/styles/BPM/keys/ratings
 * across a playlist's tracks, mobile (collapsible summary) and desktop (a
 * 4-column grid). Genre, style and track-genre badges link to track search
 * filtered by that genre, the same destination `GenreBadge` uses everywhere
 * else (#376); a label the taxonomy doesn't know stays a plain badge.
 */
export default function PlaylistStatsPanel({ tracks }: { tracks: Track[] }) {
  const [statsExpanded, setStatsExpanded] = useState(false);
  const playlistStats = usePlaylistStats(tracks);
  const topGenre = playlistStats.topGenres[0];

  return (
    <>
      {/* Mobile: compact summary bar with expand toggle */}
      <Box display={{ base: "block", md: "none" }} mb={3}>
        <Flex
          align="center"
          gap={2}
          fontSize="xs"
          color="fg.muted"
          flexWrap="wrap"
          cursor="pointer"
          onClick={() => setStatsExpanded((v) => !v)}
          py={1}
        >
          <Text fontWeight="medium" color="fg">
            {playlistStats.trackCount} tracks
          </Text>
          {playlistStats.bpmSummary && (
            <>
              <Text color="fg.muted">·</Text>
              <Text>BPM {playlistStats.bpmSummary.avg}</Text>
            </>
          )}
          {topGenre && (
            <>
              <Text color="fg.muted">·</Text>
              {topGenre.slug ? (
                <Link
                  asChild
                  focusVisibleRing="outside"
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`Search tracks in ${topGenre.label}`}
                >
                  <NextLink href={genreSearchHref(topGenre.slug, "tracks")}>{topGenre.label}</NextLink>
                </Link>
              ) : (
                <Text>{topGenre.label}</Text>
              )}
            </>
          )}
          <Text color="accent.fg" ml="auto" fontWeight="medium">
            {statsExpanded ? "Hide stats" : "Show stats"}
          </Text>
        </Flex>
        {statsExpanded && (
          <SimpleGrid columns={2} gap={2} mt={2}>
            <Card.Root size="sm" variant="outline">
              <Card.Body>
                <VStack align="start" gap={1}>
                  <Text fontSize="xs" color="fg.muted">Tracks</Text>
                  <Text fontWeight="bold">{playlistStats.trackCount}</Text>
                  <Text fontSize="xs" color="fg.muted">Audio Ready: {playlistStats.localAudioCoverage}%</Text>
                  <Progress.Root value={playlistStats.localAudioCoverage} size="xs" width="100%">
                    <Progress.Track><Progress.Range /></Progress.Track>
                  </Progress.Root>
                </VStack>
              </Card.Body>
            </Card.Root>
            <Card.Root size="sm" variant="outline">
              <Card.Body>
                <VStack align="start" gap={1}>
                  <Text fontSize="xs" color="fg.muted">Top Genres</Text>
                  <CountedGenreBadges items={playlistStats.topGenres} kind="discogs-genre" size="xs" empty="None" />
                </VStack>
              </Card.Body>
            </Card.Root>
            <Card.Root size="sm" variant="outline">
              <Card.Body>
                <VStack align="start" gap={1}>
                  <Text fontSize="xs" color="fg.muted">Top track genres</Text>
                  <CountedGenreBadges items={playlistStats.topTrackGenres} kind="track" size="xs" empty="None" />
                </VStack>
              </Card.Body>
            </Card.Root>
            <Card.Root size="sm" variant="outline">
              <Card.Body>
                <VStack align="start" gap={1}>
                  <Text fontSize="xs" color="fg.muted">Rhythm</Text>
                  {playlistStats.bpmSummary ? (
                    <Text fontSize="xs">BPM {playlistStats.bpmSummary.avg} ({playlistStats.bpmSummary.min}–{playlistStats.bpmSummary.max})</Text>
                  ) : <Text fontSize="xs" color="fg.muted">No BPM</Text>}
                  <Flex gap={1} wrap="wrap">
                    {playlistStats.topKeys.map(([name, count]) => (
                      <Badge key={`key-${name}`} variant="subtle" fontSize="xs">{name} ({count})</Badge>
                    ))}
                  </Flex>
                </VStack>
              </Card.Body>
            </Card.Root>
            <Card.Root size="sm" variant="outline">
              <Card.Body>
                <VStack align="start" gap={1}>
                  <Text fontSize="xs" color="fg.muted">Ratings</Text>
                  {playlistStats.ratingSummary ? (
                    <Text fontSize="xs">Avg {playlistStats.ratingSummary.avg} · {playlistStats.ratingSummary.favoritesCount} favs</Text>
                  ) : <Text fontSize="xs" color="fg.muted">No ratings</Text>}
                  <CountedGenreBadges
                    items={playlistStats.topStyles.slice(0, 2)}
                    kind="discogs-style"
                    size="xs"
                    empty="No styles"
                  />
                </VStack>
              </Card.Body>
            </Card.Root>
          </SimpleGrid>
        )}
      </Box>

      {/* Desktop: full grid */}
      <SimpleGrid columns={{ base: 1, md: 2, lg: 5 }} gap={3} mb={4} display={{ base: "none", md: "grid" }}>
        <Card.Root size="sm" variant="outline">
          <Card.Body>
            <VStack align="start" gap={1}>
              <Text fontSize="xs" color="fg.muted">Tracks</Text>
              <Text fontWeight="bold" fontSize="lg">{playlistStats.trackCount}</Text>
              <Text fontSize="xs" color="fg.muted">Audio Ready: {playlistStats.localAudioCoverage}%</Text>
              <Progress.Root value={playlistStats.localAudioCoverage} size="xs" width="100%">
                <Progress.Track>
                  <Progress.Range />
                </Progress.Track>
              </Progress.Root>
            </VStack>
          </Card.Body>
        </Card.Root>
        <Card.Root size="sm" variant="outline">
          <Card.Body>
            <VStack align="start" gap={1}>
              <Text fontSize="xs" color="fg.muted">Top Genres</Text>
              <CountedGenreBadges items={playlistStats.topGenres} kind="discogs-genre" empty="No genre tags" />
            </VStack>
          </Card.Body>
        </Card.Root>
        <Card.Root size="sm" variant="outline">
          <Card.Body>
            <VStack align="start" gap={1}>
              <Text fontSize="xs" color="fg.muted">Top track genres</Text>
              <CountedGenreBadges items={playlistStats.topTrackGenres} kind="track" empty="No track genres" />
            </VStack>
          </Card.Body>
        </Card.Root>
        <Card.Root size="sm" variant="outline">
          <Card.Body>
            <VStack align="start" gap={1}>
              <Text fontSize="xs" color="fg.muted">Rhythm & Harmony</Text>
              {playlistStats.bpmSummary ? (
                <>
                  <Text fontSize="sm">BPM avg {playlistStats.bpmSummary.avg} ({playlistStats.bpmSummary.min}-{playlistStats.bpmSummary.max})</Text>
                  <Text fontSize="xs" color="fg.muted">BPM coverage: {playlistStats.bpmSummary.coverage}%</Text>
                </>
              ) : (
                <Text fontSize="sm" color="fg.muted">No BPM data</Text>
              )}
              <Flex gap={1} wrap="wrap">
                {playlistStats.topKeys.length > 0 ? playlistStats.topKeys.map(([name, count]) => (
                  <Badge key={`key-${name}`} variant="subtle">
                    {name} ({count})
                  </Badge>
                )) : <Text fontSize="xs" color="fg.muted">No key data</Text>}
              </Flex>
            </VStack>
          </Card.Body>
        </Card.Root>
        <Card.Root size="sm" variant="outline">
          <Card.Body>
            <VStack align="start" gap={1}>
              <Text fontSize="xs" color="fg.muted">Ratings & Styles</Text>
              {playlistStats.ratingSummary ? (
                <>
                  <Text fontSize="sm">Avg rating: {playlistStats.ratingSummary.avg}</Text>
                  <Text fontSize="xs" color="fg.muted">4★+ tracks: {playlistStats.ratingSummary.favoritesCount}</Text>
                </>
              ) : (
                <Text fontSize="sm" color="fg.muted">No ratings yet</Text>
              )}
              <CountedGenreBadges items={playlistStats.topStyles} kind="discogs-style" empty="No style tags" />
            </VStack>
          </Card.Body>
        </Card.Root>
      </SimpleGrid>
    </>
  );
}

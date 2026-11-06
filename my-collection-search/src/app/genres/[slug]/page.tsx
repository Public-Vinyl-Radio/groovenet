"use client";

import { SectionHeading } from "@/components/ui/SectionHeading";
import { innerRadius } from "@/app/corners";
import React from "react";
import NextLink from "next/link";
import { useParams } from "next/navigation";
import {
  Box,
  Button,
  Flex,
  Grid,
  Skeleton,
  Stack,
  Text,
  useBreakpointValue,
} from "@chakra-ui/react";
import { MetaTag } from "@/components/ui/RoleTags";
import AlbumResult from "@/components/AlbumResult";
import TrackResultStore from "@/components/TrackResultStore";
import TrackActionsMenu from "@/components/TrackActionsMenu";
import { useTrack } from "@/hooks/useTrack";
import { useInfiniteScrollSentinel } from "@/hooks/useInfiniteScrollSentinel";
import GenreBpmSpread from "@/components/genres/GenreBpmSpread";
import { GenreCrate } from "@/components/genres/GenreCrate";
import PageHeader from "@/components/layout/PageHeader";
import PageContainer from "@/components/layout/PageContainer";
import { useGenrePageQuery } from "@/hooks/useGenrePageQuery";
import { useGenreResults, type GenreView } from "@/hooks/useGenreResults";
import { useGenrePlayback } from "@/hooks/useGenrePlayback";
import { genreHref } from "@/lib/genres/links";
import { useUsername } from "@/providers/UsernameProvider";
import type { GenrePageResponse } from "@/api-contract/schemas";

// Fewer than one widest (four-cover) row, using full friend-scoped totals.
const THIN_GENRE_ALBUM_THRESHOLD = 4;

const PHONE_ALBUM_PAGE_SIZE = 10;
const DESKTOP_ALBUM_PAGE_SIZE = 24;
// Rows shown before "Show all": a parent like Latin has ~50 children.
const GENRE_LIST_CAP = 10;

const GENRES_CRUMB = { label: "Genres", href: "/genres" };

/** A track row with the same ⋯ menu as track search. */
function GenreTrackRow({ trackId, friendId }: { trackId: string; friendId: number }) {
  const track = useTrack(trackId, friendId);
  return (
    <TrackResultStore
      trackId={trackId}
      friendId={friendId}
      layout="row"
      showUsername={false}
      buttons={track ? [<TrackActionsMenu key="menu" track={track} />] : undefined}
    />
  );
}

function GenreContent({
  page,
  friendId,
}: {
  page: Omit<GenrePageResponse, "top_albums" | "top_tracks">;
  friendId: number | undefined;
}) {
  const { genre, counts, stats } = page;
  const isThin = counts.albums_total < THIN_GENRE_ALBUM_THRESHOLD;
  const relatedTitle = isThin ? "Neighbouring crates" : "Related genres";
  const [view, setView] = React.useState<GenreView>("tracks");
  // ssr: false reads the real viewport on the first render. This component only
  // mounts once the page query has resolved on the client, so there is no
  // hydration mismatch, and the page size (part of the query key) never flips
  // from the "base" fallback to desktop, which would fetch twice.
  const isDesktop = useBreakpointValue({ base: false, md: true }, { ssr: false }) === true;
  const albumPageSize = isDesktop ? DESKTOP_ALBUM_PAGE_SIZE : PHONE_ALBUM_PAGE_SIZE;
  const results = useGenreResults(genre.slug, friendId, view, albumPageSize);
  const playback = useGenrePlayback(genre.slug, friendId);
  const { fetchNextPage } = results;
  const loadMore = React.useCallback(() => void fetchNextPage(), [fetchNextPage]);
  const sentinelRef = useInfiniteScrollSentinel({
    hasMore: results.hasNextPage,
    loading: results.isFetchingNextPage,
    onLoadMore: loadMore,
  });
  const refs = results.data?.pages.flatMap((page) => page.refs) ?? [];
  const emptySlots = (columns: number) =>
    refs.length === 0 ? columns : (columns - (refs.length % columns)) % columns;
  const actions = (
    <Flex gap={3} w={{ base: "full", md: "auto" }}>
      <Button
        flex={{ base: 1, md: "initial" }}
        minH="44px"
        variant="solid"
        colorPalette="accent"
        disabled={playback.busy || !stats.playable_tracks}
        loading={playback.busy}
        onClick={() => void playback.play(false)}
      >
        Play all
      </Button>
      <Button
        flex={{ base: 1, md: "initial" }}
        minH="44px"
        variant="outline"
        disabled={playback.busy || !stats.playable_tracks}
        onClick={() => void playback.play(true)}
      >
        Shuffle
      </Button>
    </Flex>
  );
  const statItems = [
    {
      label: "BPM range",
      value:
        stats.bpm_min === null || stats.bpm_max === null
          ? "—"
          : `${stats.bpm_min}–${stats.bpm_max}`,
    },
    {
      label: "Added this year",
      value: stats.added_this_year.toLocaleString(),
      title: `Tracks added to the collection in ${stats.year} (UTC), using date_added from collection imports.`,
    },
  ];
  return (
    <>
      <PageHeader>
        <PageHeader.Context
          crumbs={[
            GENRES_CRUMB,
            ...page.ancestors.map((ancestor) => ({
              label: ancestor.name,
              href: genreHref(ancestor.slug),
            })),
            { label: genre.name },
          ]}
        />
        <PageHeader.Title
          meta={`${counts.tracks_total.toLocaleString()} tracks · ${counts.albums_total.toLocaleString()} albums`}
          metaOnPhone={false}
        >
          {genre.name}
        </PageHeader.Title>
        <PageHeader.Actions desktop={actions} />
      </PageHeader>
      <Stack gap={5}>
        {genre.source === "custom" && (
          <MetaTag alignSelf="start" title="Added to the taxonomy; not a Discogs genre or style">
            Custom
          </MetaTag>
        )}
        <Grid
          as="dl"
          templateColumns="repeat(2, minmax(0, 1fr))"
          borderWidth="outline"
          borderRadius="md"
          borderColor="border.ink"
          boxShadow="md"
        >
          {statItems.map((item, index) => (
            <Box
              key={item.label}
              px={{ base: 3, md: 4 }}
              py={3}
              minW={0}
              borderInlineStartWidth={index ? "outline" : 0}
              borderColor="border.ink"
              title={item.title}
            >
              <Text
                as="dt"
                fontFamily="label"
                fontSize="xs"
                color="fg.muted"
                textTransform="uppercase"
              >
                {item.label}
              </Text>
              <Text
                as="dd"
                fontFamily="label"
                fontSize={{ base: "xl", md: "2xl" }}
                fontWeight="bold"
                overflowWrap="anywhere"
              >
                {item.value}
              </Text>
            </Box>
          ))}
        </Grid>
        <Box display={{ base: "block", md: "none" }}>{actions}</Box>
        {!stats.playable_tracks && (
          <Text color="fg.muted" fontSize="sm">
            No playable tracks in this genre yet.
          </Text>
        )}
        {playback.problem && (
          <Text role="alert" color="fg.error">
            {playback.problem}
          </Text>
        )}
        <Grid
          templateColumns={{ base: "minmax(0, 1fr)", xl: "minmax(0, 1fr) 300px" }}
          gap={{ base: 7, xl: 8 }}
          alignItems="start"
        >
          <Stack gap={4} minW={0}>
            <Flex
              role="group"
              aria-label="Collection view"
              alignSelf={{ base: "stretch", md: "start" }}
              borderWidth="outline"
              borderRadius="md"
              borderColor="border.ink"
            >
              {(["albums", "tracks"] as const).map((item, index) => (
                <Button
                  key={item}
                  // One joined strip: only its outer corners are rounded.
                  borderRadius="0"
                  borderStartRadius={index === 0 ? innerRadius : undefined}
                  borderEndRadius={index === 1 ? innerRadius : undefined}
                  flex={1}
                  minH="44px"
                  variant={view === item ? "solid" : "ghost"}
                  colorPalette="neutral"
                  boxShadow="none"
                  borderWidth={0}
                  aria-pressed={view === item}
                  onClick={() => setView(item)}
                >
                  {item === "albums" ? "Albums" : "Tracks"} [
                  {(item === "albums" ? counts.albums_total : counts.tracks_total).toLocaleString()}
                  ]
                </Button>
              ))}
            </Flex>
            {view === "albums" && page.children.length > 0 && (
              <Box as="section" aria-label="Subgenres" pb={2} pe={1.5}>
                <GenreCrate title="Subgenres" genres={page.children} maxRows={GENRE_LIST_CAP} />
              </Box>
            )}
            {isThin && view === "albums" && (
              <Box>
                <SectionHeading>Build this crate</SectionHeading>
                <Text color="fg.muted" fontSize="sm" mt={2}>
                  Room for more records. Explore neighbouring crates for somewhere to dig next.
                </Text>
              </Box>
            )}
            {results.isPending ? (
              <Grid
                data-testid="genre-results-loading"
                templateColumns="repeat(2, minmax(0, 1fr))"
                gap={5}
              >
                <Skeleton h="180px" />
                <Skeleton h="180px" />
              </Grid>
            ) : (
              <>
                {refs.length === 0 && !results.error && (
                  <Text color="fg.muted">No {view} in this genre yet.</Text>
                )}
                {view === "albums" ? (
                  <Grid
                    aria-label="Albums"
                    templateColumns={{
                      base: "repeat(2, minmax(0, 1fr))",
                      lg: "repeat(3, minmax(0, 1fr))",
                      "2xl": "repeat(4, minmax(0, 1fr))",
                    }}
                    gap={5}
                    p="0 6px 6px 0"
                  >
                    {refs.map((ref) => (
                      <AlbumResult
                        key={`${ref.id}:${ref.friend_id}`}
                        albumRef={{ release_id: ref.id, friend_id: ref.friend_id }}
                        layout="cover"
                      />
                    ))}
                    {isThin &&
                      !results.error &&
                      !results.hasNextPage &&
                      Array.from({ length: 4 }, (_, index) => (
                        <Box
                          key={`empty-${index}`}
                          data-testid="crate-empty-slot"
                          aria-hidden="true"
                          aspectRatio={1}
                          alignSelf="start"
                          borderWidth="outline"
                          borderRadius="md"
                          borderStyle="dashed"
                          borderColor="border.ink"
                          display={{
                            base: index < emptySlots(2) ? "block" : "none",
                            lg: index < emptySlots(3) ? "block" : "none",
                            "2xl": index < emptySlots(4) ? "block" : "none",
                          }}
                        />
                      ))}
                  </Grid>
                ) : (
                  refs.length > 0 && (
                    <Box
                      aria-label="Tracks"
                      borderWidth="outline"
                      borderRadius="md"
                      borderColor="border.ink"
                      boxShadow="md"
                      css={{ containerType: "inline-size" }}
                    >
                      {refs.map((ref) => (
                        <GenreTrackRow
                          key={`${ref.id}:${ref.friend_id}`}
                          trackId={ref.id}
                          friendId={ref.friend_id}
                        />
                      ))}
                    </Box>
                  )
                )}
              </>
            )}
            {results.error && (
              <Box role="alert">
                <Text color="fg.error">
                  Couldn&apos;t load {view}: {results.error.message}
                </Text>
                <Button
                  minH="44px"
                  onClick={() =>
                    void (results.isFetchNextPageError
                      ? results.fetchNextPage()
                      : results.refetch())
                  }
                >
                  Try again
                </Button>
              </Box>
            )}
            {results.hasNextPage && !results.error && (
              <Box ref={sentinelRef} h="1px" data-testid="genre-results-sentinel" />
            )}
          </Stack>
          <Stack as="aside" aria-label="Genre insights" gap={7} minW={0} pe={1.5}>
            <Box as="section" aria-label={relatedTitle}>
              <GenreCrate title={relatedTitle} genres={page.related} maxRows={GENRE_LIST_CAP} />
            </Box>
            {isThin && (
              <Box
                as="section"
                aria-label="Weekly wantlist picks"
                borderWidth="outline"
                borderRadius="md"
                borderStyle="dashed"
                borderColor="border.ink"
                p={4}
              >
                <SectionHeading overflowWrap="anywhere">Weekly wantlist picks</SectionHeading>
                <Text mt={3} color="fg.muted" fontSize="sm">
                  Picks arrive with the recommender. This space is reserved for future weekly
                  wantlist picks.
                </Text>
              </Box>
            )}
            <GenreBpmSpread stats={stats} />
          </Stack>
        </Grid>
      </Stack>
    </>
  );
}

/** While the genre loads, or when it couldn't: the trail and a generic title. */
function GenrePlaceholderHeader() {
  return (
    <PageHeader>
      <PageHeader.Context crumbs={[GENRES_CRUMB, { label: "Genre" }]} />
      <PageHeader.Title>Genre</PageHeader.Title>
      <PageHeader.Actions />
    </PageHeader>
  );
}

export default function GenrePage() {
  const slug = decodeURIComponent(useParams<{ slug: string }>().slug);
  const { friend } = useUsername();
  const query = useGenrePageQuery(slug, friend?.id);
  return (
    <Box w="full">
      <PageContainer>
        {query.error ? (
          <>
            <GenrePlaceholderHeader />
            <Box
              role="alert"
              borderWidth="outline"
              borderColor="border.ink"
              boxShadow="sm"
              p={4}
              borderRadius="md"
            >
              <Text fontWeight="medium">Couldn&apos;t load this genre</Text>
              <Text color="fg.muted" mt={1}>
                {query.error.message}
              </Text>
              <Button minH="44px" mt={3} onClick={() => void query.refetch()}>
                Try again
              </Button>
              <Button asChild minH="44px" mt={3} ms={3}>
                <NextLink href="/genres">All genres</NextLink>
              </Button>
            </Box>
          </>
        ) : !query.data ? (
          <>
            <GenrePlaceholderHeader />
            <Stack data-testid="genre-page-loading">
              <Skeleton h="36px" maxW="320px" />
              <Skeleton h="80px" />
            </Stack>
          </>
        ) : (
          <GenreContent key={`${slug}:${friend?.id}`} page={query.data} friendId={friend?.id} />
        )}
      </PageContainer>
    </Box>
  );
}

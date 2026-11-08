"use client";

import { SectionHeading } from "@/components/ui/SectionHeading";
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
import GenreBadge from "@/components/GenreBadge";
import { MetaTag } from "@/components/ui/RoleTags";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ViewModeSwitch } from "@/components/layout/ListHeader";
import { TrackListHeader } from "@/components/TrackResult";
import { useTrackViewMode, type TrackViewMode } from "@/hooks/useTrackViewMode";
import { FiPlay, FiShuffle } from "react-icons/fi";
import AlbumResult from "@/components/AlbumResult";
import TrackResultStore from "@/components/TrackResultStore";
import TrackActionsMenu from "@/components/TrackActionsMenu";
import { useTrack } from "@/hooks/useTrack";
import { useInfiniteScrollSentinel } from "@/hooks/useInfiniteScrollSentinel";
import GenreBpmSpread from "@/components/genres/GenreBpmSpread";
import { GenreCrate } from "@/components/genres/GenreCrate";
import PageHeader, { type HeaderAction } from "@/components/layout/PageHeader";
import PageContainer from "@/components/layout/PageContainer";
import { useGenrePageQuery } from "@/hooks/useGenrePageQuery";
import { useGenreResults, type GenreView } from "@/hooks/useGenreResults";
import { useGenrePlayback } from "@/hooks/useGenrePlayback";
import { genreHref } from "@/lib/genres/links";
import { useUsername } from "@/providers/UsernameProvider";
import type { GenrePageRef, GenrePageResponse } from "@/api-contract/schemas";

// Fewer than one widest (four-cover) row, using full friend-scoped totals.
const THIN_GENRE_ALBUM_THRESHOLD = 4;

const PHONE_ALBUM_PAGE_SIZE = 10;
const DESKTOP_ALBUM_PAGE_SIZE = 24;
// Rows shown before "Show all": a parent like Latin has ~50 children.
const GENRE_LIST_CAP = 10;

/**
 * Below `xl` the insights aside stacks under the list, so an endless list would
 * keep it out of reach: related genres move above the tabs as a scrolling row
 * and the list ends in a "Show more" button instead of loading on scroll.
 */
function RelatedChips({ title, genres }: { title: string; genres: GenrePageRef[] }) {
  return (
    <Box as="section" aria-label={title}>
      <Flex
        as="ul"
        listStyleType="none"
        gap={2}
        overflowX="auto"
        // Room for the chips' hard shadow and the scrollbar.
        pb={2}
        pe={1.5}
      >
        {genres.map((genre) => (
          <Box as="li" key={genre.id} flexShrink={0}>
            <GenreBadge
              kind="track"
              item={{ label: genre.name, slug: genre.slug }}
              count={genre.track_count}
            />
          </Box>
        ))}
      </Flex>
    </Box>
  );
}

const GENRES_CRUMB = { label: "Genres", href: "/genres" };

/** A track row with the same ⋯ menu as track search. */
function GenreTrackRow({
  trackId,
  friendId,
  layout,
}: {
  trackId: string;
  friendId: number;
  layout: TrackViewMode;
}) {
  const track = useTrack(trackId, friendId);
  return (
    <TrackResultStore
      trackId={trackId}
      friendId={friendId}
      layout={layout}
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
  // Below xl the aside sits under the list, so the list must not scroll forever.
  const isXl = useBreakpointValue({ base: false, xl: true }, { ssr: false }) === true;
  const { layout, viewMode, setViewMode } = useTrackViewMode();
  const results = useGenreResults(genre.slug, friendId, view, albumPageSize);
  const playback = useGenrePlayback(genre.slug, friendId);
  const { fetchNextPage } = results;
  const loadMore = React.useCallback(() => void fetchNextPage(), [fetchNextPage]);
  const sentinelRef = useInfiniteScrollSentinel({
    hasMore: results.hasNextPage && isXl,
    loading: results.isFetchingNextPage,
    onLoadMore: loadMore,
  });
  const total = view === "albums" ? counts.albums_total : counts.tracks_total;
  const refs = results.data?.pages.flatMap((page) => page.refs) ?? [];
  const emptySlots = (columns: number) =>
    refs.length === 0 ? columns : (columns - (refs.length % columns)) % columns;
  // Play all is the header's one solid button (a play key on phones). Shuffle
  // is a labelled button on desktop and a kebab item on phones.
  const unplayable = playback.busy || !stats.playable_tracks;
  const headerActions: HeaderAction[] = [
    {
      label: "Play all",
      icon: <FiPlay />,
      onClick: () => void playback.play(false),
      primary: true,
      disabled: unplayable,
      loading: playback.busy,
      phone: "icon",
    },
    {
      label: "Shuffle",
      icon: <FiShuffle />,
      onClick: () => void playback.play(true),
      disabled: unplayable,
      phone: "menu",
    },
  ];
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
        <PageHeader.Actions
          actions={headerActions}
          desktop={
            view === "tracks" ? <ViewModeSwitch value={viewMode} onChange={setViewMode} /> : null
          }
        />
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
        {!isXl && page.related.length > 0 && (
          <RelatedChips title={relatedTitle} genres={page.related} />
        )}
        <Grid
          templateColumns={{ base: "minmax(0, 1fr)", xl: "minmax(0, 1fr) 300px" }}
          gap={{ base: 7, xl: 8 }}
          alignItems="start"
        >
          <Stack gap={4} minW={0}>
            <SegmentedControl
              framed
              aria-label="Collection view"
              alignSelf={{ base: "stretch", md: "start" }}
              items={[
                { value: "albums", label: `Albums [${counts.albums_total.toLocaleString()}]` },
                { value: "tracks", label: `Tracks [${counts.tracks_total.toLocaleString()}]` },
              ]}
              value={view}
              onValueChange={(next) => setView(next as GenreView)}
            />
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
                  refs.length > 0 &&
                  (layout === "row" ? (
                    <Box
                      aria-label="Tracks"
                      borderWidth="outline"
                      borderRadius="md"
                      borderColor="border.ink"
                      boxShadow="md"
                      css={{ containerType: "inline-size" }}
                    >
                      <TrackListHeader />
                      {refs.map((ref) => (
                        <GenreTrackRow
                          key={`${ref.id}:${ref.friend_id}`}
                          trackId={ref.id}
                          friendId={ref.friend_id}
                          layout="row"
                        />
                      ))}
                    </Box>
                  ) : (
                    // Cards carry a 14px mb; the 6px rowGap tops it up to the 20px
                    // column gap. The padding leaves room for their hard shadow.
                    <Grid
                      aria-label="Tracks"
                      templateColumns={{
                        base: "minmax(0, 1fr)",
                        md: "repeat(2, minmax(0, 1fr))",
                      }}
                      columnGap={5}
                      rowGap={{ base: 0, md: "6px" }}
                      p="0 6px 6px 0"
                    >
                      {refs.map((ref) => (
                        <GenreTrackRow
                          key={`${ref.id}:${ref.friend_id}`}
                          trackId={ref.id}
                          friendId={ref.friend_id}
                          layout="card"
                        />
                      ))}
                    </Grid>
                  ))
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
            {results.hasNextPage &&
              !results.error &&
              (isXl ? (
                <Box ref={sentinelRef} h="1px" data-testid="genre-results-sentinel" />
              ) : (
                <Stack align="start" gap={2}>
                  <Text color="fg.muted" fontFamily="label" fontSize="xs">
                    Showing {refs.length.toLocaleString()} of {total.toLocaleString()}
                  </Text>
                  <Button minH="44px" loading={results.isFetchingNextPage} onClick={loadMore}>
                    Show more
                  </Button>
                </Stack>
              ))}
          </Stack>
          <Stack as="aside" aria-label="Genre insights" gap={7} minW={0} pe={1.5}>
            {isXl && (
              <Box as="section" aria-label={relatedTitle}>
                <GenreCrate title={relatedTitle} genres={page.related} maxRows={GENRE_LIST_CAP} />
              </Box>
            )}
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

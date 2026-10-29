"use client";

import React from "react";
import NextLink from "next/link";
import { useParams } from "next/navigation";
import { Badge, Box, Button, Flex, Grid, Heading, Skeleton, Stack, Text } from "@chakra-ui/react";
import AlbumResult from "@/components/AlbumResult";
import TrackResultStore from "@/components/TrackResultStore";
import GenreBpmSpread from "@/components/genres/GenreBpmSpread";
import { GenreCrate } from "@/components/genres/GenreCrate";
import PageHeader from "@/components/layout/PageHeader";
import PageContainer from "@/components/layout/PageContainer";
import { useGenrePageQuery } from "@/hooks/useGenrePageQuery";
import { useGenreResults, type GenreView } from "@/hooks/useGenreResults";
import { useGenrePlayback } from "@/hooks/useGenrePlayback";
import { useUsername } from "@/providers/UsernameProvider";
import type { GenrePageResponse } from "@/api-contract/schemas";

// Fewer than one widest (four-cover) row, using full friend-scoped totals.
const THIN_GENRE_ALBUM_THRESHOLD = 4;

const GENRES_CRUMB = { label: "Genres", href: "/genres" };

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
  const [view, setView] = React.useState<GenreView>("albums");
  const [aliasesOpen, setAliasesOpen] = React.useState(false);
  const aliasesId = React.useId();
  const results = useGenreResults(genre.slug, friendId, view);
  const playback = useGenrePlayback(genre.slug, friendId);
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
    { label: "Tracks", value: counts.tracks_total.toLocaleString() },
    { label: "Albums", value: counts.albums_total.toLocaleString() },
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
      <PageHeader
        title={genre.name}
        breadcrumbs={[
          GENRES_CRUMB,
          ...page.ancestors.map((ancestor) => ({
            label: ancestor.name,
            href: `/genres/${encodeURIComponent(ancestor.slug)}`,
          })),
          { label: genre.name },
        ]}
        desktopActions={actions}
      />
      <Stack gap={5}>
        {genre.source === "custom" && (
          <Badge
            alignSelf="start"
            variant="outline"
            title="Added to the taxonomy; not a Discogs genre or style"
          >
            Custom
          </Badge>
        )}
        <Grid
          as="dl"
          templateColumns={{ base: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }}
          borderWidth="outline"
          borderColor="border.ink"
          boxShadow="md"
        >
          {statItems.map((item, index) => (
            <Box
              key={item.label}
              px={{ base: 3, md: 4 }}
              py={3}
              minW={0}
              borderInlineStartWidth={{
                base: index % 2 ? "outline" : 0,
                md: index ? "outline" : 0,
              }}
              borderTopWidth={{ base: index > 1 ? "outline" : 0, md: 0 }}
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
        {genre.aliases.length > 0 && (
          <Flex align="start" gap={2} minW={0}>
            <Text
              id={aliasesId}
              flex={1}
              minW={0}
              fontSize="sm"
              color="fg.muted"
              truncate={!aliasesOpen}
              overflowWrap="anywhere"
              py={3}
            >
              <Box as="span" fontFamily="label" fontSize="xs" textTransform="uppercase">
                Also matches{" "}
              </Box>
              {genre.aliases.join(", ")}
            </Text>
            <Button
              minH="44px"
              variant="plain"
              aria-controls={aliasesId}
              aria-expanded={aliasesOpen}
              onClick={() => setAliasesOpen(!aliasesOpen)}
              textDecoration="underline"
            >
              {aliasesOpen ? "Less" : "More"}
            </Button>
          </Flex>
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
              borderColor="border.ink"
            >
              {(["albums", "tracks"] as const).map((item) => (
                <Button
                  key={item}
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
                <GenreCrate title="Subgenres" genres={page.children} />
              </Box>
            )}
            {isThin && view === "albums" && (
              <Box>
                <Heading as="h2" fontSize="xl">
                  Build this crate
                </Heading>
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
                      borderColor="border.ink"
                      boxShadow="md"
                      css={{ containerType: "inline-size" }}
                    >
                      {refs.map((ref) => (
                        <TrackResultStore
                          key={`${ref.id}:${ref.friend_id}`}
                          trackId={ref.id}
                          friendId={ref.friend_id}
                          layout="row"
                          showUsername={false}
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
            {results.hasNextPage && (
              <Button
                minH="44px"
                loading={results.isFetchingNextPage}
                disabled={results.isFetchingNextPage}
                onClick={() => void results.fetchNextPage()}
              >
                Load more {view}
              </Button>
            )}
          </Stack>
          <Stack as="aside" aria-label="Genre insights" gap={7} minW={0} pe={1.5}>
            <Box as="section" aria-label={relatedTitle}>
              <GenreCrate title={relatedTitle} genres={page.related} />
            </Box>
            {isThin && (
              <Box
                as="section"
                aria-label="Weekly wantlist picks"
                borderWidth="outline"
                borderStyle="dashed"
                borderColor="border.ink"
                p={4}
              >
                <Heading as="h2" fontSize="lg" overflowWrap="anywhere">
                  Weekly wantlist picks
                </Heading>
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

export default function GenrePage() {
  const slug = decodeURIComponent(useParams<{ slug: string }>().slug);
  const { friend } = useUsername();
  const query = useGenrePageQuery(slug, friend?.id);
  return (
    <Box
      w="full"
      css={{
        "& [data-testid=page-header] h1": {
          fontSize: { md: "48px" },
          whiteSpace: { md: "normal" },
          overflowWrap: "anywhere",
        },
      }}
    >
      <PageContainer size="wide">
        {query.error ? (
          <>
            <PageHeader title="Genre" breadcrumbs={[GENRES_CRUMB, { label: "Genre" }]} />
            <Box role="alert" borderWidth="outline" borderColor="border.ink" boxShadow="sm" p={4}>
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
            <PageHeader title="Genre" breadcrumbs={[GENRES_CRUMB, { label: "Genre" }]} />
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

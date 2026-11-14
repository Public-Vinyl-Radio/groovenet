"use client";

import React from "react";
import NextLink from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Box, Button, Flex, Grid, Link, Skeleton, Stack, Text } from "@chakra-ui/react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { MetaTag } from "@/components/ui/RoleTags";
import { SectionHeading } from "@/components/ui/SectionHeading";
import AlbumResult from "@/components/AlbumResult";
import AlbumCardGrid from "@/components/AlbumCardGrid";
import TrackResultStore from "@/components/TrackResultStore";
import TrackActionsMenu from "@/components/TrackActionsMenu";
import TrackViewToggle from "@/components/TrackViewToggle";
import PageHeader, { type HeaderAction } from "@/components/layout/PageHeader";
import { FiPlay } from "react-icons/fi";
import PageContainer from "@/components/layout/PageContainer";
import { artistHref } from "@/components/ArtistLink";
import { useArtistPageQuery } from "@/hooks/useArtistPageQuery";
import { useFriendsQuery } from "@/hooks/useFriendsQuery";
import { useTrack } from "@/hooks/useTrack";
import { useTrackViewMode } from "@/hooks/useTrackViewMode";
import { usePlaybackPlayer } from "@/providers/PlaybackTargetProvider";
import { useUsername } from "@/providers/UsernameProvider";
import type { Track } from "@/types/track";
import { useTrackStore } from "@/stores/trackStore";
import { genreHref } from "@/lib/genres/links";
import { queryKeys } from "@/lib/queryKeys";
import { useQuery } from "@tanstack/react-query";
import { fetchDefaultLibrarySettings } from "@/services/internalApi/settings";

/** Albums shown before "Show all": a big catalogue stays a glance. */
export const ALBUM_PREVIEW = 12;
const TRACK_PREVIEW = 10;

export type AlbumSort = "year" | "title" | "added";
const VIEWS = [
  { value: "all", label: "ALL" },
  { value: "tracks", label: "TRACKS" },
  { value: "albums", label: "ALBUMS" },
] as const;

type AlbumRef = {
  release_id: string;
  friend_id: number;
  title: string;
  year: string | number | null;
  date_added: string | null;
  appears_on_tracks: number;
  appears_on_positions: string[];
};

/** Sorts a copy; albums without the sort key go last. */
export function sortAlbums(albums: AlbumRef[], sort: AlbumSort): AlbumRef[] {
  const copy = [...albums];
  const missingLast = (a: string | number | null, b: string | number | null) =>
    a === null || a === "" ? (b === null || b === "" ? 0 : 1) : b === null || b === "" ? -1 : 0;
  if (sort === "title") return copy.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === "added")
    return copy.sort(
      (a, b) =>
        missingLast(a.date_added, b.date_added) ||
        String(b.date_added ?? "").localeCompare(String(a.date_added ?? "")),
    );
  return copy.sort(
    (a, b) => missingLast(a.year, b.year) || Number(b.year ?? 0) - Number(a.year ?? 0),
  );
}

function TrackRow({
  trackId,
  friendId,
  layout,
}: {
  trackId: string;
  friendId: number;
  layout: "row" | "card";
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box px={{ base: 3, md: 4 }} py={3} minW={0}>
      <Text as="dt" fontFamily="label" fontSize="xs" color="fg.muted" textTransform="uppercase">
        {label}
      </Text>
      <Text as="dd" fontFamily="label" fontSize={{ base: "xl", md: "2xl" }} fontWeight="bold">
        {value}
      </Text>
    </Box>
  );
}

function EmptyCollection({ name }: { name: string }) {
  const { friend, setFriend } = useUsername();
  const { friends } = useFriendsQuery({ showCurrentUser: true });
  const { data: defaultLibrary } = useQuery({
    queryKey: queryKeys.defaultLibrary(),
    queryFn: fetchDefaultLibrarySettings,
    staleTime: 60_000,
  });
  const own = friends.find((item) => item.id === defaultLibrary?.friend_id);
  return (
    <Box
      role="status"
      borderWidth="outline"
      borderColor="border.ink"
      borderStyle="dashed"
      borderRadius="md"
      p={4}
    >
      <Text fontWeight="medium">
        Nothing by {name} in {friend ? `${friend.username}’s` : "this"} collection
      </Text>
      <Flex gap={3} mt={3} wrap="wrap">
        {own && own.id !== friend?.id && (
          <Button minH="44px" onClick={() => setFriend(own)}>
            View in my collection
          </Button>
        )}
        <Button asChild minH="44px" variant="outline">
          <NextLink href={artistHref(name)}>Search albums</NextLink>
        </Button>
      </Flex>
    </Box>
  );
}

function ArtistContent({
  page,
}: {
  page: NonNullable<ReturnType<typeof useArtistPageQuery>["data"]>;
}) {
  const { artist, counts, aliases } = page;
  const { layout, viewMode, setViewMode, isMobile } = useTrackViewMode();
  const { replacePlaylist } = usePlaybackPlayer();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedView = searchParams.get("view");
  const view =
    page.top_tracks.length &&
    page.albums.length &&
    (requestedView === "tracks" || requestedView === "albums")
      ? requestedView
      : "all";
  const setView = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("view");
    else params.set("view", next);
    const query = params.toString();
    router.push(`${window.location.pathname}${query ? `?${query}` : ""}`, { scroll: false });
  };
  const [showAllAlbums, setShowAllAlbums] = React.useState(false);
  const [showAllTracks, setShowAllTracks] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const credited = sortAlbums(
    page.albums.filter((album) => album.appears_on_tracks === 0),
    "year",
  );
  const appearsOn = sortAlbums(
    page.albums.filter((album) => album.appears_on_tracks > 0),
    "year",
  );
  // An artist credited only on tracks gets the Appears on grid in place of an empty Albums one.
  const sections = [
    credited.length > 0 && { key: "albums", title: "Albums", albums: credited },
    appearsOn.length > 0 && { key: "appears", title: "Appears on", albums: appearsOn },
  ].filter((section) => section !== false);
  const tracks =
    showAllTracks || view === "tracks" ? page.top_tracks : page.top_tracks.slice(0, TRACK_PREVIEW);
  const isEmpty = page.albums.length === 0 && page.top_tracks.length === 0;
  const years =
    counts.year_min === null
      ? "—"
      : counts.year_min === counts.year_max
        ? String(counts.year_min)
        : `${counts.year_min}–${counts.year_max}`;

  const playAll = () => {
    const store = useTrackStore.getState();
    const playable = page.top_tracks
      .map((ref) => store.getTrack(ref.track_id, ref.friend_id))
      .filter((track): track is Track => Boolean(track?.local_audio_url?.trim()));
    if (!playable.length) {
      setProblem("No playable tracks by this artist yet.");
      return;
    }
    setProblem(null);
    replacePlaylist(playable, { autoplay: true, startIndex: 0 });
  };

  // Play all is the header's one solid button (a play key on phones); the
  // Discogs profile moves into the header menu instead of taking a body row.
  const headerActions: HeaderAction[] = [
    {
      label: "Play all",
      icon: <FiPlay />,
      onClick: playAll,
      primary: true,
      disabled: isEmpty,
      phone: "icon",
    },
    ...(artist.discogs_artist_id
      ? [
          {
            label: "View on Discogs",
            onClick: () =>
              window.open(
                `https://www.discogs.com/artist/${artist.discogs_artist_id}`,
                "_blank",
                "noopener,noreferrer",
              ),
            phone: "menu",
            desktop: "menu",
          } satisfies HeaderAction,
        ]
      : []),
  ];

  return (
    <>
      <PageHeader>
        <PageHeader.Title meta={`${counts.tracks.toLocaleString()} tracks`} metaOnPhone={false}>
          {artist.name}
        </PageHeader.Title>
        <PageHeader.Actions actions={headerActions} />
      </PageHeader>
      <Stack gap={5}>
        {aliases.length > 0 && (
          <Text color="fg.muted" fontSize="sm">
            Also credited as {aliases.join(", ")}
          </Text>
        )}
        {/* Room for an image and a profile (v2); nothing is built here. */}
        <Grid
          as="dl"
          aria-label="Artist stats"
          templateColumns={{ base: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }}
          borderWidth="outline"
          borderRadius="md"
          borderColor="border.ink"
          boxShadow="md"
        >
          <Stat label="Albums" value={(counts.albums + counts.appears_on).toLocaleString()} />
          <Stat label="Tracks" value={counts.tracks.toLocaleString()} />
          <Stat label="Spins" value={counts.spins.toLocaleString()} />
          <Stat label="Years" value={years} />
          {page.genres.length > 0 && (
            <Box
              gridColumn="1 / -1"
              borderTopWidth="rule"
              borderColor="border"
              px={{ base: 3, md: 4 }}
              py={3}
            >
              <Text
                as="dt"
                fontFamily="label"
                fontSize="xs"
                color="fg.muted"
                textTransform="uppercase"
              >
                Genres
              </Text>
              <Flex as="dd" gap={2} wrap="wrap" mt={2}>
                {page.genres.map((genre) => (
                  <MetaTag key={genre.id} asChild>
                    <NextLink href={genreHref(genre.slug)}>
                      {genre.name} · {genre.track_count}
                    </NextLink>
                  </MetaTag>
                ))}
              </Flex>
            </Box>
          )}
        </Grid>
        {page.top_tracks.length > 0 && page.albums.length > 0 && (
          <SegmentedControl
            framed
            aria-label="Artist content"
            items={VIEWS}
            value={view}
            onValueChange={setView}
            w={{ base: "full", md: "auto" }}
            alignSelf="start"
          />
        )}
        {problem && (
          <Text role="alert" color="fg.error">
            {problem}
          </Text>
        )}
        {isEmpty ? (
          <EmptyCollection name={artist.name} />
        ) : (
          <Grid
            templateColumns={{ base: "minmax(0, 1fr)", xl: "minmax(0, 1fr) 300px" }}
            gap={{ base: 7, xl: 8 }}
            alignItems="start"
          >
            <Stack gap={7} minW={0}>
              {/* Phones: Top tracks above Albums. */}
              {view !== "albums" && (
                <Stack as="section" aria-label="Top tracks" gap={3}>
                  <Flex justify="space-between" align="center" gap={3}>
                    <SectionHeading>
                      Top tracks{" "}
                      <Text as="span" fontSize="sm" color="fg.muted">
                        {page.top_tracks_by === "spins" ? "by spins" : "from the albums"}
                      </Text>
                    </SectionHeading>
                    {!isMobile && (
                      <Flex>
                        <TrackViewToggle value={viewMode} onChange={setViewMode} />
                      </Flex>
                    )}
                  </Flex>
                  <Box
                    borderWidth={layout === "row" ? "outline" : 0}
                    borderRadius="md"
                    borderColor="border.ink"
                    boxShadow={layout === "row" ? "md" : "none"}
                    css={{ containerType: "inline-size" }}
                  >
                    {tracks.map((ref) => (
                      <TrackRow
                        key={`${ref.track_id}:${ref.friend_id}`}
                        trackId={ref.track_id}
                        friendId={ref.friend_id}
                        layout={layout}
                      />
                    ))}
                  </Box>
                  {view !== "tracks" &&
                    !showAllTracks &&
                    page.top_tracks.length > TRACK_PREVIEW && (
                      <Button alignSelf="start" minH="44px" onClick={() => setShowAllTracks(true)}>
                        Show all {page.top_tracks.length} tracks
                      </Button>
                    )}
                </Stack>
              )}
              {view !== "tracks" &&
                sections.map((section) => {
                  const shown =
                    view === "albums" || showAllAlbums || section.albums.length <= ALBUM_PREVIEW
                      ? section.albums
                      : section.albums.slice(0, ALBUM_PREVIEW);
                  return (
                    <Stack as="section" key={section.key} aria-label={section.title} gap={3}>
                      <Flex justify="space-between" align="center" gap={3}>
                        <SectionHeading>
                          {section.title} [{section.albums.length.toLocaleString()}]
                        </SectionHeading>
                      </Flex>
                      <AlbumCardGrid>
                        {shown.map((album) => (
                          <AlbumResult
                            key={`${album.release_id}:${album.friend_id}`}
                            albumRef={{
                              release_id: album.release_id,
                              friend_id: album.friend_id,
                            }}
                            layout="card"
                            meta={
                              album.appears_on_tracks > 0 ? (
                                <MetaTag maxW="100%" truncate>
                                  Appears on · {album.appears_on_tracks}{" "}
                                  {album.appears_on_tracks === 1 ? "track" : "tracks"}
                                  {album.appears_on_positions.filter(Boolean).length > 0 &&
                                    ` · ${album.appears_on_positions.filter(Boolean).join(", ")}`}
                                </MetaTag>
                              ) : undefined
                            }
                          />
                        ))}
                      </AlbumCardGrid>
                    </Stack>
                  );
                })}
              {view === "all" && !showAllAlbums && page.albums.length > ALBUM_PREVIEW && (
                <Button alignSelf="start" minH="44px" onClick={() => setShowAllAlbums(true)}>
                  Show all {page.albums.length} albums
                </Button>
              )}
            </Stack>
            <Stack as="aside" aria-label="Artist insights" gap={7} minW={0} pe={1.5}>
              <Stack as="section" aria-label="Collaborators" gap={2}>
                <SectionHeading>Collaborators</SectionHeading>
                {page.collaborators.length === 0 ? (
                  <Text color="fg.muted" fontSize="sm">
                    No collaborators credited.
                  </Text>
                ) : (
                  page.collaborators.map((other) => (
                    <Flex key={other.id} justify="space-between" gap={3}>
                      <Link asChild>
                        <NextLink href={`/artists/${encodeURIComponent(other.slug)}`}>
                          {other.name}
                        </NextLink>
                      </Link>
                      <Text color="fg.muted" fontSize="sm">
                        {other.shared_credits}
                      </Text>
                    </Flex>
                  ))
                )}
              </Stack>
            </Stack>
          </Grid>
        )}
      </Stack>
    </>
  );
}

function ArtistPlaceholderHeader({ title = "Artist" }: { title?: string }) {
  return (
    <PageHeader>
      <PageHeader.Title>{title}</PageHeader.Title>
      <PageHeader.Actions />
    </PageHeader>
  );
}

export default function ArtistPage() {
  const slug = decodeURIComponent(useParams<{ slug: string }>().slug);
  const router = useRouter();
  const { friend } = useUsername();
  const query = useArtistPageQuery(slug, friend?.id);
  const currentSlug = query.data?.artist.slug;
  React.useEffect(() => {
    // An old slug (including the former hash form) resolves; show the readable URL.
    if (currentSlug && currentSlug !== slug)
      router.replace(`/artists/${encodeURIComponent(currentSlug)}`);
  }, [currentSlug, slug, router]);
  const placeholder = query.data?.artist.is_placeholder ? query.data.artist.name : null;
  React.useEffect(() => {
    // Various and Unknown Artist have no page: search albums for the name instead.
    if (placeholder) router.replace(`/albums?q=${encodeURIComponent(placeholder)}`);
  }, [placeholder, router]);

  return (
    <Box w="full">
      <PageContainer>
        {query.error ? (
          <>
            <ArtistPlaceholderHeader />
            <Box
              role="alert"
              borderWidth="outline"
              borderColor="border.ink"
              boxShadow="sm"
              p={4}
              borderRadius="md"
            >
              <Text fontWeight="medium">Couldn&apos;t load this artist</Text>
              <Text color="fg.muted" mt={1}>
                {query.error.message}
              </Text>
              <Button minH="44px" mt={3} onClick={() => void query.refetch()}>
                Try again
              </Button>
              <Button asChild minH="44px" mt={3} ms={3}>
                <NextLink href="/albums">Search albums</NextLink>
              </Button>
            </Box>
          </>
        ) : !query.data || placeholder ? (
          <>
            <ArtistPlaceholderHeader title={placeholder ?? "Artist"} />
            {placeholder ? (
              <Text role="status" color="fg.muted">
                {placeholder} isn&apos;t a single artist. Searching albums instead…
              </Text>
            ) : (
              <Stack data-testid="artist-page-loading">
                <Skeleton h="36px" maxW="320px" />
                <Skeleton h="80px" />
              </Stack>
            )}
          </>
        ) : (
          <ArtistContent key={`${slug}:${friend?.id}`} page={query.data} />
        )}
      </PageContainer>
    </Box>
  );
}

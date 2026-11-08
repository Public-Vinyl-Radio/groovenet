"use client";

import { usePaletteScope } from "@/providers/CommandPaletteProvider";

import React, { Suspense } from "react";
import { Flex, Spinner } from "@chakra-ui/react";
import { LuPlus } from "react-icons/lu";
import { useSearchParams, useRouter } from "next/navigation";
import AlbumSearchResults from "@/components/AlbumSearchResults";
import { useTrackViewMode } from "@/hooks/useTrackViewMode";
import PageContainer from "@/components/layout/PageContainer";
import PageHeader from "@/components/layout/PageHeader";
import {
  HeaderButton,
  ListSearchRow,
  SearchField,
  ViewModeSwitch,
} from "@/components/layout/ListHeader";
import FilterChips from "@/components/FilterChips";
import FiltersPanel from "@/components/FiltersPanel";
import {
  addedGenreChips,
  genreFilterChips,
  genreSlugFromChipKey,
  includeSimilarChips,
  INCLUDE_SIMILAR_CHIP_KEY,
  similarGenreIdFromChipKey,
} from "@/components/GenreFilter";
import type { GenreFilterRef } from "@/lib/trackFilterSpec";
import type { ArtistFilterRef } from "@/api-contract/schemas";
import {
  artistFilterChips,
  artistSlugFromChipKey,
  useArtistNames,
  type ArtistName,
} from "@/components/ArtistFilter";
import AlbumFiltersModal, {
  ALBUM_MISSING_OPTIONS,
  AlbumFilterSections,
  albumCountLabel,
  showAlbumsLabel,
  type AlbumFilterControls,
} from "@/components/AlbumFiltersModal";
import AlbumSearchMenu, { AlbumOptionsMenu } from "@/components/AlbumSearchMenu";
import AlbumSortMenu, { DEFAULT_ALBUM_SORT, albumSortOption } from "@/components/AlbumSortMenu";
import { useGenreTaxonomyQuery } from "@/hooks/useGenreTaxonomyQuery";
import { useUsername } from "@/providers/UsernameProvider";

function AlbumsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { friend: currentUserFriend, isHydrated } = useUsername();

  // Rows/Cards, shared with the tracks page; phones always get cards.
  const { viewMode, setViewMode, layout } = useTrackViewMode();

  const [query, setQuery] = React.useState(searchParams.get("q") || "");
  const [sort, setSort] = React.useState(searchParams.get("sort") || DEFAULT_ALBUM_SORT);

  // A genre badge (#376) navigates here with a new URL; the inputs follow it.
  const urlQuery = searchParams.get("q") || "";
  const urlSort = searchParams.get("sort") || DEFAULT_ALBUM_SORT;
  React.useEffect(() => setQuery(urlQuery), [urlQuery]);
  React.useEffect(() => setSort(urlSort), [urlSort]);

  const missing: Record<string, boolean> = Object.fromEntries(
    ALBUM_MISSING_OPTIONS.map(({ key }) => [key, searchParams.get(key) === "1"]),
  );
  const missingChips = ALBUM_MISSING_OPTIONS.filter(({ key }) => missing[key]).map(
    ({ key, chipLabel }) => ({ key, label: chipLabel, active: true }),
  );
  // Genre slugs (#375); no counts here, by design.
  const genres = searchParams.getAll("genre");
  // "Include similar" (#485), linkable as `?genre=cumbia&similar=1`.
  const includeSimilar = searchParams.get("similar") === "1";
  const similarExclude = searchParams.getAll("similar_exclude");
  // Artist slugs (#709), linkable as `?artist=meridian-brothers`.
  const artists = searchParams.getAll("artist");
  const [filterArtists, setFilterArtists] = React.useState<ArtistFilterRef[]>([]);
  const { known: knownArtists, remember: rememberArtist } = useArtistNames(filterArtists);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [panelOpen, setPanelOpen] = React.useState(false);
  // Albums matching the current search, reported by the results for the modal's button.
  const [total, setTotal] = React.useState<number | null>(null);
  const [addedGenres, setAddedGenres] = React.useState<GenreFilterRef[] | undefined>();
  const { genres: taxonomy } = useGenreTaxonomyQuery();

  const buildParams = (overrides: Record<string, string | null> = {}) => {
    const params = new URLSearchParams();
    const effectiveQuery = overrides.q !== undefined ? overrides.q : query;
    const effectiveSort = overrides.sort !== undefined ? overrides.sort : sort;
    if (effectiveQuery) params.set("q", effectiveQuery);
    if (effectiveSort && effectiveSort !== DEFAULT_ALBUM_SORT) params.set("sort", effectiveSort);
    ALBUM_MISSING_OPTIONS.forEach(({ key }) => {
      if (missing[key]) params.set(key, "1");
    });
    genres.forEach((slug) => params.append("genre", slug));
    if (includeSimilar) params.set("similar", "1");
    similarExclude.forEach((id) => params.append("similar_exclude", id));
    artists.forEach((slug) => params.append("artist", slug));
    return params;
  };

  const clearAll = () => {
    const params = new URLSearchParams(searchParams.toString());
    ALBUM_MISSING_OPTIONS.forEach(({ key }) => params.delete(key));
    params.delete("genre");
    params.delete("similar");
    params.delete("similar_exclude");
    params.delete("artist");
    router.replace(`/albums?${params.toString()}`);
  };
  const filterCount = missingChips.length + genres.length + artists.length;

  const handleSearch = () => router.push(`/albums?${buildParams().toString()}`);

  usePaletteScope({
    id: "albums",
    label: "Albums",
    onSearch: (q) => {
      setQuery(q);
      router.push(`/albums?${buildParams({ q }).toString()}`);
    },
  });

  const handleSortChange = (newSort: string) => {
    setSort(newSort);
    router.push(`/albums?${buildParams({ sort: newSort }).toString()}`);
  };

  const setGenres = (next: string[]) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("genre");
    next.forEach((slug) => params.append("genre", slug));
    router.replace(`/albums?${params.toString()}`);
  };

  const addGenre = (slug: string) => setGenres([...genres, slug]);

  const setArtists = (next: string[]) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("artist");
    next.forEach((slug) => params.append("artist", slug));
    router.replace(`/albums?${params.toString()}`);
  };
  const addArtist = (artist: ArtistName) => {
    rememberArtist(artist);
    // The picker never offers an artist already chosen, so a pick is always new.
    setArtists([...artists, artist.slug]);
  };
  const removeArtist = (slug: string) => setArtists(artists.filter((s) => s !== slug));

  const setIncludeSimilar = (checked: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    if (checked) params.set("similar", "1");
    else params.delete("similar");
    router.replace(`/albums?${params.toString()}`);
  };

  const handleAlbumFilterToggle = (key: string) => {
    if (key === INCLUDE_SIMILAR_CHIP_KEY) {
      setIncludeSimilar(false);
      return;
    }
    const genreSlug = genreSlugFromChipKey(key);
    if (genreSlug !== null) {
      setGenres(genres.filter((slug) => slug !== genreSlug));
      return;
    }
    const artistSlug = artistSlugFromChipKey(key);
    if (artistSlug !== null) {
      removeArtist(artistSlug);
      return;
    }
    const similarGenreId = similarGenreIdFromChipKey(key);
    if (similarGenreId !== null) {
      const params = new URLSearchParams(searchParams.toString());
      params.append("similar_exclude", similarGenreId);
      router.replace(`/albums?${params.toString()}`);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (missing[key]) params.delete(key);
    else params.set(key, "1");
    router.replace(`/albums?${params.toString()}`);
  };

  // One filter state for the phone modal and the desktop panel (#794).
  const filterControls: AlbumFilterControls = {
    genres,
    onAddGenre: addGenre,
    onRemoveGenre: (slug) => setGenres(genres.filter((s) => s !== slug)),
    includeSimilar,
    onIncludeSimilarChange: setIncludeSimilar,
    artistFilter: {
      selected: artists,
      known: knownArtists,
      onAdd: addArtist,
      onRemove: removeArtist,
      friendId: currentUserFriend?.id,
    },
    missing,
    onToggleMissing: handleAlbumFilterToggle,
    activeCount: filterCount,
    resultCount: total,
    onReset: clearAll,
  };

  return (
    <PageContainer>
      <PageHeader>
        <PageHeader.Title meta={total === null ? undefined : albumCountLabel(total)}>
          Albums
        </PageHeader.Title>
        <PageHeader.Actions
          actions={[
            {
              label: "Add album",
              icon: <LuPlus />,
              onClick: () => router.push("/albums/add"),
              desktop: "hidden",
            },
          ]}
          desktop={
            <>
              <AlbumOptionsMenu onOpenArtwork={() => router.push("/albums/artwork")} />
              <ViewModeSwitch value={viewMode} onChange={setViewMode} />
              <HeaderButton variant="solid" onClick={() => router.push("/albums/add")}>
                <LuPlus aria-hidden="true" />
                Add album
              </HeaderButton>
            </>
          }
          phone={
            <AlbumSearchMenu
              activeCount={filterCount}
              onOpenFilters={() => setFiltersOpen(true)}
              onOpenArtwork={() => router.push("/albums/artwork")}
            />
          }
        />
      </PageHeader>
      <Flex gap={3} direction="column">
        {!isHydrated || !currentUserFriend ? (
          <Flex justify="center" py={8}>
            <Spinner />
          </Flex>
        ) : (
          <>
            <PageHeader.Toolbar>
              <ListSearchRow
                maxW="640px"
                mb={0}
                field={
                  <SearchField
                    value={query}
                    onChange={setQuery}
                    onEnter={handleSearch}
                    label="Search albums"
                    placeholder="Search albums"
                  />
                }
                controls={
                  <>
                    <AlbumSortMenu value={sort} onChange={handleSortChange} />
                    <FiltersPanel
                      open={panelOpen}
                      onOpenChange={setPanelOpen}
                      scope="Albums"
                      activeCount={filterCount}
                      onReset={clearAll}
                      showLabel={showAlbumsLabel(total)}
                    >
                      <AlbumFilterSections {...filterControls} />
                    </FiltersPanel>
                  </>
                }
              />
            </PageHeader.Toolbar>

            <AlbumFiltersModal
              open={filtersOpen}
              onOpenChange={setFiltersOpen}
              sort={{ value: sort, onChange: handleSortChange }}
              {...filterControls}
            />

            <FilterChips
              chips={[
                ...genreFilterChips(genres, taxonomy),
                ...includeSimilarChips(includeSimilar, genres, addedGenres),
                ...addedGenreChips(addedGenres ?? []),
                ...artistFilterChips(artists, knownArtists),
                ...missingChips,
              ]}
              onToggle={handleAlbumFilterToggle}
              onClearAll={filterCount > 0 ? clearAll : undefined}
              // A sort other than the default is named passively on phones ("414 albums · Oldest
              // releases"); desktop shows it in the SORT button and the count in the title.
              summary={
                sort !== DEFAULT_ALBUM_SORT && total !== null
                  ? `${albumCountLabel(total)} · ${albumSortOption(sort).label}`
                  : undefined
              }
              summaryOnDesktop={false}
            />

            {/* Album Results */}
            <Suspense
              fallback={
                <Flex justify="center" pt={6}>
                  <Spinner />
                </Flex>
              }
            >
              <AlbumSearchResults
                friendId={currentUserFriend.id}
                onAddedGenresChange={setAddedGenres}
                onFilterArtistsChange={setFilterArtists}
                onTotalChange={setTotal}
                layout={layout}
              />
            </Suspense>
          </>
        )}
      </Flex>
    </PageContainer>
  );
}

export default function AlbumsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AlbumsPageContent />
    </Suspense>
  );
}

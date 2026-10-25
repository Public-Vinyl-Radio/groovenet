"use client";

import React, { Suspense } from "react";
import { Flex, Spinner, Button, IconButton } from "@chakra-ui/react";
import { LuImage, LuPlus } from "react-icons/lu";
import { useSearchParams, useRouter } from "next/navigation";
import AlbumSearchResults from "@/components/AlbumSearchResults";
import TrackViewToggle from "@/components/TrackViewToggle";
import { useTrackViewMode } from "@/hooks/useTrackViewMode";
import PageContainer from "@/components/layout/PageContainer";
import PageHeader from "@/components/layout/PageHeader";
import UnifiedSearchControls from "@/components/search/UnifiedSearchControls";
import FilterChips, { FilterGroup } from "@/components/FilterChips";
import {
  addedGenreChips,
  genreFilterChips,
  GenreFilterGroup,
  genreSlugFromChipKey,
  similarGenreIdFromChipKey,
} from "@/components/GenreFilter";
import type { GenreFilterRef } from "@/lib/trackFilterSpec";
import MissingFilter from "@/components/MissingFilter";
import AlbumFiltersModal, { ALBUM_MISSING_OPTIONS } from "@/components/AlbumFiltersModal";
import AlbumSearchMenu from "@/components/AlbumSearchMenu";
import AlbumSortMenu, { DEFAULT_ALBUM_SORT } from "@/components/AlbumSortMenu";
import { useGenreTaxonomyQuery } from "@/hooks/useGenreTaxonomyQuery";
import { useUsername } from "@/providers/UsernameProvider";

function AlbumsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { friend: currentUserFriend, isHydrated } = useUsername();

  // Rows/Cards, shared with the tracks page; phones always get cards.
  const { viewMode, setViewMode, layout } = useTrackViewMode();

  const [query, setQuery] = React.useState(searchParams.get("q") || "");
  const [sort, setSort] = React.useState(
    searchParams.get("sort") || DEFAULT_ALBUM_SORT
  );

  // A genre badge (#376) navigates here with a new URL; the inputs follow it.
  const urlQuery = searchParams.get("q") || "";
  const urlSort = searchParams.get("sort") || DEFAULT_ALBUM_SORT;
  React.useEffect(() => setQuery(urlQuery), [urlQuery]);
  React.useEffect(() => setSort(urlSort), [urlSort]);

  const missing: Record<string, boolean> = Object.fromEntries(
    ALBUM_MISSING_OPTIONS.map(({ key }) => [key, searchParams.get(key) === "1"])
  );
  const missingChips = ALBUM_MISSING_OPTIONS.filter(({ key }) => missing[key]).map(
    ({ key, chipLabel }) => ({ key, label: chipLabel, active: true })
  );
  // Genre slugs (#375); no counts here, by design.
  const genres = searchParams.getAll("genre");
  // "Include similar" (#485), linkable as `?genre=cumbia&similar=1`.
  const includeSimilar = searchParams.get("similar") === "1";
  const similarExclude = searchParams.getAll("similar_exclude");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  // Albums matching the current search, reported by the results for the modal's button.
  const [total, setTotal] = React.useState<number | null>(null);
  const [addedGenres, setAddedGenres] = React.useState<GenreFilterRef[]>([]);
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
    return params;
  };

  const clearAll = () => {
    const params = new URLSearchParams(searchParams.toString());
    ALBUM_MISSING_OPTIONS.forEach(({ key }) => params.delete(key));
    params.delete("genre");
    params.delete("similar");
    params.delete("similar_exclude");
    router.replace(`/albums?${params.toString()}`);
  };
  const filterCount = missingChips.length + genres.length;

  const handleSearch = () => router.push(`/albums?${buildParams().toString()}`);

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

  const setIncludeSimilar = (checked: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    if (checked) params.set("similar", "1");
    else params.delete("similar");
    router.replace(`/albums?${params.toString()}`);
  };

  const handleAlbumFilterToggle = (key: string) => {
    const genreSlug = genreSlugFromChipKey(key);
    if (genreSlug !== null) {
      setGenres(genres.filter((slug) => slug !== genreSlug));
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

  return (
    <PageContainer size="standard">
      <PageHeader
        title="Albums"
        actions={[{ label: "Add album", icon: <LuPlus />, onClick: () => router.push("/albums/add") }]}
        trailing={
          <AlbumSearchMenu
            activeCount={filterCount}
            onOpenFilters={() => setFiltersOpen(true)}
            onOpenArtwork={() => router.push("/albums/artwork")}
          />
        }
      />
      <Flex gap={3} direction="column">
        {!isHydrated || !currentUserFriend ? (
          <Flex justify="center" py={8}>
            <Spinner />
          </Flex>
        ) : (
          <>
        <UnifiedSearchControls
          query={query}
          onQueryChange={setQuery}
          onQueryEnter={handleSearch}
          showLibrarySelect={false}
          placeholder="Search"
          compactDesktop={true}
          desktopControls={
            <>
              <AlbumSortMenu value={sort} onChange={handleSortChange} trigger="icon" />
              <IconButton
                aria-label="Album artwork review"
                title="Album artwork review"
                size="sm"
                variant="ghost"
                onClick={() => router.push("/albums/artwork")}
              >
                <LuImage />
              </IconButton>
              <TrackViewToggle value={viewMode} onChange={setViewMode} />
              <Button variant="outline" flexShrink={0} onClick={() => router.push("/albums/add")}>
                + Add Album
              </Button>
            </>
          }
        />

        <AlbumFiltersModal
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          genres={genres}
          onAddGenre={addGenre}
          includeSimilar={includeSimilar}
          onIncludeSimilarChange={setIncludeSimilar}
          missing={missing}
          onToggleMissing={handleAlbumFilterToggle}
          activeCount={filterCount}
          resultCount={total}
          onReset={clearAll}
        />

        <FilterChips
          leading={
            <>
              <GenreFilterGroup
                selected={genres}
                onAdd={addGenre}
                includeSimilar={includeSimilar}
                onIncludeSimilarChange={setIncludeSimilar}
              />
              <FilterGroup>
                <MissingFilter
                  options={ALBUM_MISSING_OPTIONS}
                  active={missing}
                  onToggle={handleAlbumFilterToggle}
                />
              </FilterGroup>
            </>
          }
          chips={[...genreFilterChips(genres, taxonomy), ...addedGenreChips(addedGenres), ...missingChips]}
          onToggle={handleAlbumFilterToggle}
          onClearAll={filterCount > 0 ? clearAll : undefined}
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
            onTotalChange={setTotal}
            onSortChange={handleSortChange}
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

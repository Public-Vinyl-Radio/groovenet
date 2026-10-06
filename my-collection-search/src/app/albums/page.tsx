"use client";

import React, { Suspense } from "react";
import {
  Flex,
  Spinner,
  Button,
  IconButton,
  Menu,
} from "@chakra-ui/react";
import { LuArrowUpDown } from "react-icons/lu";
import { useSearchParams, useRouter } from "next/navigation";
import AlbumSearchResults from "@/components/AlbumSearchResults";
import PageContainer from "@/components/layout/PageContainer";
import UnifiedSearchControls from "@/components/search/UnifiedSearchControls";
import FilterChips from "@/components/FilterChips";
import GenreFilter, { genreFilterChips, genreSlugFromChipKey } from "@/components/GenreFilter";
import MissingFilter, { MissingChecklist } from "@/components/MissingFilter";
import FilterSheet, { FilterSheetSection } from "@/components/FilterSheet";
import type { MissingFilterOption } from "@/lib/trackFilters";
import { useGenreTaxonomyQuery } from "@/hooks/useGenreTaxonomyQuery";
import { useUsername } from "@/providers/UsernameProvider";

/** The album missing checks; each key is its URL parameter, as before #447. */
const ALBUM_MISSING_OPTIONS: MissingFilterOption[] = [
  { key: "missing_library_identifier", label: "Library identifier", chipLabel: "Missing identifier" },
  { key: "missing_local_cover_art_url", label: "Local cover", chipLabel: "Missing local cover" },
  { key: "missing_audio", label: "Audio", chipLabel: "Missing audio" },
];

function AlbumsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { friend: currentUserFriend, isHydrated } = useUsername();

  const [query, setQuery] = React.useState(searchParams.get("q") || "");
  const [sort, setSort] = React.useState(
    searchParams.get("sort") || "created_at:desc"
  );
  const [viewMode, setViewMode] = React.useState<"card" | "table">("card");

  React.useEffect(() => {
    const saved = localStorage.getItem("albumViewMode");
    if (saved === "card" || saved === "table") setViewMode(saved);
  }, []);

  const missing: Record<string, boolean> = Object.fromEntries(
    ALBUM_MISSING_OPTIONS.map(({ key }) => [key, searchParams.get(key) === "1"])
  );
  const missingChips = ALBUM_MISSING_OPTIONS.filter(({ key }) => missing[key]).map(
    ({ key, chipLabel }) => ({ key, label: chipLabel, active: true })
  );
  // Genre slugs (#375); no counts here, by design.
  const genres = searchParams.getAll("genre");
  const { genres: taxonomy } = useGenreTaxonomyQuery();

  const buildParams = (overrides: Record<string, string | null> = {}) => {
    const params = new URLSearchParams();
    const effectiveQuery = overrides.q !== undefined ? overrides.q : query;
    const effectiveSort = overrides.sort !== undefined ? overrides.sort : sort;
    if (effectiveQuery) params.set("q", effectiveQuery);
    if (effectiveSort && effectiveSort !== "created_at:desc") params.set("sort", effectiveSort);
    ALBUM_MISSING_OPTIONS.forEach(({ key }) => {
      if (missing[key]) params.set(key, "1");
    });
    genres.forEach((slug) => params.append("genre", slug));
    return params;
  };

  const clearAll = () => {
    const params = new URLSearchParams(searchParams.toString());
    ALBUM_MISSING_OPTIONS.forEach(({ key }) => params.delete(key));
    params.delete("genre");
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

  const handleAlbumFilterToggle = (key: string) => {
    const genreSlug = genreSlugFromChipKey(key);
    if (genreSlug !== null) {
      setGenres(genres.filter((slug) => slug !== genreSlug));
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (missing[key]) params.delete(key);
    else params.set(key, "1");
    router.replace(`/albums?${params.toString()}`);
  };

  return (
    <PageContainer size="standard">
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
              <Menu.Root>
                <Menu.Trigger asChild>
                  <IconButton aria-label="Sort" size="sm" variant="ghost">
                    <LuArrowUpDown />
                  </IconButton>
                </Menu.Trigger>
                <Menu.Positioner>
                  <Menu.Content>
                    {[
                      { value: "created_at:desc", label: "Recently Added" },
                      { value: "date_added:desc", label: "Newest in Discogs" },
                      { value: "date_added:asc", label: "Oldest in Discogs" },
                      { value: "year:desc", label: "Newest Releases" },
                      { value: "year:asc", label: "Oldest Releases" },
                      { value: "title:asc", label: "Title (A-Z)" },
                      { value: "album_rating:desc", label: "Highest Rated" },
                    ].map((opt) => (
                      <Menu.Item
                        key={opt.value}
                        value={opt.value}
                        onSelect={() => handleSortChange(opt.value)}
                        fontWeight={sort === opt.value ? "bold" : "normal"}
                      >
                        {opt.label}
                      </Menu.Item>
                    ))}
                  </Menu.Content>
                </Menu.Positioner>
              </Menu.Root>
              <Button variant="outline" flexShrink={0} onClick={() => router.push("/albums/add")}>
                + Add Album
              </Button>
            </>
          }
          mobilePrimaryControl={
            <Flex gap={1} align="center" flexShrink={0}>
              <FilterSheet count={filterCount} onClearAll={filterCount > 0 ? clearAll : undefined}>
                <FilterSheetSection title="Genre">
                  <GenreFilter
                    selected={genres}
                    onAdd={addGenre}
                    inSheet
                  />
                </FilterSheetSection>
                <FilterSheetSection title="Missing">
                  <MissingChecklist
                    options={ALBUM_MISSING_OPTIONS}
                    active={missing}
                    onToggle={handleAlbumFilterToggle}
                  />
                </FilterSheetSection>
              </FilterSheet>
              <Menu.Root>
                <Menu.Trigger asChild>
                  <IconButton aria-label="Sort" size="sm" variant="ghost">
                    <LuArrowUpDown />
                  </IconButton>
                </Menu.Trigger>
                <Menu.Positioner>
                  <Menu.Content>
                    {[
                      { value: "created_at:desc", label: "Recently Added" },
                      { value: "date_added:desc", label: "Newest in Discogs" },
                      { value: "date_added:asc", label: "Oldest in Discogs" },
                      { value: "year:desc", label: "Newest Releases" },
                      { value: "year:asc", label: "Oldest Releases" },
                      { value: "title:asc", label: "Title (A-Z)" },
                      { value: "album_rating:desc", label: "Highest Rated" },
                    ].map((opt) => (
                      <Menu.Item
                        key={opt.value}
                        value={opt.value}
                        onSelect={() => handleSortChange(opt.value)}
                        fontWeight={sort === opt.value ? "bold" : "normal"}
                      >
                        {opt.label}
                      </Menu.Item>
                    ))}
                  </Menu.Content>
                </Menu.Positioner>
              </Menu.Root>
            </Flex>
          }
        />

        <FilterChips
          leading={
            <>
              <GenreFilter
                selected={genres}
                onAdd={addGenre}
              />
              <MissingFilter
                options={ALBUM_MISSING_OPTIONS}
                active={missing}
                onToggle={handleAlbumFilterToggle}
              />
            </>
          }
          chips={[...genreFilterChips(genres, taxonomy), ...missingChips]}
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
            viewMode={viewMode}
            friendId={currentUserFriend.id}
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

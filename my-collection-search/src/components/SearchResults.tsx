"use client";

import React from "react";
import { Box, Text, IconButton, Flex, Grid, Spinner } from "@chakra-ui/react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { LuListChecks } from "react-icons/lu";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { analytics } from "@/lib/analytics/client";
import TrackSelectionBar from "@/components/TrackSelectionBar";
import { useEnrichmentStore } from "@/stores/enrichmentStore";
import { useTrackStore } from "@/stores/trackStore";
import { analyzeTrackAsync } from "@/services/internalApi/tracks";
import { toaster } from "@/components/ui/toaster";

import TrackViewToggle from "@/components/TrackViewToggle";
import { useTrackViewMode } from "@/hooks/useTrackViewMode";
import TrackResultStore from "@/components/TrackResultStore";
import { TrackListHeader, TRACK_ROW_HEIGHT } from "@/components/TrackResult";
import UnifiedSearchControls from "@/components/search/UnifiedSearchControls";
import SearchModeToggle, {
  SEARCH_MODE_PLACEHOLDERS,
  isTrackSearchMode,
} from "@/components/search/SearchModeToggle";
import type { TrackSearchMode } from "@/api-contract/schemas";
import { useSearchResults } from "@/hooks/useSearchResults";
import TrackActionsMenu from "@/components/TrackActionsMenu";
import { useTrack } from "@/hooks/useTrack";
import FilterChips, { FilterGroup } from "@/components/FilterChips";
import {
  addedGenreChips,
  genreFilterChips,
  GenreFilterGroup,
  genreSlugFromChipKey,
  similarGenreIdFromChipKey,
} from "@/components/GenreFilter";
import MissingFilter from "@/components/MissingFilter";
import AttributeFilter from "@/components/AttributeFilter";
import PageHeader from "@/components/layout/PageHeader";
import TrackSearchMenu from "@/components/TrackSearchMenu";
import TrackSearchOptionsModal from "@/components/TrackSearchOptionsModal";
import { useGenreTaxonomyQuery } from "@/hooks/useGenreTaxonomyQuery";
import { useTrackGenreFacets } from "@/hooks/useTrackGenreFacets";
import {
  TRACK_MISSING_OPTIONS,
  type TrackAttributeFilters,
  type TracksFilter,
  attributeFilterChips,
  attributeFiltersFromParams,
  buildSearchFilters,
  createEmptyFilters,
  getActiveFilterCount,
  removeAttributeChip,
  toggleTracksFilter,
  tracksFilterFromParams,
  writeTrackFiltersToParams,
} from "@/lib/trackFilters";
import { useUsername } from "@/providers/UsernameProvider";

const TrackResultItem: React.FC<{
  trackId: string;
  friendId: number;
  playlistCount?: number;
  layout?: "row" | "card";
  showUsername?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}> = ({ trackId, friendId, playlistCount, layout, showUsername, isSelected, onToggleSelect }) => {
  const track = useTrack(trackId, friendId);

  if (!track) {
    return null; // Track not yet loaded in store
  }

  return (
    <TrackResultStore
      trackId={trackId}
      friendId={friendId}
      fallbackTrack={track}
      playlistCount={playlistCount}
      buttons={[<TrackActionsMenu key="menu" track={track} />]}
      layout={layout}
      showUsername={showUsername}
      isSelected={isSelected}
      onToggleSelect={onToggleSelect}
    />
  );
};

const SearchResults: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = React.useMemo(
    () => searchParams?.toString() ?? "",
    [searchParams]
  );
  const { friend: currentUserFriend, isHydrated } = useUsername();

  // Filter state - applied immediately (no modal)
  const [activeFilters, setActiveFilters] = React.useState<TracksFilter>(createEmptyFilters());
  // BPM range, key and minimum rating (#412), linkable as `?bpm_min=120&key=A+minor`.
  const [attributes, setAttributes] = React.useState<TrackAttributeFilters>(() =>
    attributeFiltersFromParams(searchParams)
  );
  // Genre slugs (#375), linkable as `?genre=cumbia&genre=salsa`.
  const [genres, setGenres] = React.useState<string[]>(() => searchParams?.getAll("genre") ?? []);
  // "Include similar" (#485), linkable as `?genre=cumbia&similar=1`.
  const [includeSimilar, setIncludeSimilar] = React.useState<boolean>(
    () => searchParams?.get("similar") === "1"
  );
  // Related-genre ids removed from the widened set; kept out on reload too.
  const [similarExclude, setSimilarExclude] = React.useState<string[]>(
    () => searchParams?.getAll("similar_exclude") ?? []
  );
  const [searchMode, setSearchMode] = React.useState<TrackSearchMode>(() => {
    const fromUrl = searchParams?.get("mode");
    return isTrackSearchMode(fromUrl) ? fromUrl : "lexical";
  });

  // Build filter strings, combining with friend_id filter
  const searchFilters = React.useMemo(() => {
    const customFilters = buildSearchFilters(activeFilters);

    // Add friend_id filter if a friend is selected
    if (currentUserFriend?.id) {
      return [...customFilters, `friend_id = ${currentUserFriend.id}`];
    }

    return customFilters;
  }, [activeFilters, currentUserFriend]);

  const {
    query,
    setQuery,
    onQueryChange,
    estimatedResults,
    trackInfo,
    playlistCounts,
    hasMore,
    loadMore,
    initialLoading,
    loadingMore,
    addedGenres,
  } = useSearchResults({
    enabled: isHydrated && !!currentUserFriend,
    mode: "infinite",
    limit: 20,
    friend: currentUserFriend,
    filter: searchFilters.length > 0 ? searchFilters : undefined,
    searchMode,
    genres,
    attributes,
    includeSimilar,
    similarExclude,
  });

  // Counts only for keyword search: semantic and hybrid return one ranked page.
  const { genres: taxonomy } = useGenreTaxonomyQuery();
  const { counts: genreCounts } = useTrackGenreFacets({
    q: query,
    filter: searchFilters.join(" AND "),
    attributes,
    enabled: isHydrated && !!currentUserFriend && searchMode === "lexical",
  });
  // The picker never offers a genre already chosen, so a pick is always new.
  const addGenre = React.useCallback((slug: string) => {
    setGenres((prev) => [...prev, slug]);
  }, []);

  // Selection state
  const [selectedTracks, setSelectedTracks] = React.useState<Set<string>>(new Set());
  const setQueue = useEnrichmentStore((s) => s.setQueue);

  const toggleTrack = React.useCallback((trackId: string, friendId: number) => {
    const key = `${trackId}:${friendId}`;
    setSelectedTracks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAll = React.useCallback(() => {
    setSelectedTracks(new Set(trackInfo.map((t) => `${t.trackId}:${t.friendId}`)));
  }, [trackInfo]);

  const clearSelection = React.useCallback(() => setSelectedTracks(new Set()), []);

  const handleEnrich = React.useCallback(() => {
    const queue = trackInfo
      .filter((t) => selectedTracks.has(`${t.trackId}:${t.friendId}`))
      .map((t) => ({ trackId: t.trackId, friendId: t.friendId }));
    setQueue(queue);
    router.push("/enrich");
  }, [trackInfo, selectedTracks, setQueue, router]);

  const trackStoreMap = useTrackStore((s) => s.tracks);

  const downloadableTracks = React.useMemo(() => {
    return Array.from(selectedTracks)
      .map((key) => trackStoreMap.get(key))
      .filter(
        (t): t is NonNullable<typeof t> =>
          !!t &&
          !t.local_audio_url &&
          !!(t.apple_music_url || t.youtube_url || t.soundcloud_url)
      );
  }, [selectedTracks, trackStoreMap]);

  const handleDownloadAudio = React.useCallback(async () => {
    if (downloadableTracks.length === 0) return;
    let queued = 0;
    for (const track of downloadableTracks) {
      try {
        await analyzeTrackAsync({
          track_id: track.track_id,
          friend_id: track.friend_id,
          apple_music_url: track.apple_music_url ?? null,
          youtube_url: track.youtube_url ?? null,
          soundcloud_url: track.soundcloud_url ?? null,
        });
        queued++;
      } catch {
        // continue on individual failures
      }
    }
    toaster.create({
      title: `${queued} track${queued !== 1 ? "s" : ""} queued for download`,
      type: "success",
    });
    clearSelection();
  }, [downloadableTracks, clearSelection]);

  const [selectMode, setSelectMode] = React.useState(false);
  const [optionsOpen, setOptionsOpen] = React.useState(false);

  const toggleSelectMode = React.useCallback(() => {
    setSelectMode((prev) => {
      if (prev) clearSelection();
      return !prev;
    });
  }, [clearSelection]);

  // Rows/Cards view mode, persisted to localStorage; phones always get cards.
  const { viewMode, setViewMode: handleViewModeChange, layout: effectiveLayout } = useTrackViewMode();

  const rowListRef = React.useRef<HTMLDivElement>(null);
  const [rowListOffset, setRowListOffset] = React.useState(0);
  React.useLayoutEffect(() => {
    setRowListOffset(rowListRef.current?.offsetTop ?? 0);
  }, [effectiveLayout]);

  const rowVirtualizer = useWindowVirtualizer({
    count: trackInfo.length,
    estimateSize: () => TRACK_ROW_HEIGHT,
    overscan: 8,
    scrollMargin: rowListOffset,
  });

  const handleFilterToggle = React.useCallback((key: string) => {
    const genreSlug = genreSlugFromChipKey(key);
    if (genreSlug !== null) {
      setGenres((prev) => prev.filter((slug) => slug !== genreSlug));
      return;
    }
    const similarGenreId = similarGenreIdFromChipKey(key);
    if (similarGenreId !== null) {
      setSimilarExclude((prev) => [...prev, similarGenreId]);
      return;
    }
    const withoutAttribute = removeAttributeChip(attributes, key);
    if (withoutAttribute !== null) {
      setAttributes(withoutAttribute);
      return;
    }
    setActiveFilters((prev) => toggleTracksFilter(prev, key as keyof TracksFilter));
  }, [attributes]);

  const handleClearAllFilters = React.useCallback(() => {
    setActiveFilters(createEmptyFilters());
    setGenres([]);
    setIncludeSimilar(false);
    setSimilarExclude([]);
    setAttributes({});
  }, []);
  const attributeChips = attributeFilterChips(attributes);
  const activeFilterCount =
    getActiveFilterCount(activeFilters) + genres.length + attributeChips.length;

  const observer = React.useRef<IntersectionObserver | null>(null);
  const bottomSentinelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!hasMore) return;
    if (!bottomSentinelRef.current) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loadingMore) {
        loadMore();
      }
    });
    observer.current.observe(bottomSentinelRef.current);
    return () => observer.current?.disconnect();
  }, [trackInfo.length, hasMore, loadMore, loadingMore]);

  // Debounced input state
  const [debouncedValue, setDebouncedValue] = React.useState(query);
  React.useEffect(() => {
    setDebouncedValue(query);
  }, [query]);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      if (debouncedValue !== query) {
        // Only call if changed
        onQueryChange({
          target: { value: debouncedValue },
        } as React.ChangeEvent<HTMLInputElement>);

        if (debouncedValue.length > 0) {
          analytics.track("search_query_executed", {
            query_length: debouncedValue.length,
            has_filters: activeFilterCount > 0,
            filter_count: activeFilterCount,
            search_mode: searchMode,
          });
        }
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [debouncedValue, onQueryChange, query, activeFilterCount, searchMode]);

  // Hydrate query and filters from URL on first mount
  React.useEffect(() => {
    const urlQ = searchParams?.get("q") ?? "";
    if (urlQ && urlQ !== debouncedValue) {
      setDebouncedValue(urlQ);
    }
    const fromUrl = tracksFilterFromParams(searchParams);
    if (Object.values(fromUrl).some(Boolean)) {
      setActiveFilters(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A URL change this page didn't write arrived by navigation — a genre badge
  // in the results (#376) — and replaces the search. `replace` lands later, so
  // the page's own writes are remembered until they show up.
  const seenUrlRef = React.useRef(searchParamsString);
  const pendingUrlsRef = React.useRef(new Set<string>());

  // Keep URL in sync when query or filters change
  React.useEffect(() => {
    if (!pathname) return;
    const urlChanged = searchParamsString !== seenUrlRef.current;
    seenUrlRef.current = searchParamsString;
    if (urlChanged && !pendingUrlsRef.current.delete(searchParamsString)) {
      const fromUrl = new URLSearchParams(searchParamsString);
      const urlQ = fromUrl.get("q") ?? "";
      const urlMode = fromUrl.get("mode");
      setQuery(urlQ);
      setDebouncedValue(urlQ);
      setGenres(fromUrl.getAll("genre"));
      setIncludeSimilar(fromUrl.get("similar") === "1");
      setSimilarExclude(fromUrl.getAll("similar_exclude"));
      setSearchMode(isTrackSearchMode(urlMode) ? urlMode : "lexical");
      setActiveFilters(tracksFilterFromParams(fromUrl));
      setAttributes(attributeFiltersFromParams(fromUrl));
      return;
    }
    const params = new URLSearchParams(searchParamsString);
    if (query && query.length > 0) {
      params.set("q", query);
    } else {
      params.delete("q");
    }
    if (searchMode !== "lexical") params.set("mode", searchMode);
    else params.delete("mode");
    writeTrackFiltersToParams(params, activeFilters, attributes);
    params.delete("genre");
    genres.forEach((slug) => params.append("genre", slug));
    if (includeSimilar) params.set("similar", "1");
    else params.delete("similar");
    params.delete("similar_exclude");
    similarExclude.forEach((id) => params.append("similar_exclude", id));
    const nextQueryString = params.toString();
    if (nextQueryString === searchParamsString) return;
    const newUrl = nextQueryString ? `${pathname}?${nextQueryString}` : pathname;
    pendingUrlsRef.current.add(nextQueryString);
    router.replace(newUrl);
  }, [
    query,
    setQuery,
    activeFilters,
    attributes,
    genres,
    includeSimilar,
    similarExclude,
    searchMode,
    pathname,
    router,
    searchParamsString,
  ]);

  return (
    <Box mb={'100px'}>
      <PageHeader
        title="Tracks"
        trailing={
          <TrackSearchMenu
            activeCount={activeFilterCount}
            selectMode={selectMode}
            onOpenOptions={() => setOptionsOpen(true)}
            onToggleSelect={toggleSelectMode}
          />
        }
      />
      {!isHydrated || !currentUserFriend ? (
        <Flex justify="center" py={8}>
          <Spinner />
        </Flex>
      ) : (
        <>
      <UnifiedSearchControls
        query={debouncedValue}
        onQueryChange={setDebouncedValue}
        showLibrarySelect={false}
        placeholder={SEARCH_MODE_PLACEHOLDERS[searchMode]}
        desktopControls={
          <>
            <SearchModeToggle value={searchMode} onChange={setSearchMode} />
            <IconButton
              aria-label="Select tracks"
              size="sm"
              variant={selectMode ? "solid" : "ghost"}
              onClick={toggleSelectMode}
            >
              <LuListChecks />
            </IconButton>
            <TrackViewToggle value={viewMode} onChange={handleViewModeChange} />
          </>
        }
      />

      <TrackSearchOptionsModal
        open={optionsOpen}
        onOpenChange={setOptionsOpen}
        mode={searchMode}
        onModeChange={setSearchMode}
        genres={genres}
        onAddGenre={addGenre}
        genreCounts={genreCounts}
        includeSimilar={includeSimilar}
        onIncludeSimilarChange={setIncludeSimilar}
        attributes={attributes}
        onAttributesChange={setAttributes}
        missing={activeFilters}
        onToggleMissing={handleFilterToggle}
        activeCount={activeFilterCount}
        resultCount={estimatedResults}
        onReset={handleClearAllFilters}
      />

      <FilterChips
        mt={3}
        leading={
          <>
            <GenreFilterGroup
              selected={genres}
              onAdd={addGenre}
              counts={genreCounts}
              includeSimilar={includeSimilar}
              onIncludeSimilarChange={setIncludeSimilar}
            />
            <FilterGroup>
              <MissingFilter
                options={TRACK_MISSING_OPTIONS}
                active={activeFilters}
                onToggle={handleFilterToggle}
              />
              <AttributeFilter value={attributes} onChange={setAttributes} />
            </FilterGroup>
          </>
        }
        chips={[
          ...genreFilterChips(genres, taxonomy, genreCounts),
          ...addedGenreChips(addedGenres),
          ...TRACK_MISSING_OPTIONS.filter(({ key }) => activeFilters[key]).map(
            ({ key, chipLabel }) => ({ key, label: chipLabel, active: true })
          ),
          ...attributeChips,
        ]}
        onToggle={handleFilterToggle}
        onClearAll={activeFilterCount > 0 ? handleClearAllFilters : undefined}
      />

      {initialLoading ? (
        <Box mt={8}>
          {[...Array(8)].map((_, i) => (
            <Box key={i} mb={4}>
              <Box height="255px" borderRadius="md" bg="bg.muted" />
            </Box>
          ))}
        </Box>
      ) : (
        <>
          <Text fontSize="sm" color="fg.muted" mb={2} mt={3}>
            {estimatedResults.toLocaleString()} results found
            {activeFilterCount > 0 && (
              <Text as="span" color="accent.fg" ml={2}>
                ({activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} active)
              </Text>
            )}
          </Text>

          {effectiveLayout === "row" ? (
            // Rows view: dense, grid-aligned, virtualised (fixed row height).
            // One outlined block with one shadow for the whole stack; rows only rule.
            <Box borderWidth="outline" borderColor="border.ink" boxShadow="md" overflow="hidden" css={{ containerType: "inline-size" }}>
              <TrackListHeader />
              <Box ref={rowListRef} position="relative" height={`${rowVirtualizer.getTotalSize()}px`}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const info = trackInfo[virtualRow.index];
                  const key = `${info.trackId}:${info.friendId}`;
                  return (
                    <Box
                      // Keyed by track identity, not the virtualizer's slot index: TrackResult
                      // carries open-menu/popover state internally, and reusing a slot's DOM node
                      // for a different track on scroll left that state stuck on the wrong row.
                      key={key}
                      data-index={virtualRow.index}
                      position="absolute"
                      top={0}
                      left={0}
                      width="100%"
                      height={`${virtualRow.size}px`}
                      transform={`translateY(${virtualRow.start - rowVirtualizer.options.scrollMargin}px)`}
                    >
                      <TrackResultItem
                        trackId={info.trackId}
                        friendId={info.friendId}
                        playlistCount={playlistCounts[key]}
                        layout="row"
                        showUsername={false}
                        isSelected={selectMode ? selectedTracks.has(key) : undefined}
                        onToggleSelect={selectMode ? () => toggleTrack(info.trackId, info.friendId) : undefined}
                      />
                    </Box>
                  );
                })}
              </Box>
            </Box>
          ) : (
            // Cards view (and every phone, regardless of the toggle). Each card carries a
            // 14px mb; the 6px rowGap tops it up to the 20px column gap on desktop. The
            // padding leaves room for the cards' 6px hard shadow; the shell's bottom padding
            // is what clears the fixed bottom nav on a phone.
            <Grid
              templateColumns={{ base: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }}
              columnGap={5}
              rowGap={{ base: 0, md: "6px" }}
              pr="6px"
              pb="6px"
            >
              {trackInfo.map((info) => {
                const key = `${info.trackId}:${info.friendId}`;
                return (
                  <TrackResultItem
                    key={`search-${info.trackId}-${info.friendId}`}
                    trackId={info.trackId}
                    friendId={info.friendId}
                    playlistCount={playlistCounts[key]}
                    layout="card"
                    showUsername={false}
                    isSelected={selectMode ? selectedTracks.has(key) : undefined}
                    onToggleSelect={selectMode ? () => toggleTrack(info.trackId, info.friendId) : undefined}
                  />
                );
              })}
            </Grid>
          )}
          {hasMore && (
            <Box ref={bottomSentinelRef} height="1px" />
          )}
          {loadingMore && (
            <Flex justify="center" py={4}>
              <Spinner size="md" />
            </Flex>
          )}
        </>
      )}
      {/* End of results/infinite scroll */}

      <TrackSelectionBar
        selectedCount={selectedTracks.size}
        loadedCount={trackInfo.length}
        downloadableCount={downloadableTracks.length}
        onSelectAll={selectAll}
        onClear={() => { clearSelection(); setSelectMode(false); }}
        onEnrich={handleEnrich}
        onDownloadAudio={handleDownloadAudio}
      />
        </>
      )}
    </Box>
  );
};

export default SearchResults;

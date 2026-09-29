"use client";

import React from "react";
import { Box, Text, IconButton, Flex, Spinner } from "@chakra-ui/react";
import { LuLayoutGrid, LuTable, LuListChecks } from "react-icons/lu";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { analytics } from "@/lib/analytics/client";
import TrackSelectionBar from "@/components/TrackSelectionBar";
import { useEnrichmentStore } from "@/stores/enrichmentStore";
import { useTrackStore } from "@/stores/trackStore";
import { analyzeTrackAsync } from "@/services/internalApi/tracks";
import { toaster } from "@/components/ui/toaster";

import TrackResultStore from "@/components/TrackResultStore";
import TrackTableViewWithLoader from "@/components/TrackTableViewWithLoader";
import UnifiedSearchControls from "@/components/search/UnifiedSearchControls";
import { useSearchResults } from "@/hooks/useSearchResults";
import TrackActionsMenu from "@/components/TrackActionsMenu";
import { useTrack } from "@/hooks/useTrack";
import FilterChips from "@/components/FilterChips";
import { TracksFilter, buildSearchFilters, createEmptyFilters, getActiveFilterCount } from "@/lib/trackFilters";
import { useUsername } from "@/providers/UsernameProvider";

const TrackResultItem: React.FC<{
  trackId: string;
  friendId: number;
  playlistCount?: number;
  compact?: boolean;
  playlistMode?: boolean;
  showUsername?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}> = ({ trackId, friendId, playlistCount, compact, playlistMode, showUsername, isSelected, onToggleSelect }) => {
  const track = useTrack(trackId, friendId);

  if (!track) {
    return null; // Track not yet loaded in store
  }

  const trackResult = (
    <TrackResultStore
      trackId={trackId}
      friendId={friendId}
      fallbackTrack={track}
      playlistCount={playlistCount}
      buttons={[<TrackActionsMenu key="menu" track={track} />]}
      compact={compact}
      playlistMode={playlistMode}
      showUsername={showUsername}
      isSelected={isSelected}
      onToggleSelect={onToggleSelect}
    />
  );

  return trackResult;
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
    onQueryChange,
    estimatedResults,
    trackInfo,
    playlistCounts,
    hasMore,
    loadMore,
    initialLoading,
    loadingMore,
  } = useSearchResults({
    enabled: isHydrated && !!currentUserFriend,
    mode: "infinite",
    limit: 20,
    friend: currentUserFriend,
    filter: searchFilters.length > 0 ? searchFilters : undefined,
  });

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

  const toggleSelectMode = React.useCallback(() => {
    setSelectMode((prev) => {
      if (prev) clearSelection();
      return !prev;
    });
  }, [clearSelection]);

  // View mode state with localStorage persistence
  const [viewMode, setViewMode] = React.useState<"card" | "table">("card");

  React.useEffect(() => {
    const saved = localStorage.getItem("searchViewMode");
    if (saved === "card" || saved === "table") {
      setViewMode(saved);
    }
  }, []);

  const handleViewModeChange = (mode: "card" | "table") => {
    setViewMode(mode);
    localStorage.setItem("searchViewMode", mode);
  };

  const handleFilterToggle = React.useCallback((key: string) => {
    setActiveFilters((prev) => ({
      ...prev,
      [key]: !prev[key as keyof TracksFilter],
    }));
  }, []);

  const handleClearAllFilters = React.useCallback(() => {
    setActiveFilters(createEmptyFilters());
  }, []);
  const activeFilterCount = getActiveFilterCount(activeFilters);

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
          });
        }
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [debouncedValue, onQueryChange, query, activeFilterCount]);

  // Hydrate query and filters from URL on first mount
  React.useEffect(() => {
    const urlQ = searchParams?.get("q") ?? "";
    if (urlQ && urlQ !== debouncedValue) {
      setDebouncedValue(urlQ);
    }
    const fromUrl: TracksFilter = {
      missingAudio: searchParams?.get("missingAudio") === "1",
      missingMetadata: searchParams?.get("missingMetadata") === "1",
      missingAnyStreamingUrl: searchParams?.get("missingAnyStreamingUrl") === "1",
      missingAppleMusic: searchParams?.get("missingAppleMusic") === "1",
      missingYouTube: searchParams?.get("missingYouTube") === "1",
      missingSoundCloud: searchParams?.get("missingSoundCloud") === "1",
    };
    if (Object.values(fromUrl).some(Boolean)) {
      setActiveFilters(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep URL in sync when query or filters change
  React.useEffect(() => {
    if (!pathname) return;
    const params = new URLSearchParams(searchParamsString);
    if (query && query.length > 0) {
      params.set("q", query);
    } else {
      params.delete("q");
    }
    const filterKeys: (keyof TracksFilter)[] = [
      "missingAudio", "missingMetadata", "missingAnyStreamingUrl",
      "missingAppleMusic", "missingYouTube", "missingSoundCloud",
    ];
    filterKeys.forEach((key) => {
      if (activeFilters[key]) params.set(key, "1");
      else params.delete(key);
    });
    const nextQueryString = params.toString();
    if (nextQueryString === searchParamsString) return;
    const newUrl = nextQueryString ? `${pathname}?${nextQueryString}` : pathname;
    router.replace(newUrl);
  }, [query, activeFilters, pathname, router, searchParamsString]);

  return (
    <Box mb={'100px'}>
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
        mobilePrimaryControl={
          <IconButton
            aria-label="Select tracks"
            size="sm"
            variant={selectMode ? "solid" : "ghost"}
            onClick={toggleSelectMode}
          >
            <LuListChecks />
          </IconButton>
        }
        desktopControls={
          <>
            <IconButton
              aria-label="Select tracks"
              size="sm"
              variant={selectMode ? "solid" : "ghost"}
              onClick={toggleSelectMode}
            >
              <LuListChecks />
            </IconButton>
            <IconButton
              aria-label="Card view"
              size="sm"
              variant={viewMode === "card" ? "solid" : "ghost"}
              onClick={() => handleViewModeChange("card")}
            >
              <LuLayoutGrid />
            </IconButton>
            <IconButton
              aria-label="Table view"
              size="sm"
              variant={viewMode === "table" ? "solid" : "ghost"}
              onClick={() => handleViewModeChange("table")}
            >
              <LuTable />
            </IconButton>
          </>
        }
      />

      <Box mt={3}>
        <FilterChips
          chips={[
            { key: "missingAudio", label: "Missing audio", active: !!activeFilters.missingAudio },
            { key: "missingMetadata", label: "Missing metadata", active: !!activeFilters.missingMetadata },
            { key: "missingAnyStreamingUrl", label: "No streaming URL", active: !!activeFilters.missingAnyStreamingUrl },
            { key: "missingAppleMusic", label: "No Apple Music", active: !!activeFilters.missingAppleMusic },
            { key: "missingYouTube", label: "No YouTube", active: !!activeFilters.missingYouTube },
            { key: "missingSoundCloud", label: "No SoundCloud", active: !!activeFilters.missingSoundCloud },
          ]}
          onToggle={handleFilterToggle}
          onClearAll={activeFilterCount > 0 ? handleClearAllFilters : undefined}
        />
      </Box>

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
          <Text fontSize="sm" color="gray.500" mb={2} mt={3}>
            {estimatedResults.toLocaleString()} results found
            {activeFilterCount > 0 && (
              <Text as="span" color="blue.500" ml={2}>
                ({activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} active)
              </Text>
            )}
          </Text>

          {viewMode === "card" ? (
            // Card view
            trackInfo.map((info) => {
              const key = `${info.trackId}:${info.friendId}`;
              return (
                <TrackResultItem
                  key={`search-${info.trackId}-${info.friendId}`}
                  trackId={info.trackId}
                  friendId={info.friendId}
                  playlistCount={playlistCounts[key]}
                  playlistMode={true}
                  showUsername={false}
                  isSelected={selectMode ? selectedTracks.has(key) : undefined}
                  onToggleSelect={selectMode ? () => toggleTrack(info.trackId, info.friendId) : undefined}
                />
              );
            })
          ) : (
            // Table view
            <>
              <TrackTableViewWithLoader
                trackInfo={trackInfo}
                playlistCounts={playlistCounts}
                buttons={(track) => <TrackActionsMenu track={track} />}
                selectedTracks={selectedTracks}
                onToggleTrack={toggleTrack}
              />
            </>
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

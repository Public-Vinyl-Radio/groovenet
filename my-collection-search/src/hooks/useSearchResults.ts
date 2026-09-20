import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type { Friend, Track } from "@/types/track";
import { useUsername } from "@/providers/UsernameProvider";
import { queryKeys } from "@/lib/queryKeys";
import {
  fetchPlaylistCounts,
  searchTracks,
  type TrackSearchResponse,
} from "@/services/internalApi/tracks";
import { useTrackStore } from "@/stores/trackStore";

interface UseSearchResultsOptions {
  friend?: Friend | null; // optional override; defaults to provider
  filter?: string | string[];
  enabled?: boolean;
  // New: choose between infinite scroll (default) or single-page pagination
  mode?: "infinite" | "page";
  // New: override page size
  limit?: number;
  // New: current page number (1-based) for page mode
  page?: number;
}

type SearchPage = TrackSearchResponse;

const DEFAULT_LIMIT = 20;

export function useSearchResults({
  friend,
  filter,
  enabled: enabledOverride = true,
  mode = "infinite",
  limit: limitOverride,
  page,
}: UseSearchResultsOptions) {
  const [query, setQuery] = useState("");
  const limit = limitOverride ?? DEFAULT_LIMIT;
  const qc = useQueryClient();
  const { setTracks } = useTrackStore();
  const populatedTrackIds = useRef(new Set<string>()); // Track which IDs we've already populated
  const { friend: ctxFriend } = useUsername();
  const selectedFriend = friend ?? ctxFriend;
  const friendId = selectedFriend?.id;
  const selectedUsername = selectedFriend?.username?.trim().toLowerCase();

  const scopeHits = useCallback(
    (hits: Track[]): Track[] => {
      return hits.filter((hit) => {
        if (friendId && Number((hit as { friend_id?: unknown }).friend_id) !== Number(friendId)) {
          return false;
        }
        if (!selectedUsername) return true;
        const hitUsername = typeof hit.username === "string" ? hit.username.trim().toLowerCase() : "";
        if (!hitUsername) return true;
        return hitUsername === selectedUsername;
      });
    },
    [friendId, selectedUsername]
  );

  // Stable filter shape for caching
  const searchFilter = useMemo(
    () => filter ?? (friendId ? [`friend_id = ${friendId}`] : undefined),
    [filter, friendId]
  );
  const normalizedFilter = useMemo(() => {
    if (Array.isArray(searchFilter)) {
      return searchFilter.length > 0 ? searchFilter.join(" AND ") : undefined;
    }
    return searchFilter;
  }, [searchFilter]);

  const enabled = enabledOverride;
  const bootstrapping = false;

  // --- Tracks query (infinite or single page) ---
  const isInfinite = mode === "infinite";

  const infiniteQuery = useInfiniteQuery<SearchPage, Error>({
    queryKey: queryKeys.tracks({ q: query, filter: searchFilter, limit, mode }),
    enabled: enabled && isInfinite,
    refetchOnWindowFocus: false,
    queryFn: async (context): Promise<SearchPage> => {
      const pageParam =
        typeof context.pageParam === "number" ? context.pageParam : 0;
      const res = await searchTracks({
        q: query || "",
        limit,
        offset: pageParam,
        filter: normalizedFilter,
      });
      // Safety net: enforce friend scoping client-side too in case index/filter drifted.
      const scopedHits = scopeHits(res.hits ?? []);
      return {
        hits: scopedHits,
        estimatedTotalHits: res.estimatedTotalHits || 0,
        offset: pageParam,
        limit,
        processingTimeMs: res.processingTimeMs ?? 0,
      };
    },
    getNextPageParam: (last: SearchPage) => {
      const next = last.offset + last.hits.length;
      return next < last.estimatedTotalHits ? next : undefined;
    },
    initialPageParam: 0,
    staleTime: 10_000,
    gcTime: 5 * 60_000,
  });

  const singlePageQuery = useQuery<SearchPage, Error>({
    queryKey: queryKeys.tracks({
      q: query,
      filter: searchFilter,
      limit,
      mode,
      page: page ?? 1,
    }),
    enabled: enabled && !isInfinite,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<SearchPage> => {
      const currentPage = Math.max(1, page ?? 1);
      const offset = (currentPage - 1) * limit;
      const res = await searchTracks({
        q: query || "",
        limit,
        offset,
        filter: normalizedFilter,
      });
      // Safety net: enforce friend scoping client-side too in case index/filter drifted.
      const scopedHits = scopeHits(res.hits ?? []);
      return {
        hits: scopedHits,
        estimatedTotalHits: res.estimatedTotalHits || 0,
        offset,
        limit,
        processingTimeMs: res.processingTimeMs ?? 0,
      };
    },
    staleTime: 10_000,
    gcTime: 5 * 60_000,
  });

  const pages = useMemo(
    () =>
      isInfinite
        ? (infiniteQuery.data?.pages ?? [])
        : singlePageQuery.data
        ? [singlePageQuery.data]
        : [],
    [isInfinite, infiniteQuery.data?.pages, singlePageQuery.data]
  );
  const results = useMemo(
    () => scopeHits(pages.flatMap((p) => p.hits)),
    [pages, scopeHits]
  );
  const estimatedResults = pages[0]?.estimatedTotalHits ?? 0;

  // Populate Zustand store when results change - but only with new tracks
  useEffect(() => {
    if (results.length === 0) return;

    // Filter to only new tracks that we haven't populated yet
    const newTracks = results.filter(track => {
      const key = `${track.track_id}:${track.friend_id || 'default'}`;
      return !populatedTrackIds.current.has(key);
    });

    if (newTracks.length > 0) {
      console.log('🔍 useSearchResults calling setTracks with', newTracks.length, 'new tracks');
      setTracks(newTracks);

      // Mark these tracks as populated
      newTracks.forEach(track => {
        const key = `${track.track_id}:${track.friend_id || 'default'}`;
        populatedTrackIds.current.add(key);
      });
    }
  }, [results, setTracks]); // Check on every results change, but only populate new ones

  // Return track info instead of full track objects to force components to read from store
  const trackInfo = results.map((track) => ({
    trackId: track.track_id,
    friendId: track.friend_id
  }));

  // --- Playlist counts (dependent query on unique track_id + friend_id pairs) ---
  const trackRefs = useMemo(() => {
    const dedup = new Map<string, { track_id: string; friend_id: number }>();
    for (const track of results) {
      const key = `${track.track_id}:${track.friend_id}`;
      if (!dedup.has(key)) {
        dedup.set(key, { track_id: track.track_id, friend_id: track.friend_id });
      }
    }
    return Array.from(dedup.values());
  }, [results]);

  const countsQuery = useQuery({
    queryKey: queryKeys.playlistCounts(
      trackRefs.map((r) => `${r.track_id}:${r.friend_id}`)
    ),
    enabled: enabled && trackRefs.length > 0,
    queryFn: async () => {
      return await fetchPlaylistCounts(trackRefs);
    },
    staleTime: 60_000,
  });

  // --- API compatibility layer ---
  const hasMore = isInfinite
    ? !!infiniteQuery.hasNextPage
    : (page ?? 1) * limit < estimatedResults;
  const loadMore = useCallback(() => {
    if (isInfinite) return infiniteQuery.fetchNextPage();
    // no-op in page mode; parent controls page state
  }, [infiniteQuery, isInfinite]);
  const refreshSearch = useCallback(() => {
    return isInfinite ? infiniteQuery.refetch() : singlePageQuery.refetch();
  }, [infiniteQuery, singlePageQuery, isInfinite]);

  // Old hook had a refreshFlag with needsRefresh(). Here we invalidate cache.
  const needsRefresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: queryKeys.tracks({}) });
  }, [qc]);

  // “Clear filter” previously loaded random docs; we emulate that by
  // resetting the query and invalidating cached track searches.
  const clearFilter = useCallback(async () => {
    setQuery("");
    qc.invalidateQueries({ queryKey: queryKeys.tracksRoot() });
  }, [qc]);

  // onChange helper kept for drop-in compatibility
  const onQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value),
    []
  );

  // loading: combine initial + fetching-next
  const loading = isInfinite
    ? bootstrapping || infiniteQuery.isPending || infiniteQuery.isFetching
    : bootstrapping || singlePageQuery.isPending || singlePageQuery.isFetching;
  const initialLoading = isInfinite
    ? bootstrapping || infiniteQuery.isPending
    : bootstrapping || singlePageQuery.isPending;
  const loadingMore = isInfinite ? infiniteQuery.isFetchingNextPage : false;

  // setLoading existed in the old API; provide a no-op to avoid breakage.
  const setLoading = useCallback(() => {
    // no-op; handled by React Query now
  }, []);

  return {
    // data
    estimatedResults,
    results, // Keep this for backward compatibility
    trackInfo, // New: track info for components to read from store
    playlistCounts: countsQuery.data ?? {},

    // status
    hasMore,
    loading,
    initialLoading,
    loadingMore,

    // actions
    loadMore,
    refreshSearch,
    needsRefresh,
    clearFilter,

    // query state
    query,
    setQuery,
    onQueryChange,

    // legacy compatibility
    setLoading,
  };
}

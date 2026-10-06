"use client";

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { fetchTrackGenreFacets } from "@/services/internalApi/tracks";

/**
 * Track counts per genre id for a keyword search (#375), for the genre
 * filter. `counts` is undefined while disabled, so the filter shows none.
 */
export function useTrackGenreFacets(params: { q: string; filter?: string; enabled: boolean }) {
  const { q, filter, enabled } = params;
  const query = useQuery({
    queryKey: queryKeys.trackGenreFacets({ q, filter }),
    queryFn: () => fetchTrackGenreFacets({ q, filter }),
    enabled,
    staleTime: 30_000,
    // Keep the last counts while the next search's load, so the list doesn't flash.
    placeholderData: keepPreviousData,
  });
  const counts = useMemo(
    () =>
      enabled && query.data
        ? new Map(query.data.genres.map((genre) => [genre.id, genre.track_count]))
        : undefined,
    [enabled, query.data]
  );
  return { ...query, counts };
}

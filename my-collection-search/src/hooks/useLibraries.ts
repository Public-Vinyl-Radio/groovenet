"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { lookupDiscogsUser } from "@/services/internalApi/discogs";
import { fetchLibraries } from "@/services/internalApi/friends";

/** Settings → Libraries: each library with its album count and last sync, your account first. */
export function useLibrariesQuery() {
  return useQuery({ queryKey: queryKeys.libraries(), queryFn: fetchLibraries });
}

/**
 * Look up a Discogs username for the add-library modal. Runs only once a
 * username is submitted (null until then), never retries or refetches on its
 * own: every lookup is one Discogs request someone asked for.
 */
export function useDiscogsUserLookup(username: string | null) {
  return useQuery({
    queryKey: queryKeys.discogsUserLookup(username ?? ""),
    queryFn: () => lookupDiscogsUser(username as string),
    enabled: !!username,
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

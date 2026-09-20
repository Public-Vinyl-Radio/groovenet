"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { fetchTracksByIds } from "@/services/internalApi/tracks";
import type { Track } from "@/types/track";
import { queryKeys } from "@/lib/queryKeys";
import { useTrackStore } from "@/stores/trackStore";

export function usePlaylistTracksQuery(
  trackRefs: { track_id: string; friend_id: number }[],
  enabled = true
) {
  const setTracks = useTrackStore((state) => state.setTracks);
  const tracksMap = useTrackStore((state) => state.tracks);

  const query = useQuery<Track[], Error>({
    queryKey: queryKeys.playlistTracks(trackRefs),
    queryFn: () => fetchTracksByIds(trackRefs, { includeVectors: true }),
    enabled: enabled && trackRefs.length > 0,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Populate Zustand store when tracks are fetched
  useEffect(() => {
    if (query.data && query.data.length > 0) {
      console.log('📋 usePlaylistTracksQuery calling setTracks');
      setTracks(query.data);
    }
  }, [query.data, setTracks]);

  // Canonical entity read path: resolve ordered playlist tracks from Zustand.
  const tracks = useMemo(
    () =>
      trackRefs
        .map((ref) => tracksMap.get(`${ref.track_id}:${ref.friend_id}`))
        .filter((track): track is Track => track !== undefined),
    [tracksMap, trackRefs]
  );

  return { ...query, tracks };
}

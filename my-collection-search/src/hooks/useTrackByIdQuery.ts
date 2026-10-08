"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchTrackById } from "@/services/internalApi/tracks";
import type { Track } from "@/types/track";
import { queryKeys } from "@/lib/queryKeys";
import { useTrackStore } from "@/stores/trackStore";

export function useTrackByIdQuery(track_id?: string, friend_id?: number, enabled = true) {
  const setTrack = useTrackStore((state) => state.setTrack);

  const query = useQuery<Track, Error>({
    queryKey:
      track_id && typeof friend_id === "number"
        ? queryKeys.trackById(track_id, friend_id)
        : ["track", "by-id", "missing-params"],
    queryFn: async () => fetchTrackById({ track_id: track_id!, friend_id: friend_id! }),
    enabled: enabled && !!track_id && !!friend_id,
  });

  // The authoritative, full-fidelity read for this track. Writing it to the
  // store replaces any stale partial entry seeded elsewhere (e.g. album
  // detail, before it carried `hasVectors`) instead of being shadowed by it.
  useEffect(() => {
    if (query.data) setTrack(query.data);
  }, [query.data, setTrack]);

  return query;
}

"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ServerQueueEntry } from "@groovenet/contracts";
import { fetchTracksByIds } from "@/services/internalApi/tracks";
import { queryKeys } from "@/lib/queryKeys";
import { useTrackStore } from "@/stores/trackStore";
import type { Track } from "@/types/track";

const refKey = (entry: Pick<ServerQueueEntry, "track_id" | "friend_id">) => `${entry.track_id}:${entry.friend_id}`;

/** A queue row before its track has loaded: the title and artist the server already sent. */
export function placeholderTrack(entry: ServerQueueEntry): Track {
  return {
    id: 0, track_id: entry.track_id, friend_id: entry.friend_id, title: entry.title, artist: entry.artist,
    album: "", year: "", duration: "", position: "", discogs_url: "", apple_music_url: "",
  } as Track;
}

/**
 * The server queue as Tracks for the shared queue UI. Rows come from the track
 * store (fetched once per unique ref), so artwork, duration and key match
 * local mode; each keeps its entry's title and artist until then.
 */
export function useServerQueueTracks(entries: readonly ServerQueueEntry[]): Track[] {
  const setTracks = useTrackStore((state) => state.setTracks);
  const tracksMap = useTrackStore((state) => state.tracks);
  const refs = useMemo(() => {
    const unique = new Map<string, { track_id: string; friend_id: number }>();
    for (const { track_id, friend_id } of entries) unique.set(`${track_id}:${friend_id}`, { track_id, friend_id });
    return [...unique.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);
  const missing = refs.filter(([key]) => !tracksMap.has(key));
  const query = useQuery({
    queryKey: queryKeys.serverQueueTracks(missing.map(([key]) => key)),
    queryFn: () => fetchTracksByIds(missing.map(([, ref]) => ref)),
    enabled: missing.length > 0,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (query.data?.length) setTracks(query.data);
  }, [query.data, setTracks]);
  return useMemo(
    () => entries.map((entry) => tracksMap.get(refKey(entry)) ?? placeholderTrack(entry)),
    [entries, tracksMap]
  );
}

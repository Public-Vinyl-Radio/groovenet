"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import {
  clearTrackLyrics,
  fetchTrackLyrics,
  saveTrackLyrics,
  type TrackLyricsState,
} from "@/services/internalApi/trackLyrics";

/**
 * The track page's lyrics (#1171): one small read, so the ⋯ menu can say
 * "Lyrics" or "Add lyrics" and leave the item off a friend's track (#1214). Lyrics are not
 * a Track field (they stay out of the entity store, as they stay out of
 * `tracks`), so React Query holds them.
 */
export function useTrackLyrics(trackId: string, friendId: number, { enabled = true } = {}) {
  const queryClient = useQueryClient();
  const key = queryKeys.trackLyrics(trackId, friendId);

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchTrackLyrics(trackId, friendId),
    enabled,
  });

  const save = useMutation({
    mutationFn: (text: string) => saveTrackLyrics(trackId, friendId, text),
    onSuccess: (lyrics) => {
      const next: TrackLyricsState = { kind: "lyrics", lyrics };
      queryClient.setQueryData(key, next);
    },
  });

  const clear = useMutation({
    mutationFn: () => clearTrackLyrics(trackId, friendId),
    onSuccess: () => {
      const next: TrackLyricsState = { kind: "none" };
      queryClient.setQueryData(key, next);
    },
  });

  return { query, save, clear };
}

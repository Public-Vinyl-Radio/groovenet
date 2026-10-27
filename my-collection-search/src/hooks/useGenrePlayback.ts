"use client";

import { useEffect, useRef, useState } from "react";
import { usePlaybackPlayer } from "@/providers/PlaybackTargetProvider";
import { searchTracks } from "@/services/internalApi/tracks";
import { useTrackStore } from "@/stores/trackStore";
import type { Track } from "@/types/track";

/** Collect every matching page before replacing the selected output's queue. */
export function useGenrePlayback(slug: string, friendId: number | undefined) {
  const { replacePlaylist } = usePlaybackPlayer();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    const currentGeneration = ++generation.current;
    pending.current = false;
    setBusy(false);
    setProblem(null);
    return () => { generation.current = currentGeneration + 1; };
  }, [slug, friendId]);

  const play = async (shuffle: boolean) => {
    if (friendId === undefined || pending.current) return;
    const request = generation.current;
    pending.current = true;
    setBusy(true);
    setProblem(null);
    try {
      const playable = new Map<string, Track>();
      let offset = 0;
      while (true) {
        const page = await searchTracks({ genre: [slug], filter: `friend_id = ${friendId}`, limit: 200, offset });
        if (request !== generation.current) return;
        useTrackStore.getState().setTracks(page.hits);
        page.hits.forEach((track) => {
          if (track.local_audio_url?.trim()) playable.set(`${track.track_id}:${track.friend_id}`, track);
        });
        offset = page.offset + page.limit;
        if (!page.hits.length || page.limit <= 0 || offset >= page.estimatedTotalHits) break;
      }
      const tracks = [...playable.values()];
      if (!tracks.length) { setProblem("No playable tracks in this genre yet."); return; }
      if (shuffle) {
        for (let i = tracks.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
        }
      }
      replacePlaylist(tracks, { autoplay: true, startIndex: 0 });
    } catch (error) {
      if (request === generation.current) setProblem(error instanceof Error ? error.message : "Couldn’t load tracks for playback.");
    } finally {
      if (request === generation.current) { pending.current = false; setBusy(false); }
    }
  };
  return { play, busy, problem };
}

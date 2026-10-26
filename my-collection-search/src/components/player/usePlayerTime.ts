"use client";

import { useEffect, useState } from "react";
import { usePlaylistPlayerTime } from "@/providers/PlaylistPlayerProvider";
import { useOptionalPlaybackTarget } from "@/providers/PlaybackTargetProvider";

/**
 * Elapsed and total seconds for whatever the player shows: this browser's
 * audio, or the selected server. Between the server's position events the
 * elapsed time runs on locally while it plays, so the line doesn't stall.
 */
export function usePlayerTime(): { currentTime: number; duration: number } {
  const local = usePlaylistPlayerTime();
  const target = useOptionalPlaybackTarget();
  const state = target && target.target !== "" ? target.remote.player?.state ?? null : null;
  const playing = state?.status === "playing";
  const [now, setNow] = useState(() => Date.now());
  const [observedAt, setObservedAt] = useState(0);
  const position = state?.position ?? 0;
  // Each new observation (position, track or status) restarts the local clock.
  const observation = state ? `${position}:${state.current_entry_id}:${state.status}` : "";
  useEffect(() => {
    if (observation) setObservedAt(Date.now());
  }, [observation]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [playing]);
  if (!target || target.target === "") return local;
  // No current entry: nothing to time, whatever checkpoint the server kept.
  if (!state || state.current_entry_id === null) return { currentTime: 0, duration: 0 };
  const duration = state.duration ?? 0;
  const drift = playing && observedAt ? Math.max(0, now - observedAt) / 1000 : 0;
  const elapsed = position + drift;
  return { currentTime: duration > 0 ? Math.min(elapsed, duration) : elapsed, duration };
}

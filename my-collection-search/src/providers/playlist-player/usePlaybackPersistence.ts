"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Track } from "@/types/track";

type UsePlaybackPersistenceArgs = {
  storageKey: string;
  playlist: Track[];
  playlistRef: RefObject<Track[]>;
  currentTrackIndex: number | null;
  isPlaying: boolean;
  volume: number;
  currentTime: number;
  plVersion: number;
  pendingSeekRef: RefObject<number | null>;
  audioRef: RefObject<HTMLAudioElement | null>;
  setPlaylist: (next: Track[]) => void;
  setPlVersion: Dispatch<SetStateAction<number>>;
  setCurrentTrackIndex: Dispatch<SetStateAction<number | null>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  setVolumeState: Dispatch<SetStateAction<number>>;
};

export function usePlaybackPersistence({
  storageKey,
  playlist,
  playlistRef,
  currentTrackIndex,
  isPlaying,
  volume,
  currentTime,
  plVersion,
  pendingSeekRef,
  audioRef,
  setPlaylist,
  setPlVersion,
  setCurrentTrackIndex,
  setIsPlaying,
  setVolumeState,
}: UsePlaybackPersistenceArgs) {
  const lastSavedSecondRef = useRef<number | null>(null);
  // Persisting is held back until the restore has been applied. Otherwise the
  // persist effects, which run in the same commit as the restore effect with
  // the still-empty initial state in their closure, overwrite the stored queue
  // before it is read again (StrictMode re-runs effects in dev) or before the
  // restored state has rendered. State, not a ref, so the restored values and
  // the flag land in the same render and the first write carries them.
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const data = JSON.parse(raw) as {
        playlist?: Track[];
        currentTrackIndex?: number | null;
        isPlaying?: boolean;
        volume?: number;
        currentTime?: number;
      };

      if (Array.isArray(data.playlist)) {
        playlistRef.current = data.playlist as Track[];
        setPlaylist(data.playlist as Track[]);
        setPlVersion((v) => v + 1);
      }
      if (typeof data.currentTrackIndex === "number" || data.currentTrackIndex === null) {
        setCurrentTrackIndex(data.currentTrackIndex ?? null);
      }
      if (typeof data.isPlaying === "boolean") {
        setIsPlaying(data.isPlaying);
      }
      if (typeof data.volume === "number") {
        const vol = Math.max(0, Math.min(1, data.volume));
        setVolumeState(vol);
        if (audioRef.current) audioRef.current.volume = vol;
      }
      if (typeof data.currentTime === "number") {
        pendingSeekRef.current = data.currentTime;
      }
    } catch {
      // ignore storage errors
    } finally {
      setRestored(true);
    }
  }, [
    audioRef,
    pendingSeekRef,
    playlistRef,
    setCurrentTrackIndex,
    setIsPlaying,
    setPlVersion,
    setPlaylist,
    setVolumeState,
    storageKey,
  ]);

  const persistState = useCallback(
    (override?: Partial<{ currentTime: number }>) => {
      if (!restored) return;
      try {
        const payload = {
          playlist,
          currentTrackIndex,
          isPlaying,
          volume,
          currentTime: override?.currentTime ?? currentTime,
        };
        window.localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch {
        // ignore storage errors
      }
    },
    [currentTime, currentTrackIndex, isPlaying, playlist, restored, storageKey, volume],
  );

  useEffect(() => {
    persistState();
  }, [plVersion, currentTrackIndex, isPlaying, volume, persistState]);

  useEffect(() => {
    if (!restored) return;
    const sec = Math.floor(currentTime || 0);
    if (lastSavedSecondRef.current === sec) return;
    lastSavedSecondRef.current = sec;
    persistState({ currentTime });
  }, [currentTime, persistState, restored]);
}

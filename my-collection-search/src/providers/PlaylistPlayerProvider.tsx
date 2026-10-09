"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Track } from "@/types/track";
import {
  useQueueState,
  type ReplacePlaylistOptions,
  type QueueSnapshot,
} from "@/providers/playlist-player/useQueueState";
import { useAudioEngine } from "@/providers/playlist-player/useAudioEngine";
import { usePlaybackPersistence } from "@/providers/playlist-player/usePlaybackPersistence";
import { useAirPlay } from "@/providers/playlist-player/useAirPlay";
import {
  useMediaSession,
  type MediaSessionLike,
} from "@/providers/playlist-player/useMediaSession";

type PlaylistPlayerContextValue = {
  isPlaying: boolean;
  currentTrackIndex: number | null;
  currentTrack: Track | null;
  finishedTrack: Track | null;
  playlist: Track[];
  playlistLength: number;
  // Playback position
  seek: (time: number) => void;

  play: () => void;
  pause: () => void;
  stop: () => void;
  playNext: () => void;
  playPrev: () => void;
  playTrack: (index: number) => void;

  replacePlaylist: (next: Track[], opts?: ReplacePlaylistOptions) => void;
  appendToQueue: (items: Track[] | Track) => void;
  enqueueNext: (items: Track[] | Track) => void;
  clearQueue: () => void;
  restoreQueue: (snapshot: QueueSnapshot) => void;
  moveTrackInQueue: (fromIndex: number, toIndex: number) => void;
  removeFromQueue: (index: number) => void;

  volume: number;
  setVolume: (v: number) => void;
  isAirPlayAvailable: boolean;
  isAirPlayActive: boolean;
  showAirPlayPicker: () => boolean;

  audioElement: React.ReactNode;
};

type PlaylistPlayerTimeContextValue = {
  currentTime: number;
  duration: number;
};

const PlaylistPlayerContext = createContext<PlaylistPlayerContextValue | null>(
  null
);

const PlaylistPlayerTimeContext =
  createContext<PlaylistPlayerTimeContextValue | null>(null);

export function PlaylistPlayerProvider({
  children,
  initial = [],
}: {
  children: React.ReactNode;
  initial?: Track[];
}) {
  const STORAGE_KEY = "mcs:player";
  const getMediaSession = React.useCallback((): MediaSessionLike | null => {
    if (typeof navigator === "undefined") return null;
    const nav = navigator as unknown as { mediaSession?: MediaSessionLike };
    return nav.mediaSession ?? null;
  }, []);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const {
    playlistRef,
    playlist,
    currentTrack,
    currentTrackIndex,
    isPlaying,
    plVersion,
    finishedTrack,
    setPlaylist,
    setCurrentTrackIndex,
    setIsPlaying,
    setPlVersion,
    play,
    pause,
    stop,
    playNext,
    playPrev,
    playTrack,
    replacePlaylist,
    appendToQueue,
    enqueueNext,
    clearQueue,
    restoreQueue,
    moveTrackInQueue,
    removeFromQueue,
  } = useQueueState({
    initial,
    onPauseImmediate: () => audioRef.current?.pause(),
  });
  const [volume, setVolumeState] = useState(1);

  const {
    currentTime,
    duration,
    pendingSeekRef,
    seek,
    audioElement,
  } = useAudioEngine({
    audioRef,
    playlistRef,
    currentTrackIndex,
    isPlaying,
    plVersion,
    volume,
    onEnded: playNext,
  });

  const { isAirPlayAvailable, isAirPlayActive, showAirPlayPicker } = useAirPlay({
    audioRef,
    plVersion,
  });

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
  }, []);

  usePlaybackPersistence({
    storageKey: STORAGE_KEY,
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
  });

  // Main context value excludes time-sensitive values to prevent constant re-renders
  const value = useMemo<PlaylistPlayerContextValue>(() => {
    // Reference plVersion so dependency is meaningful and value recomputes when playlist changes
    void plVersion;
    return {
      isPlaying,
      currentTrackIndex,
      currentTrack, // use state here
      finishedTrack,
      playlist,
      playlistLength: playlist.length,
      seek,

      play,
      pause,
      stop,
      playNext,
      playPrev,
      playTrack,

      replacePlaylist,
      appendToQueue,
      enqueueNext,
      clearQueue,
      restoreQueue,
      moveTrackInQueue,
      removeFromQueue,

      volume,
      setVolume,
      isAirPlayAvailable,
      isAirPlayActive,
      showAirPlayPicker,

      audioElement,
    };
  }, [
    isPlaying,
    currentTrackIndex,
    currentTrack,
    finishedTrack,
    playlist,
    plVersion,
    seek,
    play,
    pause,
    stop,
    playNext,
    playPrev,
    playTrack,
    replacePlaylist,
    appendToQueue,
    enqueueNext,
    clearQueue,
    restoreQueue,
    moveTrackInQueue,
    removeFromQueue,
    volume,
    setVolume,
    isAirPlayAvailable,
    isAirPlayActive,
    showAirPlayPicker,
    audioElement,
  ]);

  // Time-sensitive context value updates frequently
  const timeValue = useMemo<PlaylistPlayerTimeContextValue>(
    () => ({
      currentTime,
      duration,
    }),
    [currentTime, duration]
  );

  useMediaSession({
    enabled: true,
    getMediaSession,
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    audioRef,
    play,
    pause,
    playPrev,
    playNext,
    stop,
    seek,
  });

  return (
    <PlaylistPlayerContext.Provider value={value}>
      <PlaylistPlayerTimeContext.Provider value={timeValue}>
        {children}
        {audioElement}
      </PlaylistPlayerTimeContext.Provider>
    </PlaylistPlayerContext.Provider>
  );
}

export function usePlaylistPlayer() {
  const ctx = useContext(PlaylistPlayerContext);
  if (!ctx)
    throw new Error(
      "usePlaylistPlayer must be used within PlaylistPlayerProvider"
    );
  return ctx;
}

export function usePlaylistPlayerTime() {
  const ctx = useContext(PlaylistPlayerTimeContext);
  if (!ctx)
    throw new Error(
      "usePlaylistPlayerTime must be used within PlaylistPlayerProvider"
    );
  return ctx;
}

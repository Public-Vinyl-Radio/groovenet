"use client";

import { useEffect } from "react";
import type { RefObject } from "react";
import type { Track } from "@/types/track";

export type MediaSessionLike = {
  metadata: MediaMetadata | null;
  playbackState?: "none" | "paused" | "playing";
  setActionHandler?: (
    action:
      | "play"
      | "pause"
      | "previoustrack"
      | "nexttrack"
      | "stop"
      | "seekbackward"
      | "seekforward"
      | "seekto",
    handler: ((details?: { seekOffset?: number; seekTime?: number }) => void) | null,
  ) => void;
  setPositionState?: (state: {
    duration: number;
    playbackRate?: number;
    position?: number;
  }) => void;
};

type UseMediaSessionArgs = {
  enabled?: boolean;
  getMediaSession: () => MediaSessionLike | null;
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  audioRef: RefObject<HTMLAudioElement | null>;
  play: () => void;
  pause: () => void;
  playPrev: () => void;
  playNext: () => void;
  stop: () => void;
  seek: (time: number) => void;
};

export function useMediaSession({
  enabled = true,
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
}: UseMediaSessionArgs) {
  useEffect(() => {
    if (!enabled) return;
    const mediaSession = getMediaSession();
    if (!mediaSession) return;

    try {
      if (currentTrack) {
        mediaSession.metadata = new window.MediaMetadata({
          title: currentTrack.title,
          artist: currentTrack.artist,
          album: currentTrack.album,
          artwork: currentTrack.album_thumbnail
            ? [
                {
                  src: currentTrack.album_thumbnail,
                  sizes: "96x96",
                  type: "image/png",
                },
              ]
            : undefined,
        });
      } else {
        mediaSession.metadata = null;
      }
    } catch {}

    const getNow = () => audioRef.current?.currentTime ?? 0;

    try {
      mediaSession.setActionHandler?.("play", play);
      mediaSession.setActionHandler?.("pause", pause);
      mediaSession.setActionHandler?.("previoustrack", playPrev);
      mediaSession.setActionHandler?.("nexttrack", playNext);
      mediaSession.setActionHandler?.("stop", stop);
      mediaSession.setActionHandler?.("seekbackward", (details?: { seekOffset?: number }) => {
        const offset = typeof details?.seekOffset === "number" ? details.seekOffset : 10;
        seek(getNow() - offset);
      });
      mediaSession.setActionHandler?.("seekforward", (details?: { seekOffset?: number }) => {
        const offset = typeof details?.seekOffset === "number" ? details.seekOffset : 10;
        seek(getNow() + offset);
      });
      mediaSession.setActionHandler?.("seekto", (details?: { seekTime?: number }) => {
        if (typeof details?.seekTime === "number") {
          seek(details.seekTime);
        }
      });
    } catch {}

    return () => {
      try {
        mediaSession.setActionHandler?.("play", null);
        mediaSession.setActionHandler?.("pause", null);
        mediaSession.setActionHandler?.("previoustrack", null);
        mediaSession.setActionHandler?.("nexttrack", null);
        mediaSession.setActionHandler?.("stop", null);
        mediaSession.setActionHandler?.("seekbackward", null);
        mediaSession.setActionHandler?.("seekforward", null);
        mediaSession.setActionHandler?.("seekto", null);
      } catch {}
    };
  }, [
    enabled,
    audioRef,
    currentTrack,
    getMediaSession,
    pause,
    play,
    playNext,
    playPrev,
    seek,
    stop,
  ]);

  useEffect(() => {
    if (!enabled) return;
    const mediaSession = getMediaSession();
    if (!mediaSession) return;
    try {
      mediaSession.playbackState = isPlaying ? "playing" : "paused";
    } catch {}
  }, [enabled, getMediaSession, isPlaying]);

  useEffect(() => {
    if (!enabled) return;
    const mediaSession = getMediaSession();
    if (!mediaSession || typeof mediaSession.setPositionState !== "function") return;
    try {
      if (Number.isFinite(duration) && duration > 0) {
        mediaSession.setPositionState({
          duration,
          playbackRate: 1.0,
          position: currentTime || 0,
        });
      }
    } catch {}
  }, [enabled, currentTime, duration, getMediaSession]);
}

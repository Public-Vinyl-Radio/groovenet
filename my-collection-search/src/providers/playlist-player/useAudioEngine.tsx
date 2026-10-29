"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Track } from "@/types/track";

type UseAudioEngineArgs = {
  audioRef: RefObject<HTMLAudioElement | null>;
  playlistRef: RefObject<Track[]>;
  currentTrackIndex: number | null;
  isPlaying: boolean;
  plVersion: number;
  volume: number;
  onEnded: () => void;
};

function toAudioFilename(localAudioUrl: string | null | undefined): string {
  const raw = (localAudioUrl ?? "").trim();
  if (!raw) return "";
  const withoutQuery = raw.split("?")[0];
  const segments = withoutQuery.split("/").filter(Boolean);
  return segments.length ? segments[segments.length - 1] : "";
}

export function useAudioEngine({
  audioRef,
  playlistRef,
  currentTrackIndex,
  isPlaying,
  plVersion,
  volume,
  onEnded,
}: UseAudioEngineArgs) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const pendingSeekRef = useRef<number | null>(null);
  const lastTrackIdRef = useRef<string | null>(null);
  const playRequestedRef = useRef(false);

  const tryPlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().catch((err: unknown) => {
      const name =
        typeof err === "object" &&
        err !== null &&
        "name" in err &&
        typeof (err as { name?: unknown }).name === "string"
          ? (err as { name: string }).name
          : "Error";
      console.warn("[Player] audio.play() failed:", name);
    });
  }, [audioRef]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const pl = playlistRef.current;
    if (isPlaying && currentTrackIndex !== null && pl[currentTrackIndex]) {
      playRequestedRef.current = true;
      tryPlay();
    } else {
      playRequestedRef.current = false;
      audio.pause();
    }
  }, [audioRef, currentTrackIndex, isPlaying, plVersion, playlistRef, tryPlay]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const pl = playlistRef.current;
    const track = currentTrackIndex !== null ? pl[currentTrackIndex] : null;

    if (!track) {
      playRequestedRef.current = false;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      setDuration(audio.duration || 0);
      return;
    }

    if (lastTrackIdRef.current !== track.track_id) {
      const filename = toAudioFilename(track.local_audio_url);
      audio.src = `/api/audio?filename=${encodeURIComponent(filename)}`;
      audio.load();
      lastTrackIdRef.current = track.track_id;
      setCurrentTime(0);
      setDuration(0);
    }

    if (isPlaying) {
      playRequestedRef.current = true;
      tryPlay();
    } else {
      playRequestedRef.current = false;
      audio.pause();
    }
  }, [audioRef, currentTrackIndex, isPlaying, plVersion, playlistRef, tryPlay]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [audioRef, plVersion, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      if (pendingSeekRef.current != null && Number.isFinite(pendingSeekRef.current)) {
        const dur = audio.duration || 0;
        const clamped = Math.max(0, Math.min(dur || 0, pendingSeekRef.current));
        try {
          audio.currentTime = clamped;
          setCurrentTime(clamped);
        } catch {}
        pendingSeekRef.current = null;
      }
    };
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onCanPlay = () => {
      if (playRequestedRef.current) {
        tryPlay();
      }
    };
    const onError = () => {
      const code = audio.error?.code ?? "unknown";
      const msg = audio.error?.message ?? "Unknown media error";
      console.error(`[Player] media error code=${code}: ${msg}`);
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("error", onError);
    };
  }, [audioRef, currentTrackIndex, plVersion, tryPlay]);

  const seek = useCallback(
    (time: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const dur = Number.isFinite(duration) && duration > 0 ? duration : audio.duration || 0;
      const clamped = Math.max(0, Math.min(dur || 0, time));
      try {
        audio.currentTime = clamped;
        setCurrentTime(clamped);
      } catch {}
    },
    [audioRef, duration],
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleEnded = () => onEnded();
    audio.addEventListener("ended", handleEnded);
    return () => audio.removeEventListener("ended", handleEnded);
  }, [audioRef, onEnded]);

  const audioElement = useMemo(
    () => (
      <audio
        id="playlist-audio"
        ref={audioRef}
        preload="auto"
        playsInline
        crossOrigin="anonymous"
        controls
        style={{ display: "none" }}
      />
    ),
    [audioRef],
  );

  return {
    currentTime,
    duration,
    pendingSeekRef,
    seek,
    audioElement,
  };
}

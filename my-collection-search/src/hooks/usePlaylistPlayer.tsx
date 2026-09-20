"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Track } from "@/types/track";

export function usePlaylistPlayer(initial: Track[] = []) {
  const playlistRef = useRef<Track[]>(initial);
  const [playlist, setPlaylist] = useState<Track[]>(initial);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [plVersion, setPlVersion] = useState(0);


  const replacePlaylist = useCallback(
    (next: Track[], { autoplay = true, startIndex = 0 } = {}) => {
      const nextPlaylist = [...next];
      playlistRef.current = nextPlaylist;
      setPlaylist(nextPlaylist);
      setPlVersion((v) => v + 1);

      const hasTracks = playlistRef.current.length > 0;

      console.log("replacePlaylist", {
        hasTracks,
        autoplay,
        startIndex,
        playlistRef
      });
      setCurrentTrackIndex(hasTracks ? startIndex : null);
      setIsPlaying(autoplay && hasTracks);
    },
    []
  );

  // Reset when playlist content (not just reference) changes
  const prevPlaylistHashRef = useRef<string | null>(null);
  useEffect(() => {
    const playlistHash = JSON.stringify(
      (playlistRef.current ?? []).map((t) => t.track_id)
    );
    if (
      prevPlaylistHashRef.current &&
      prevPlaylistHashRef.current !== playlistHash
    ) {
      setCurrentTrackIndex(null);
      setIsPlaying(false);
    }
    prevPlaylistHashRef.current = playlistHash;
  }, [plVersion]);

  // Keep currentTrack in sync with currentTrackIndex and playlist
  useEffect(() => {
    if (currentTrackIndex !== null && playlistRef.current[currentTrackIndex]) {
      setCurrentTrack(playlistRef.current[currentTrackIndex]);
    } else {
      setCurrentTrack(null);
    }
  }, [currentTrackIndex, plVersion]);

  const play = useCallback(() => {
    const pl = playlistRef.current;
    if (pl.length === 0) return;
    setIsPlaying(true);
    if (currentTrackIndex === null || currentTrackIndex >= pl.length) {
      setCurrentTrackIndex(0);
    }
  }, [currentTrackIndex]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, []);

  const stop = useCallback(() => {
    setIsPlaying(false);
    setCurrentTrackIndex(null);
  }, []);

  const playNext = useCallback(() => {
    const pl = playlistRef.current;
    if (pl.length === 0 || currentTrackIndex === null) return;

    if (currentTrackIndex < pl.length - 1) {
      setCurrentTrackIndex(currentTrackIndex + 1);
      setIsPlaying(true);
    } else {
      stop(); // Reached end
    }
  }, [currentTrackIndex, stop]);

  const playPrev = useCallback(() => {
    const pl = playlistRef.current;
    if (pl.length === 0 || currentTrackIndex === null) return;

    if (currentTrackIndex > 0) {
      setCurrentTrackIndex(currentTrackIndex - 1);
      setIsPlaying(true);
    }
  }, [currentTrackIndex]);

  const playTrack = useCallback((idx: number) => {
    const pl = playlistRef.current;
    if (idx >= 0 && idx < pl.length) {
      setCurrentTrackIndex(idx);
      setIsPlaying(true);
    }
  }, []);

  // Effect: handle play/pause state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (
      isPlaying &&
      currentTrackIndex !== null &&
      playlistRef.current[currentTrackIndex]
    ) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying, currentTrackIndex, playlistRef]);

  const appendToQueue = useCallback((items: Track[] | Track) => {
    const toAdd = Array.isArray(items) ? items : [items];
    const nextPlaylist = [...playlistRef.current, ...toAdd];
    playlistRef.current = nextPlaylist;
    setPlaylist(nextPlaylist);
    setPlVersion((v) => v + 1);
  }, []);

  // Effect: change audio src when track or playlist changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (currentTrackIndex !== null && playlistRef.current[currentTrackIndex]) {
      const track = playlistRef.current[currentTrackIndex];
      const newSrc = `/api/audio?filename=${encodeURIComponent(track.local_audio_url ?? "")}`;

      if (audio.src !== newSrc) {
        audio.src = newSrc;
      }

      if (isPlaying) {
        audio.play().catch(() => {});
      }
    } else {
      audio.pause();
      audio.src = "";
    }
  }, [currentTrackIndex, playlistRef, isPlaying]);

  // Effect: auto-play next when current track ends
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      playNext();
    };

    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("ended", handleEnded);
    };
  }, [playNext]);

  const audioElement = <audio ref={audioRef} preload="auto" controls />;

  return {
    isPlaying,
    currentTrackIndex,
    currentTrack,
    play,
    pause,
    playNext,
    playPrev,
    playTrack,
    replacePlaylist, // new
    appendToQueue,   // new
    playlist,
    audioElement,
  };
}

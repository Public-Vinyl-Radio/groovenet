import { useRef, useState, useCallback, useEffect } from "react";
import { AudioEngine } from "@/lib/audio/audioEngine";

export interface DeckStatus {
  isPlaying: boolean;
  volume: number;
  playbackRate: number;
  currentTime: number;
  duration: number;
  isLoaded: boolean;
}

export function useAudioEngine() {
  const engineRef = useRef<AudioEngine | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);

  const [deckA, setDeckA] = useState<DeckStatus>({
    isPlaying: false,
    volume: 0.8,
    playbackRate: 1.0,
    currentTime: 0,
    duration: 0,
    isLoaded: false,
  });

  const [deckB, setDeckB] = useState<DeckStatus>({
    isPlaying: false,
    volume: 0.8,
    playbackRate: 1.0,
    currentTime: 0,
    duration: 0,
    isLoaded: false,
  });

  const [crossfade, setCrossfadeValue] = useState(0.5);

  // Initialize engine
  useEffect(() => {
    engineRef.current = new AudioEngine();

    // Set initial volumes
    engineRef.current.setVolume("A", 0.8);
    engineRef.current.setVolume("B", 0.8);
    engineRef.current.setCrossfade(0.5);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      engineRef.current?.destroy();
    };
  }, []);

  // Update current time for playing decks (throttled to reduce re-renders)
  const lastUpdateRef = useRef(0);
  const updateTime = useCallback(() => {
    if (!engineRef.current) return;

    const now = performance.now();
    // Only update every 100ms instead of every frame (60fps -> 10fps)
    if (now - lastUpdateRef.current < 100) {
      animationFrameRef.current = requestAnimationFrame(updateTime);
      return;
    }
    lastUpdateRef.current = now;

    // Batch state updates
    const timeA = engineRef.current.getCurrentTime("A");
    const timeB = engineRef.current.getCurrentTime("B");

    setDeckA((prev) => (prev.currentTime !== timeA ? { ...prev, currentTime: timeA } : prev));

    setDeckB((prev) => (prev.currentTime !== timeB ? { ...prev, currentTime: timeB } : prev));

    animationFrameRef.current = requestAnimationFrame(updateTime);
  }, []);

  useEffect(() => {
    if (deckA.isPlaying || deckB.isPlaying) {
      updateTime();
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [deckA.isPlaying, deckB.isPlaying, updateTime]);

  const loadTrack = useCallback(async (deck: "A" | "B", audioUrl: string) => {
    if (!engineRef.current) return;

    try {
      await engineRef.current.loadTrack(deck, audioUrl);
      const duration = engineRef.current.getDuration(deck);

      const setter = deck === "A" ? setDeckA : setDeckB;
      setter((prev) => ({
        ...prev,
        duration,
        isLoaded: true,
        currentTime: 0,
      }));
    } catch (error) {
      console.error(`Failed to load track for deck ${deck}:`, error);
    }
  }, []);

  const play = useCallback((deck: "A" | "B") => {
    engineRef.current?.play(deck);
    const setter = deck === "A" ? setDeckA : setDeckB;
    setter((prev) => ({ ...prev, isPlaying: true }));
  }, []);

  const pause = useCallback((deck: "A" | "B") => {
    engineRef.current?.pause(deck);
    const setter = deck === "A" ? setDeckA : setDeckB;
    setter((prev) => ({ ...prev, isPlaying: false }));
  }, []);

  const stop = useCallback((deck: "A" | "B") => {
    engineRef.current?.stop(deck);
    const setter = deck === "A" ? setDeckA : setDeckB;
    setter((prev) => ({ ...prev, isPlaying: false, currentTime: 0 }));
  }, []);

  const setVolume = useCallback((deck: "A" | "B", volume: number) => {
    engineRef.current?.setVolume(deck, volume);
    const setter = deck === "A" ? setDeckA : setDeckB;
    setter((prev) => ({ ...prev, volume }));
  }, []);

  const setCrossfade = useCallback((position: number) => {
    engineRef.current?.setCrossfade(position);
    setCrossfadeValue(position);
  }, []);

  const setPlaybackRate = useCallback((deck: "A" | "B", rate: number) => {
    engineRef.current?.setPlaybackRate(deck, rate);
    const setter = deck === "A" ? setDeckA : setDeckB;
    setter((prev) => ({ ...prev, playbackRate: rate }));
  }, []);

  const seek = useCallback((deck: "A" | "B", time: number) => {
    engineRef.current?.seek(deck, time);
    const setter = deck === "A" ? setDeckA : setDeckB;
    setter((prev) => ({ ...prev, currentTime: time }));
  }, []);

  return {
    deckA,
    deckB,
    crossfade,
    loadTrack,
    play,
    pause,
    stop,
    setVolume,
    setCrossfade,
    setPlaybackRate,
    seek,
  };
}

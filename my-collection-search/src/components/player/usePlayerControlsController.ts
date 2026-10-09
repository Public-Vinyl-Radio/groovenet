"use client";

import { useMemo, useCallback } from "react";
import type { IconType } from "react-icons";
import { FiVolume2, FiVolume1, FiVolumeX } from "react-icons/fi";
import { usePlaylistPlayer } from "@/providers/PlaylistPlayerProvider";
import { toaster } from "@/components/ui/toaster";

export function usePlayerControlsController() {
  const {
    isPlaying,
    currentTrackIndex,
    currentTrack,
    finishedTrack,
    seek,
    play: browserPlay,
    pause: browserPause,
    playNext,
    playPrev,
    clearQueue,
    restoreQueue,
    playlist,
    volume,
    setVolume,
    isAirPlayAvailable,
    isAirPlayActive,
    showAirPlayPicker,
  } = usePlaylistPlayer();

  const isQueueFinished = currentTrackIndex === null && finishedTrack !== null;
  const displayTrack = currentTrack ?? finishedTrack;

  const safeLen = playlist.length;
  const safeIndex = currentTrackIndex;
  const canPrev = safeIndex !== null && safeIndex > 0;
  const canNext = safeIndex !== null && safeIndex < safeLen - 1;

  const VolumeIcon = useMemo<IconType>(() => {
    if (volume === 0) return FiVolumeX;
    if (volume < 0.5) return FiVolume1;
    return FiVolume2;
  }, [volume]);

  const handlePlay = useCallback(() => {
    browserPlay();
  }, [browserPlay]);

  const handlePause = useCallback(() => {
    browserPause();
  }, [browserPause]);

  const handleSeek = useCallback(
    async (time: number) => {
      seek(time);
    },
    [seek]
  );

  const handleAirPlayClick = useCallback(() => {
    const opened = showAirPlayPicker();
    if (!opened) {
      toaster.create({
        title: "AirPlay picker unavailable",
        description: "Safari did not expose AirPlay for this media session.",
        type: "warning",
      });
    }
  }, [showAirPlayPicker]);

  const handleClosePlayer = useCallback(async () => {
    browserPause();
    clearQueue();
  }, [browserPause, clearQueue]);

  const handleDismissPlayer = useCallback(() => {
    const snapshot = {
      playlist: playlist.slice(),
      currentTrackIndex,
      isPlaying,
      finishedTrack,
    };
    browserPause();
    clearQueue();
    toaster.create({
      title: "Queue cleared",
      type: "info",
      action: {
        label: "Undo",
        onClick: () => restoreQueue(snapshot),
      },
    });
  }, [
    playlist,
    currentTrackIndex,
    isPlaying,
    finishedTrack,
    browserPause,
    clearQueue,
    restoreQueue,
  ]);

  return {
    isPlaying,
    currentTrack: displayTrack,
    isQueueFinished,
    playlist,
    volume,
    setVolume,
    isAirPlayAvailable,
    isAirPlayActive,
    playNext,
    playPrev,
    safeLen,
    canPrev,
    canNext,
    VolumeIcon,
    handlePlay,
    handlePause,
    handleSeek,
    handleAirPlayClick,
    handleClosePlayer,
    handleDismissPlayer,
  };
}

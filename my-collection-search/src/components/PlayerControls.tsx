"use client";

import PlayerControlsView from "@/components/player/PlayerControlsView";
import { usePlayerControlsController } from "@/components/player/usePlayerControlsController";

interface PlayerControlsProps {
  /** Whether to show the queue button */
  showQueueButton?: boolean;
  /** Queue button click handler */
  onQueueToggle?: () => void;
  /** Whether queue is open (for button highlighting) */
  isQueueOpen?: boolean;
  /** Compact mode for drawer display */
  compact?: boolean;
  /** Whether to show volume controls */
  showVolumeControls?: boolean;
}

export default function PlayerControls({
  showQueueButton = true,
  onQueueToggle,
  isQueueOpen = false,
  compact = false,
  showVolumeControls = true,
}: PlayerControlsProps) {
  const {
    isPlaying,
    currentTrack,
    isQueueFinished,
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
  } = usePlayerControlsController();

  return (
    <PlayerControlsView
      showQueueButton={showQueueButton}
      onQueueToggle={onQueueToggle}
      isQueueOpen={isQueueOpen}
      compact={compact}
      showVolumeControls={showVolumeControls}
      isPlaying={isPlaying}
      currentTrack={currentTrack}
      isQueueFinished={isQueueFinished}
      safeLen={safeLen}
      canPrev={canPrev}
      canNext={canNext}
      playPrev={playPrev}
      playNext={playNext}
      volume={volume}
      setVolume={setVolume}
      VolumeIcon={VolumeIcon}
      isAirPlayAvailable={isAirPlayAvailable}
      isAirPlayActive={isAirPlayActive}
      onAirPlayClick={handleAirPlayClick}
      onPlay={handlePlay}
      onPause={handlePause}
      onSeek={handleSeek}
      onClosePlayer={handleClosePlayer}
      onDismissPlayer={handleDismissPlayer}
    />
  );
}

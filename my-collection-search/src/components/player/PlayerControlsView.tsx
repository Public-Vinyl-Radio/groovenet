"use client";

import React from "react";
import {
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Text,
  VStack,
  Slider,
  Icon,
} from "@chakra-ui/react";
import {
  FiPause,
  FiPlay,
  FiSkipBack,
  FiSkipForward,
  FiList,
  FiCast,
  FiX,
} from "react-icons/fi";
import type { IconType } from "react-icons";
import type { Track } from "@/types/track";
import ProgressSlider from "@/components/player/ProgressSlider";
import Artwork from "@/components/player/Artwork";
import ArtistLink from "@/components/ArtistLink";
import AlbumLink from "@/components/AlbumLink";

interface PlayerControlsViewProps {
  showQueueButton: boolean;
  onQueueToggle?: () => void;
  isQueueOpen: boolean;
  compact: boolean;
  showVolumeControls: boolean;
  isPlaying: boolean;
  currentTrack: Track | null;
  safeLen: number;
  canPrev: boolean;
  canNext: boolean;
  playPrev: () => void;
  playNext: () => void;
  volume: number;
  setVolume: (value: number) => void;
  VolumeIcon: IconType;
  isAirPlayAvailable: boolean;
  isAirPlayActive: boolean;
  onAirPlayClick: () => void;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => Promise<void>;
  onClosePlayer: () => void;
  onDismissPlayer?: () => void;
  isQueueFinished?: boolean;
}

export default function PlayerControlsView({
  showQueueButton,
  onQueueToggle,
  isQueueOpen,
  compact,
  showVolumeControls,
  isPlaying,
  currentTrack,
  safeLen,
  canPrev,
  canNext,
  playPrev,
  playNext,
  volume,
  setVolume,
  VolumeIcon,
  isAirPlayAvailable,
  isAirPlayActive,
  onAirPlayClick,
  onPlay,
  onPause,
  onSeek,
  onClosePlayer,
  onDismissPlayer,
  isQueueFinished = false,
}: PlayerControlsViewProps) {
  const currentArtwork =
    currentTrack?.audio_file_album_art_url || currentTrack?.album_thumbnail;

  const primaryText = isQueueFinished
    ? "Queue finished"
    : currentTrack
      ? currentTrack.title
      : "No track playing";

  const secondaryText = isQueueFinished
    ? currentTrack
      ? `${currentTrack.title} — ${currentTrack.artist}`
      : "—"
    : currentTrack
      ? currentTrack.artist
      : "—";

  if (compact) {
    return (
      <Box
        role={onQueueToggle ? "button" : undefined}
        tabIndex={onQueueToggle ? 0 : undefined}
        aria-label={onQueueToggle ? "Open player queue" : undefined}
        cursor={onQueueToggle ? "pointer" : "default"}
        onClick={onQueueToggle}
        onKeyDown={(event) => {
          if (!onQueueToggle) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onQueueToggle();
          }
        }}
      >
        <Flex align="center" gap={2.5} minH="42px">
          <AlbumLink
            releaseId={currentTrack?.release_id}
            friendId={currentTrack?.friend_id}
          >
            <Artwork
              src={currentArtwork}
              alt={
                currentTrack
                  ? `${currentTrack.artist} - ${currentTrack.title}`
                  : "Artwork"
              }
              size="36px"
            />
          </AlbumLink>

          <VStack align="start" gap={0} flex="1" minW={0}>
            <Text
              fontWeight="semibold"
              fontSize="xs"
              lineClamp={1}
              maxW="100%"
            >
              {primaryText}
            </Text>
            <Text color="fg.muted" fontSize="11px" lineClamp={1} maxW="100%">
              {secondaryText}
            </Text>
          </VStack>

          <HStack gap={1.5}>
            {isPlaying ? (
              <IconButton
                aria-label="Pause"
                size="sm"
                minW="36px"
                h="36px"
                borderRadius="full"
                variant="solid"
                colorPalette="gray"
                onClick={(event) => {
                  event.stopPropagation();
                  onPause();
                }}
              >
                <FiPause />
              </IconButton>
            ) : (
              <IconButton
                aria-label="Play"
                size="sm"
                minW="36px"
                h="36px"
                borderRadius="full"
                variant="solid"
                colorPalette="gray"
                onClick={(event) => {
                  event.stopPropagation();
                  onPlay();
                }}
                disabled={safeLen === 0}
              >
                <FiPlay />
              </IconButton>
            )}

            <IconButton
              aria-label="Next"
              size="sm"
              minW="36px"
              h="36px"
              borderRadius="full"
              variant="ghost"
              color="fg.muted"
              onClick={(event) => {
                event.stopPropagation();
                playNext();
              }}
              disabled={!canNext}
            >
              <FiSkipForward />
            </IconButton>

            <IconButton
              aria-label="Close player"
              size="sm"
              minW="44px"
              h="44px"
              borderRadius="full"
              variant="ghost"
              color="fg.muted"
              onClick={(event) => {
                event.stopPropagation();
                (onDismissPlayer ?? onClosePlayer)();
              }}
            >
              <FiX />
            </IconButton>
          </HStack>
        </Flex>
      </Box>
    );
  }

  return (
    <Box>
      <ProgressSlider seek={onSeek} />

      <Flex
        align="center"
        gap={{ base: 3, md: 4 }}
        justify="space-between"
        minH="64px"
      >
        <HStack minW={0} gap={3} flex="1">
          <AlbumLink
            releaseId={currentTrack?.release_id}
            friendId={currentTrack?.friend_id}
          >
            <Artwork
              src={currentArtwork}
              alt={
                currentTrack
                  ? `${currentTrack.artist} - ${currentTrack.title}`
                  : "Artwork"
              }
              size={compact ? "40px" : "48px"}
            />
          </AlbumLink>
          <VStack
            align="start"
            minW={0}
            display={{ base: "none", md: "flex" }}
          >
            <Text
              fontWeight="semibold"
              fontSize={{ base: "sm", md: "md" }}
              maxW="40vw"
              lineClamp={1}
              title={primaryText}
            >
              {primaryText}
            </Text>
            <Text color="fg.muted" fontSize="xs" maxW="40vw" lineClamp={1} title={secondaryText}>
              {!isQueueFinished && currentTrack ? (
                <ArtistLink
                  artist={currentTrack.artist}
                  friendId={currentTrack.friend_id}
                >
                  {currentTrack.artist}
                </ArtistLink>
              ) : (
                secondaryText
              )}
            </Text>
          </VStack>
        </HStack>

        <HStack gap={{ base: 1, md: 2 }}>
          <IconButton
            aria-label="Previous"
            size="sm"
            variant="ghost"
            onClick={playPrev}
            disabled={!canPrev}
          >
            <FiSkipBack />
          </IconButton>

          {isPlaying ? (
            <Button
              aria-label="Pause"
              size="sm"
              variant="solid"
              colorScheme="red"
              onClick={onPause}
            >
              <FiPause />
            </Button>
          ) : (
            <Button
              aria-label="Play"
              size="sm"
              variant="solid"
              colorScheme="green"
              onClick={onPlay}
              disabled={safeLen === 0}
            >
              <FiPlay />
            </Button>
          )}

          <IconButton
            aria-label="Next"
            size="sm"
            variant="ghost"
            onClick={playNext}
            disabled={!canNext}
          >
            <FiSkipForward />
          </IconButton>
        </HStack>

        <HStack gap={1} justify="flex-end" flex="1">
          {showVolumeControls && (
            <Box display={{ base: "none", md: "block" }}>
              <HStack align="center" gap={3}>
                <Icon
                  aria-label={volume === 0 ? "Unmute" : "Mute"}
                  size="sm"
                  onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
                  cursor="pointer"
                >
                  <VolumeIcon />
                </Icon>
                <Slider.Root
                  width="200px"
                  value={[volume * 100]}
                  onValueChange={(e) => {
                    setVolume(e.value[0] / 100);
                  }}
                >
                  <Slider.Control>
                    <Slider.Track>
                      <Slider.Range />
                    </Slider.Track>
                    <Slider.Thumbs rounded="l1" />
                  </Slider.Control>
                </Slider.Root>
              </HStack>
            </Box>
          )}

          {isAirPlayAvailable && (
            <IconButton
              aria-label="AirPlay"
              size="sm"
              variant={isAirPlayActive ? "solid" : "ghost"}
              colorPalette={isAirPlayActive ? "blue" : undefined}
              title="AirPlay"
              onClick={onAirPlayClick}
            >
              <FiCast />
            </IconButton>
          )}

          {showQueueButton && onQueueToggle && (
            <IconButton
              aria-label="Queue"
              size="sm"
              variant="ghost"
              title="Queue"
              onClick={onQueueToggle}
              colorPalette={isQueueOpen ? "blue" : undefined}
            >
              <FiList />
            </IconButton>
          )}

          <IconButton
            aria-label="Close player"
            size="sm"
            variant="ghost"
            title="Close player"
            onClick={onClosePlayer}
          >
            <FiX />
          </IconButton>
        </HStack>
      </Flex>
    </Box>
  );
}

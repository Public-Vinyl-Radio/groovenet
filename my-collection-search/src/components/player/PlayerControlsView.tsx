"use client";

import React from "react";
import { Box, chakra, Flex, Grid, Text, VStack } from "@chakra-ui/react";
import { FiCast, FiList } from "react-icons/fi";
import type { IconType } from "react-icons";
import type { Track } from "@/types/track";
import ProgressSlider from "@/components/player/ProgressSlider";
import Artwork from "@/components/player/Artwork";
import ArtistLink from "@/components/ArtistLink";
import AlbumLink from "@/components/AlbumLink";
import MiniProgressLine from "@/components/player/MiniProgressLine";
import RetroSlider from "@/components/player/RetroSlider";
import { OutputButton } from "@/components/player/PlaybackOutput";
import { BareTransportButton, SquarePlayButton, TransportStrip } from "@/components/player/TransportControls";
import { artworkAlt, artworkOf, trackMetaLine } from "@/components/player/trackMeta";

interface PlayerControlsViewProps {
  showQueueButton: boolean;
  /** Mini player: opens Now playing. Desktop bar: toggles the queue panel. */
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
  isQueueFinished?: boolean;
}

const BarButton = chakra("button", {
  base: {
    w: "40px",
    h: "40px",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "fg",
    cursor: "pointer",
    _hover: { bg: "bg.muted" },
  },
});

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
  isQueueFinished = false,
}: PlayerControlsViewProps) {
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

  const transport = {
    isPlaying,
    canPrev,
    canNext,
    canPlay: safeLen > 0,
    onPrev: playPrev,
    onPlay,
    onPause,
    onNext: playNext,
  };

  if (compact) {
    // The mini player (phones): progress line, then art + text (opens Now
    // playing), the square play key and next. Stop and clear live in the queue.
    return (
      <Box>
        <MiniProgressLine />
        <Flex
          align="center"
          gap="12px"
          h="68px"
          pl="max(12px, env(safe-area-inset-left, 0px))"
          pr="max(12px, env(safe-area-inset-right, 0px))"
        >
          <chakra.button
            aria-label={onQueueToggle ? "Open now playing" : undefined}
            onClick={onQueueToggle}
            disabled={!onQueueToggle}
            flex="1"
            minW={0}
            h="56px"
            display="flex"
            alignItems="center"
            gap="12px"
            textAlign="left"
            cursor={onQueueToggle ? "pointer" : "default"}
          >
            <Artwork src={artworkOf(currentTrack)} alt={artworkAlt(currentTrack)} size="48px" />
            <VStack align="start" gap={0} flex="1" minW={0}>
              <Text fontWeight="semibold" fontSize="14px" lineHeight="20px" lineClamp={1} maxW="100%">
                {primaryText}
              </Text>
              <Text color="fg.muted" fontSize="12px" lineHeight="16px" lineClamp={1} maxW="100%">
                {secondaryText}
              </Text>
            </VStack>
          </chakra.button>
          <SquarePlayButton {...transport} />
          <BareTransportButton kind="next" onClick={playNext} disabled={!canNext} />
        </Flex>
      </Box>
    );
  }

  const meta = isQueueFinished ? "" : trackMetaLine(currentTrack);

  // The docked desktop bar: track | transport + seek | output, volume, queue.
  return (
    <Grid
      templateColumns={{
        base: "minmax(0, 1fr) minmax(260px, 2fr) minmax(0, 1fr)",
        xl: "minmax(0, 1fr) minmax(0, 560px) minmax(0, 1fr)",
      }}
      alignItems="center"
      gap={{ base: 4, lg: 6 }}
      h="100%"
    >
      <Flex align="center" gap="12px" minW={0}>
        <AlbumLink releaseId={currentTrack?.release_id} friendId={currentTrack?.friend_id}>
          <Artwork src={artworkOf(currentTrack)} alt={artworkAlt(currentTrack)} size="60px" />
        </AlbumLink>
        <VStack align="start" gap={0} minW={0}>
          <Text fontWeight="semibold" fontSize="15px" lineHeight="20px" maxW="100%" lineClamp={1} title={primaryText}>
            {primaryText}
          </Text>
          <Text
            color="fg.muted"
            fontSize="13px"
            lineHeight="18px"
            maxW="100%"
            lineClamp={1}
            title={secondaryText}
            // Chakra's Link is inline-flex, which defeats the parent's line clamp.
            css={{ "& > a": { display: "inline" } }}
          >
            {!isQueueFinished && currentTrack ? (
              <ArtistLink artist={currentTrack.artist} friendId={currentTrack.friend_id}>
                {currentTrack.artist}
              </ArtistLink>
            ) : (
              secondaryText
            )}
          </Text>
          {meta && (
            <Text fontFamily="mono" fontSize="11px" lineHeight="15px" color="fg.muted" lineClamp={1} maxW="100%">
              {meta}
            </Text>
          )}
        </VStack>
      </Flex>

      <VStack gap="8px" minW={0}>
        <TransportStrip size="md" {...transport} />
        <Box w="100%" maxW="560px">
          <ProgressSlider seek={onSeek} layout="inline" />
        </Box>
      </VStack>

      <Flex align="center" justify="flex-end" gap="10px" minW={0}>
        <OutputButton />
        {isAirPlayAvailable && (
          <BarButton
            aria-label="AirPlay"
            title="AirPlay"
            aria-pressed={isAirPlayActive}
            onClick={onAirPlayClick}
            bg={isAirPlayActive ? "bg.muted" : undefined}
          >
            <FiCast size={18} />
          </BarButton>
        )}
        {showVolumeControls && (
          <>
            <BarButton aria-label={volume === 0 ? "Unmute" : "Mute"} onClick={() => setVolume(volume === 0 ? 0.8 : 0)}>
              <VolumeIcon size={18} />
            </BarButton>
            <Box display={{ base: "none", lg: "block" }} w="96px" flexShrink={0}>
              <RetroSlider
                label="Volume"
                value={Math.round(volume * 100)}
                valueText={`${Math.round(volume * 100)}%`}
                thumbH="18px"
                onChange={(v) => setVolume(v / 100)}
              />
            </Box>
          </>
        )}
        {showQueueButton && onQueueToggle && (
          <BarButton
            aria-label="Queue"
            title="Queue"
            aria-pressed={isQueueOpen}
            onClick={onQueueToggle}
            borderWidth="outline"
            borderColor="border.ink"
            bg={isQueueOpen ? "border.ink" : "bg"}
            color={isQueueOpen ? "bg" : "fg"}
            _hover={{ bg: isQueueOpen ? "border.ink" : "bg.muted" }}
          >
            <FiList size={18} />
          </BarButton>
        )}
      </Flex>
    </Grid>
  );
}

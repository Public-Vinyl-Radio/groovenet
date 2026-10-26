"use client";

import React from "react";
import { Box, Button, chakra, Drawer, Flex, Heading, Text, useBreakpointValue } from "@chakra-ui/react";
import { FiCast, FiChevronDown, FiSave, FiTrash2, FiX } from "react-icons/fi";
import { LuListMusic } from "react-icons/lu";
import { usePlaylistPlayer, usePlaylistPlayerTime } from "@/providers/PlaylistPlayerProvider";
import { useQueueSaveDialog } from "@/hooks/useQueueSaveDialog";
import { useRootFlag } from "@/hooks/useRootFlag";
import { usePlayerControlsController } from "@/components/player/usePlayerControlsController";
import Artwork from "@/components/player/Artwork";
import ProgressSlider from "@/components/player/ProgressSlider";
import MiniProgressLine from "@/components/player/MiniProgressLine";
import RetroSlider from "@/components/player/RetroSlider";
import QueueList from "@/components/player/QueueList";
import { PlayOnRow } from "@/components/player/PlaybackOutput";
import { CompactTransport, TransportStrip, type TransportProps } from "@/components/player/TransportControls";
import { artworkAlt, artworkOf, queueSummary, trackMetaLine } from "@/components/player/trackMeta";
import { formatSeconds } from "@/lib/trackUtils";

interface QueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onQueueToggle: () => void;
  isQueueOpen: boolean;
}

type MobileView = "player" | "queue";

const HeaderKey = chakra("button", {
  base: {
    w: "44px",
    h: "44px",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "fg",
    cursor: "pointer",
    _hover: { bg: "bg.muted" },
    _disabled: { opacity: 0.4, cursor: "not-allowed" },
  },
});

function useQueueModel() {
  const { playlist, currentTrack, currentTrackIndex, moveTrackInQueue, removeFromQueue, playTrack, volume, setVolume } =
    usePlaylistPlayer();
  const c = usePlayerControlsController();
  const transport: TransportProps = {
    isPlaying: c.isPlaying,
    canPrev: c.canPrev,
    canNext: c.canNext,
    canPlay: c.safeLen > 0,
    onPrev: c.playPrev,
    onPlay: c.handlePlay,
    onPause: c.handlePause,
    onNext: c.playNext,
  };
  return {
    playlist,
    currentTrack,
    currentTrackIndex,
    volume,
    setVolume,
    transport,
    controller: c,
    list: { playlist, currentTrackIndex, moveTrack: moveTrackInQueue, removeTrack: removeFromQueue, playTrack },
  };
}

/** `0:45 / 4:02` beside the queue's compact transport. */
function ElapsedOfTotal() {
  const { currentTime, duration } = usePlaylistPlayerTime();
  return (
    <Text flex="1" fontFamily="mono" fontSize="12px" color="fg.muted" fontVariantNumeric="tabular-nums">
      {formatSeconds(currentTime)} / {formatSeconds(duration)}
    </Text>
  );
}

function QueueTitle({ summary }: { summary: string }) {
  return (
    <Box flex="1" minW={0}>
      <Heading as="h2" m={0} fontSize="18px" lineHeight="24px" fontWeight="semibold">
        Queue
      </Heading>
      <Text fontFamily="mono" fontSize="11px" color="fg.muted">
        {summary}
      </Text>
    </Box>
  );
}

export default function QueueDrawer({ isOpen, onClose }: QueueDrawerProps) {
  const isMobile = useBreakpointValue({ base: true, md: false }) ?? true;
  const model = useQueueModel();
  const { Dialog: SaveDialog, open: openSaveDialog } = useQueueSaveDialog();
  const [mobileView, setMobileView] = React.useState<MobileView>("player");

  // Feeds --queue-w, which the shell's content padding makes room for.
  useRootFlag("data-queue-panel", isOpen && !isMobile);

  React.useEffect(() => {
    if (isOpen) setMobileView("player");
  }, [isOpen]);

  const summary = queueSummary(model.playlist);
  const empty = model.playlist.length === 0;
  // Clear, then close: the player hides with an empty queue, and Undo brings it back closed.
  const clear = () => {
    model.controller.handleClearQueue();
    onClose();
  };

  if (!isMobile) {
    if (!isOpen) return <SaveDialog />;
    return (
      <>
        <chakra.aside
          aria-label="Queue"
          data-testid="queue-panel"
          position="fixed"
          top={0}
          right={0}
          bottom="var(--player-h)"
          w="var(--queue-w)"
          zIndex={99}
          display="flex"
          flexDirection="column"
          bg="bg"
          borderLeftWidth="outline"
          borderColor="border.ink"
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
          }}
        >
          <Flex h="64px" flexShrink={0} align="center" gap="8px" pl="16px" pr="8px" borderBottomWidth="outline" borderColor="border.ink">
            <QueueTitle summary={summary} />
            <Button size="sm" variant="outline" onClick={openSaveDialog} disabled={empty}>
              <FiSave />
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={clear} disabled={empty}>
              Clear
            </Button>
            <HeaderKey aria-label="Close queue" onClick={onClose} w="40px" h="40px">
              <FiX size={18} />
            </HeaderKey>
          </Flex>
          <Box flex="1" minH={0} overflowY="auto">
            <QueueList {...model.list} />
          </Box>
        </chakra.aside>
        <SaveDialog />
      </>
    );
  }

  const track = model.currentTrack;
  const upNextCount =
    model.currentTrackIndex === null ? model.playlist.length : model.playlist.length - model.currentTrackIndex - 1;

  return (
    <>
      <Drawer.Root open={isOpen} onOpenChange={({ open }) => !open && onClose()} placement="bottom" size="full">
        <Drawer.Positioner>
          <Drawer.Content
            display="flex"
            flexDirection="column"
            height="100%"
            bg="bg"
            color="fg"
            overflow="hidden"
            borderWidth={0}
            borderRadius={0}
            boxShadow="none"
            // Solid ground under the status bar and home indicator.
            pt="var(--safe-top)"
            pb="var(--safe-bottom)"
          >
            {mobileView === "player" ? (
              <>
                <Flex as="header" h="52px" flexShrink={0} align="center" px="4px" gap="4px">
                  <HeaderKey aria-label="Minimize player" onClick={onClose}>
                    <FiChevronDown size={22} />
                  </HeaderKey>
                  <Drawer.Title flex="1" textAlign="center" fontFamily="mono" fontSize="12px" letterSpacing="0.08em" fontWeight="semibold" color="fg.muted">
                    NOW PLAYING
                  </Drawer.Title>
                  <HeaderKey aria-label={`Open queue, ${upNextCount} up next`} onClick={() => setMobileView("queue")}>
                    <LuListMusic size={20} />
                  </HeaderKey>
                </Flex>
                <Flex flex="1" minH={0} overflowY="auto" direction="column" gap="18px" px="24px" pt="8px" pb="16px">
                  <Box alignSelf="center" w="min(calc(100% - 6px), 340px)" flexShrink={0}>
                    <Artwork src={artworkOf(track)} alt={artworkAlt(track)} fill shadow />
                  </Box>
                  <Box>
                    <Text as="h2" fontSize="22px" lineHeight="28px" fontWeight="semibold" lineClamp={2}>
                      {track?.title ?? "No track playing"}
                    </Text>
                    <Text fontSize="16px" lineHeight="22px" color="fg.muted" lineClamp={1}>
                      {track?.artist ?? "—"}
                    </Text>
                    {trackMetaLine(track) && (
                      <Text mt="4px" fontFamily="mono" fontSize="12px" lineHeight="16px" color="fg.muted">
                        {trackMetaLine(track)}
                      </Text>
                    )}
                  </Box>
                  <ProgressSlider seek={model.controller.handleSeek} layout="stacked" />
                  <TransportStrip size="lg" {...model.transport} />
                  <Flex align="center" gap="12px">
                    <Text w="40px" flexShrink={0} fontFamily="mono" fontSize="11px" letterSpacing="0.06em" fontWeight="semibold" color="fg.muted">
                      VOL
                    </Text>
                    <RetroSlider
                      label="Volume"
                      value={Math.round(model.volume * 100)}
                      valueText={`${Math.round(model.volume * 100)}%`}
                      onChange={(v) => model.setVolume(v / 100)}
                    />
                  </Flex>
                  <Flex gap="8px">
                    <Box flex="1" minW={0}>
                      <PlayOnRow />
                    </Box>
                    {model.controller.isAirPlayAvailable && (
                      <HeaderKey
                        aria-label="AirPlay"
                        aria-pressed={model.controller.isAirPlayActive}
                        onClick={model.controller.handleAirPlayClick}
                        h="48px"
                        w="48px"
                        borderWidth="outline"
                        borderColor="border.ink"
                      >
                        <FiCast size={18} />
                      </HeaderKey>
                    )}
                  </Flex>
                </Flex>
              </>
            ) : (
              <>
                <Flex as="header" h="56px" flexShrink={0} align="center" gap="4px" px="4px" borderBottomWidth="outline" borderColor="border.ink">
                  <HeaderKey aria-label="Back to now playing" onClick={() => setMobileView("player")}>
                    <FiChevronDown size={22} />
                  </HeaderKey>
                  <Box flex="1" minW={0}>
                    <Drawer.Title m={0} fontSize="18px" lineHeight="24px" fontWeight="semibold">
                      Queue
                    </Drawer.Title>
                    <Text fontFamily="mono" fontSize="11px" color="fg.muted">
                      {summary}
                    </Text>
                  </Box>
                  <Button size="sm" variant="outline" h="44px" onClick={openSaveDialog} disabled={empty}>
                    <FiSave />
                    Save
                  </Button>
                  <HeaderKey aria-label="Clear queue" onClick={clear} disabled={empty}>
                    <FiTrash2 size={18} />
                  </HeaderKey>
                </Flex>
                <Box flex="1" minH={0} overflowY="auto">
                  <QueueList {...model.list} />
                </Box>
                <Box flexShrink={0} borderTopWidth="outline" borderColor="border.ink">
                  <MiniProgressLine />
                  <Flex h="64px" align="center" gap="10px" px="12px">
                    <ElapsedOfTotal />
                    <CompactTransport {...model.transport} />
                  </Flex>
                </Box>
              </>
            )}
          </Drawer.Content>
        </Drawer.Positioner>
      </Drawer.Root>
      <SaveDialog />
    </>
  );
}

// components/PlaylistPlayer.tsx
"use client";

import React from "react";
import { useOptionalPlaybackTarget } from "@/providers/PlaybackTargetProvider";
import PlayOnPicker from "@/components/player/PlayOnPicker";
import ServerNotice, { useServerNotice } from "@/components/player/ServerNotice";
import { Box, useBreakpointValue } from "@chakra-ui/react";
import { usePathname } from "next/navigation";
import PlayerControls from "@/components/PlayerControls";
import QueueDrawer from "@/components/QueueDrawer";
import { useQueueDrawer } from "@/hooks/useQueueDrawer";
import { useRootFlag } from "@/hooks/useRootFlag";
import { usePlaylistPlayer } from "@/providers/PlaylistPlayerProvider";

function isMobileFullscreenEditRoute(pathname: string) {
  return (
    (pathname.startsWith("/tracks/") || pathname.startsWith("/albums/")) &&
    pathname.endsWith("/edit")
  );
}

export const PlayerContainer: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <Box
      data-testid="floating-player"
      as="section"
      aria-label="Player"
      position="fixed"
      // Mobile: an edge-to-edge strip sitting on the tab bar (which owns the
      // safe-area inset). Desktop: docked full width at the bottom, under the
      // sidebar and the queue panel. Both are --player-h tall, rule included.
      bottom={{ base: "var(--tabbar-h)", md: 0 }}
      left={0}
      right={0}
      zIndex={100}
      h="var(--player-h)"
      boxSizing="border-box"
      overflow="hidden"
      borderTopWidth="outline"
      borderColor="border.ink"
      boxShadow="none"
      bg="bg"
      // No side padding on mobile: the progress line runs edge to edge and the
      // row insets itself (PlayerControlsView).
      px={{ base: 0, md: 5 }}
    >
      {children}
    </Box>
  );
};


const PlaylistPlayer: React.FC = () => {
  const target = useOptionalPlaybackTarget();
  const { isOpen, toggle } = useQueueDrawer();
  const { playlistLength } = usePlaylistPlayer();
  const isMobile = useBreakpointValue({ base: true, md: false }) ?? true;
  const pathname = usePathname();
  const currentPath = pathname ? pathname.split("?")[0] : "";
  const hideForMobileEdit = isMobile && isMobileFullscreenEditRoute(currentPath);

  // A music server keeps its player in view even with an empty queue: it is
  // where audio plays, and where its status and errors show.
  const serverMode = target !== null && target.target !== "";
  const visible = (serverMode || playlistLength > 0) && !hideForMobileEdit;
  const notice = useServerNotice();
  useRootFlag("data-player", visible);

  return (
    <>
      {/* One stable position, so the picker survives the player appearing or hiding under it. */}
      {target && <PlayOnPicker />}
      {visible && <VisiblePlayer notice={notice} isOpen={isOpen} isMobile={isMobile} toggle={toggle} />}
    </>
  );
};

function VisiblePlayer({ notice, isOpen, isMobile, toggle }: { notice: ReturnType<typeof useServerNotice>; isOpen: boolean; isMobile: boolean; toggle: () => void }) {
  return (
    <>
      {/* On phones Now playing covers the screen (and shows the notice itself); the desktop bar stays under the queue panel. */}
      {notice && !(isOpen && isMobile) && (
        <Box
          position="fixed"
          zIndex={100}
          left={{ base: "8px", md: "auto" }}
          right={{ base: "8px", md: "calc(var(--queue-w) + 16px)" }}
          bottom="calc(var(--chrome-bottom) + 14px)"
          w={{ base: "auto", md: "420px" }}
          boxShadow="md"
        >
          <ServerNotice notice={notice} />
        </Box>
      )}
      {!(isOpen && isMobile) && (
        <PlayerContainer>
          <PlayerControls
            showQueueButton={true}
            onQueueToggle={toggle}
            isQueueOpen={isOpen}
            compact={isMobile}
            showVolumeControls={!isMobile}
          />
        </PlayerContainer>
      )}

      {/* Now playing + queue (phones), the queue panel (desktop) */}
      <QueueDrawer
        isOpen={isOpen}
        onClose={() => toggle()}
        onQueueToggle={toggle}
        isQueueOpen={isOpen}
      />
    </>
  );
}

export default PlaylistPlayer;

// components/PlaylistPlayer.tsx
"use client";

import React from "react";
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
      position="fixed"
      // Mobile: an edge-to-edge strip sitting on the tab bar (which owns the
      // safe-area inset), 70px tall = --player-h. Desktop: the floating card.
      bottom={{ base: "var(--tabbar-h)", md: 4 }}
      left={{ base: 0, md: "50%" }}
      transform={{ base: "none", md: "translateX(-50%)" }}
      zIndex={100}
      width={{ base: "100%", md: "calc(100% - 80px)" }}
      maxW={{ base: "none", md: "920px" }}
      overflow="hidden"
      borderWidth={{ base: "0", md: "outline" }}
      borderTopWidth="outline"
      borderColor="border.ink"
      boxShadow={{ base: "none", md: "md" }}
      bg="bg.panel"
      // No side padding on mobile: the progress line runs edge to edge and the
      // row insets itself (PlayerControlsView).
      px={{ base: 0, md: 5 }}
      py={{ base: 0, md: 3 }}
    >
      {children}
    </Box>
  );
};


const PlaylistPlayer: React.FC = () => {
  const { isOpen, toggle } = useQueueDrawer();
  const { playlistLength } = usePlaylistPlayer();
  const isMobile = useBreakpointValue({ base: true, md: false }) ?? true;
  const pathname = usePathname();
  const currentPath = pathname ? pathname.split("?")[0] : "";
  const hideForMobileEdit = isMobile && isMobileFullscreenEditRoute(currentPath);

  const visible = playlistLength > 0 && !hideForMobileEdit;
  // Feeds --player-h / --chrome-bottom (houseStyle globalCss).
  useRootFlag("data-player", visible);

  // Hide player if queue is empty
  if (!visible) {
    return null;
  }

  return (
    <>
      {/* Original Player - hide when queue drawer is open */}
      {!isOpen && (
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

      {/* Queue Drawer with embedded player */}
      <QueueDrawer
        isOpen={isOpen}
        onClose={() => toggle()}
        onQueueToggle={toggle}
        isQueueOpen={isOpen}
      />
    </>
  );
};

export default PlaylistPlayer;

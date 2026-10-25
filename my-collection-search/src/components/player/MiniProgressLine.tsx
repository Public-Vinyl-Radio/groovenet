"use client";

import React from "react";
import { Box } from "@chakra-ui/react";
import { usePlaylistPlayerTime } from "@/providers/PlaylistPlayerProvider";

/** The mini player's 4px accent progress line. Read-only: seeking lives in Now playing. */
export default function MiniProgressLine() {
  const { currentTime, duration } = usePlaylistPlayerTime();
  const pct = duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;

  return (
    <Box h="4px" bg="bg.emphasized" aria-hidden>
      <Box data-testid="mini-progress" h="100%" bg="accent.solid" style={{ width: `${pct}%` }} />
    </Box>
  );
}

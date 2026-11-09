"use client";

import React from "react";
import { IconButton } from "@chakra-ui/react";
import { FiSearch } from "react-icons/fi";
import { headerTarget } from "@/app/houseStyle";
import { useOptionalCommandPalette } from "@/providers/CommandPaletteProvider";
import { analytics } from "@/lib/analytics/client";

/**
 * The phone header's way into the command palette (#1145): one tap from any
 * page, opening with that page's scope. Without a palette provider it renders
 * nothing.
 */
export default function PaletteSearchButton() {
  const palette = useOptionalCommandPalette();
  if (!palette) return null;
  return (
    <IconButton
      aria-label="Search"
      variant="ghost"
      boxSize={headerTarget}
      minW={headerTarget}
      onClick={() => {
        analytics.track("command_palette_used", {
          command: "open_from_header",
          scope: palette.scope?.id ?? "global",
        });
        palette.setPaletteOpen(true);
      }}
    >
      <FiSearch />
    </IconButton>
  );
}

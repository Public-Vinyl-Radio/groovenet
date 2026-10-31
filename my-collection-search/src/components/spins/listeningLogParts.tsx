"use client";

import React from "react";
import { Badge, Box, Image } from "@chakra-ui/react";
import { FiDisc } from "react-icons/fi";
import type { ListeningSessionMedium } from "./spinSummary";

/** "6 SPINS", "1 RECORD". */
export function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "S"}`;
}

export function mediumLabel(medium: ListeningSessionMedium): string {
  return medium.toUpperCase();
}

/** VINYL is a solid ink tag and DIGITAL an outlined one, so they differ without colour. */
export function SpinMediumChip({ medium }: { medium: "vinyl" | "digital" }) {
  return (
    <Badge
      size="xs"
      colorPalette="neutral"
      variant={medium === "vinyl" ? "solid" : "outline"}
      borderWidth="outline"
      borderColor="border.ink"
      flexShrink={0}
    >
      {mediumLabel(medium)}
    </Badge>
  );
}

/** Square album art; a missing or broken image gets a disc. */
export function SpinArt({ src, stacked = false }: { src: string | null; stacked?: boolean }) {
  // Discogs art links expire; a broken one gets the same disc as a missing one.
  const [failed, setFailed] = React.useState(false);
  return (
    <Box
      aria-hidden="true"
      boxSize={{ base: "48px", md: "52px" }}
      flexShrink={0}
      borderWidth="outline"
      borderColor="border.ink"
      boxShadow={stacked ? "sm" : undefined}
      overflow="hidden"
      bg="bg.muted"
      display="flex"
      alignItems="center"
      justifyContent="center"
      color="fg.muted"
    >
      {src && !failed ? (
        <Image
          src={src}
          alt=""
          width="100%"
          height="100%"
          objectFit="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <FiDisc size={20} />
      )}
    </Box>
  );
}

"use client";

import React from "react";
import { Box, Image, type BoxProps } from "@chakra-ui/react";
import { SourceTag } from "@/components/ui/RoleTags";
import { FiDisc } from "react-icons/fi";
import type { ListeningSessionMedium } from "./spinSummary";

/** "6 SPINS", "1 RECORD". */
export function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "S"}`;
}

export function mediumLabel(medium: ListeningSessionMedium): string {
  return medium.toUpperCase();
}

/** Vinyl is an ink-filled source tag and Digital an outlined one, so they differ without colour. */
export function SpinMediumChip({ medium }: { medium: "vinyl" | "digital" }) {
  return (
    <SourceTag size="xs" stroke={medium === "vinyl" ? "fill" : "solid"} flexShrink={0}>
      {medium === "vinyl" ? "Vinyl" : "Digital"}
    </SourceTag>
  );
}

type SpinArtProps = {
  src: string | null;
  /** A record group: the art carries a shadow, like a stack of sleeves. */
  stacked?: boolean;
  /** Overrides the row size, 48px on phones and 52px above. */
  boxSize?: BoxProps["boxSize"];
  /** On an ink strip: the outline takes the ground colour. */
  inverse?: boolean;
};

/** Square album art; a missing or broken image gets a disc. */
export function SpinArt({ src, stacked = false, boxSize, inverse = false }: SpinArtProps) {
  // Discogs art links expire; a broken one gets the same disc as a missing one.
  const [failed, setFailed] = React.useState(false);
  return (
    <Box
      aria-hidden="true"
      boxSize={boxSize ?? { base: "48px", md: "52px" }}
      flexShrink={0}
      borderWidth="outline"
      borderRadius="md"
      borderColor={inverse ? "bg" : "border.ink"}
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

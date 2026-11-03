"use client";

import Cover from "@/components/Cover";
import React from "react";
import { type BoxProps } from "@chakra-ui/react";
import { SourceTag } from "@/components/ui/RoleTags";
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

/** Shared cover treatment for a listening-log record group. */
export function SpinArt({ src, stacked = false, boxSize, inverse = false }: SpinArtProps) {
  return (
    <Cover
      src={src}
      alt=""
      size={boxSize ?? { base: "48px", md: "52px" }}
      stacked={stacked}
      inverse={inverse}
      aria-hidden="true"
    />
  );
}

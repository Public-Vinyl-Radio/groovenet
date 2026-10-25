"use client";

import React from "react";
import { SegmentGroup } from "@chakra-ui/react";
import type { TrackSearchMode } from "@/api-contract/schemas";

export const SEARCH_MODE_ITEMS: { value: TrackSearchMode; label: string }[] = [
  { value: "lexical", label: "Keyword" },
  { value: "hybrid", label: "Hybrid" },
  { value: "semantic", label: "Semantic" },
];

export const SEARCH_MODE_PLACEHOLDERS: Record<TrackSearchMode, string> = {
  lexical: "Search",
  hybrid: "Search, or describe a sound",
  semantic: "Describe a sound, e.g. dusty 70s cumbia with brass",
};

export function isTrackSearchMode(value: string | null | undefined): value is TrackSearchMode {
  return SEARCH_MODE_ITEMS.some((item) => item.value === value);
}

// Segments fill the 44px group: the selection indicator is sized from the active
// segment, so a shorter segment leaves a gap under the ink fill.
const TOUCH_TARGET_CSS = { "& label": { flex: 1, justifyContent: "center", height: "100%" } };

type SearchModeToggleProps = {
  value: TrackSearchMode;
  onChange: (mode: TrackSearchMode) => void;
  size?: "xs" | "sm" | "md";
  /** A 44px-tall group that fills its row, for phones. */
  touchTarget?: boolean;
};

/** Keyword (full-text) vs. natural-language search over context embeddings (#409). */
export default function SearchModeToggle({ value, onChange, size = "sm", touchTarget = false }: SearchModeToggleProps) {
  return (
    <SegmentGroup.Root
      size={size}
      value={value}
      aria-label="Search mode"
      {...(touchTarget ? { h: "44px", flex: 1, css: TOUCH_TARGET_CSS } : {})}
      // Only ITEMS can be chosen, and a segment group can't be cleared.
      onValueChange={(details) => onChange(details.value as TrackSearchMode)}
    >
      <SegmentGroup.Indicator />
      <SegmentGroup.Items items={SEARCH_MODE_ITEMS} />
    </SegmentGroup.Root>
  );
}

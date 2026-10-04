"use client";

import React from "react";
import { SegmentGroup } from "@chakra-ui/react";
import type { TrackSearchMode } from "@/api-contract/schemas";

const ITEMS: { value: TrackSearchMode; label: string }[] = [
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
  return ITEMS.some((item) => item.value === value);
}

type SearchModeToggleProps = {
  value: TrackSearchMode;
  onChange: (mode: TrackSearchMode) => void;
  size?: "xs" | "sm" | "md";
};

/** Keyword (full-text) vs. natural-language search over context embeddings (#409). */
export default function SearchModeToggle({ value, onChange, size = "sm" }: SearchModeToggleProps) {
  return (
    <SegmentGroup.Root
      size={size}
      value={value}
      aria-label="Search mode"
      // Only ITEMS can be chosen, and a segment group can't be cleared.
      onValueChange={(details) => onChange(details.value as TrackSearchMode)}
    >
      <SegmentGroup.Indicator />
      <SegmentGroup.Items items={ITEMS} />
    </SegmentGroup.Root>
  );
}

"use client";

import React from "react";
import { SegmentGroup } from "@chakra-ui/react";
import type { RecommendationScope } from "@/types/recommendations";

const ITEMS: { value: RecommendationScope; label: string }[] = [
  { value: "library", label: "This library" },
  { value: "all", label: "All libraries" },
];

type Props = {
  value: RecommendationScope;
  onChange: (scope: RecommendationScope) => void;
  size?: "xs" | "sm" | "md";
};

/** Where a suggestions view looks. It starts from the library's saved setting; on phones it fills the row in two equal segments. */
export default function SuggestionScopeToggle({ value, onChange, size = "xs" }: Props) {
  return (
    <SegmentGroup.Root
      size={size}
      value={value}
      aria-label="Suggestion scope"
      // Phones: the toggle spans the row with two equal 44px segments.
      css={{
        "@media (max-width: 47.99em)": {
          width: "100%",
          "& [data-part='item']": { flex: 1, minHeight: "44px", justifyContent: "center" },
        },
      }}
      // Only ITEMS can be chosen, and a segment group can't be cleared.
      onValueChange={(details) => onChange(details.value as RecommendationScope)}
    >
      <SegmentGroup.Indicator />
      <SegmentGroup.Items items={ITEMS} />
    </SegmentGroup.Root>
  );
}

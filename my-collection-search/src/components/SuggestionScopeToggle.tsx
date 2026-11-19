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
  /** `end` pushes it to the right end of its row (the summary line); `start` in a form. */
  align?: "start" | "end";
};

/**
 * Where a suggestions view looks. It starts from the library's saved setting.
 * It sizes to its content at every width and sits at the right end of the chip
 * row (#1214): the lightest control there, not the heaviest. On phones each
 * segment keeps a 44px hit area through an invisible extension, as the card
 * menus do, not through its drawn size.
 */
export default function SuggestionScopeToggle({
  value,
  onChange,
  size = "xs",
  align = "end",
}: Props) {
  return (
    <SegmentGroup.Root
      size={size}
      value={value}
      aria-label="Suggestion scope"
      data-testid="suggestion-scope-toggle"
      flexShrink={0}
      ms={align === "end" ? "auto" : 0}
      alignSelf={align === "end" ? undefined : "flex-start"}
      css={{
        "@media (max-width: 47.99em)": {
          "& [data-part='item']": {
            position: "relative",
            "&::before": { content: '""', position: "absolute", inset: "-10px 0" },
          },
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

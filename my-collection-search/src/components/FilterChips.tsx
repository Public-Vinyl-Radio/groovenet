"use client";

import React from "react";
import { Box, Flex, Button, type FlexProps } from "@chakra-ui/react";
import { LuX } from "react-icons/lu";

export interface FilterChip {
  key: string;
  label: string;
  active: boolean;
  /** Results the filter matches, shown in the label ("Missing audio · 41"). Omit where unknown. */
  count?: number;
}

interface FilterChipsProps {
  chips: FilterChip[];
  onToggle: (key: string) => void;
  onClearAll?: () => void;
  /**
   * Controls shown above the chips, as one or more `FilterGroup`s: the genre
   * filter with its toggle, then Missing and BPM / Key. Desktop only: phones
   * reach them through the filter sheet.
   */
  leading?: React.ReactNode;
  /** Space above the row, which goes with it when it's hidden. */
  mt?: FlexProps["mt"];
}

/** The chip's text: its label, then the count when the data has one. */
export function chipLabel({ label, count }: Pick<FilterChip, "label" | "count">): string {
  return count === undefined ? label : `${label} · ${count.toLocaleString()}`;
}

/** Controls that belong together; the gap between groups is wider than inside one. */
export function FilterGroup({ children }: { children: React.ReactNode }) {
  return (
    <Flex gap={2} alignItems="center" data-testid="filter-group">
      {children}
    </Flex>
  );
}

export default function FilterChips({ chips, onToggle, onClearAll, leading, mt }: FilterChipsProps) {
  const anyActive = chips.some((c) => c.active);

  return (
    <Box
      mt={mt}
      // On phones there are only chips, so with none it takes no space.
      display={{ base: chips.length > 0 ? "block" : "none", md: "block" }}
    >
      {leading && (
        <Flex
          data-testid="filter-controls"
          columnGap={6}
          rowGap={2}
          flexWrap="wrap"
          alignItems="center"
          display={{ base: "none", md: "flex" }}
        >
          {leading}
        </Flex>
      )}
      {/*
        The active filters get their own line, so the controls above keep one height
        with or without filters. With controls it holds its height empty, so the result
        count below doesn't jump when the first chip appears.
      */}
      <Flex
        data-testid="filter-chips"
        gap={2}
        flexWrap="wrap"
        alignItems="center"
        mt={leading ? { md: 2 } : undefined}
        minH={leading ? { md: "24px" } : undefined}
      >
        {chips.map((chip) => (
          <Button
            key={chip.key}
            size="xs"
            variant={chip.active ? "solid" : "outline"}
            colorPalette="neutral"
            onClick={() => onToggle(chip.key)}
            px={3}
            minH={{ base: "44px", md: undefined }}
          >
            {chipLabel(chip)}
            {chip.active && <LuX />}
          </Button>
        ))}
        {anyActive && onClearAll && (
          <Button size="xs" variant="ghost" onClick={onClearAll} color="fg.muted" minH={{ base: "44px", md: undefined }}>
            Clear all
          </Button>
        )}
      </Flex>
    </Box>
  );
}

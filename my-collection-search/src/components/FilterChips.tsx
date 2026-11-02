"use client";

import React from "react";
import { Box, Flex, Text, chakra, type FlexProps } from "@chakra-ui/react";
import { filterChipText } from "@/app/houseStyle";
import { FilterChip as Chip, chipLabel } from "@/components/ui/FilterChip";

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
  /** The result count ("81 albums"), in mono: right-aligned on the chip line from `md` up, its own line on phones. */
  summary?: React.ReactNode;
  /** False where the page shows its count elsewhere on phones (Albums, beside the sort). */
  summaryOnPhones?: boolean;
  /** Space above the row, which goes with it when it's hidden. */
  mt?: FlexProps["mt"];
}

export { chipLabel };

export default function FilterChips({
  chips,
  onToggle,
  onClearAll,
  summary,
  summaryOnPhones = true,
  mt,
}: FilterChipsProps) {
  const anyActive = chips.some((c) => c.active);
  const hasChips = chips.length > 0;
  const phoneSummary = summary !== undefined && summaryOnPhones;

  return (
    <Box
      mt={mt}
      // On phones there are only chips and the count, so with neither it takes no space.
      display={{ base: hasChips || phoneSummary ? "block" : "none", md: "block" }}
    >
      {/*
        The chip line: active filters, Clear all, and the result count at the
        right end. It holds its height empty from `md` up, so the results below
        don't jump when the first chip appears.
      */}
      <Flex
        data-testid="filter-row"
        direction={{ base: "column", md: "row" }}
        alignItems={{ base: "stretch", md: "center" }}
        gap={{ base: 2, md: 3 }}
        minH={{ md: "32px" }}
      >
        <Flex
          data-testid="filter-chips"
          gap={2}
          flex="1"
          minW={0}
          // Phones keep one line that scrolls sideways; md+ wraps.
          flexWrap={{ base: "nowrap", md: "wrap" }}
          overflowX={{ base: "auto", md: "visible" }}
          display={{ base: hasChips ? "flex" : "none", md: "flex" }}
          alignItems="center"
          css={{ scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}
        >
          {chips.map((chip) => (
            <Chip
              key={chip.key}
              label={chip.label}
              count={chip.count}
              active={chip.active}
              onClick={() => onToggle(chip.key)}
            />
          ))}
          {anyActive && onClearAll && (
            <chakra.button
              type="button"
              onClick={onClearAll}
              flexShrink={0}
              minH={{ base: "44px", md: "32px" }}
              px={2}
              color="fg.muted"
              textDecoration="underline"
              textUnderlineOffset="3px"
              _hover={{ color: "fg" }}
              {...filterChipText}
            >
              Clear all
            </chakra.button>
          )}
        </Flex>
        {summary !== undefined && (
          <Text
            data-testid="filter-summary"
            display={{ base: phoneSummary ? "block" : "none", md: "block" }}
            fontFamily="mono"
            fontSize="12px"
            color="fg.muted"
            flexShrink={0}
            ml={{ md: "auto" }}
          >
            {summary}
          </Text>
        )}
      </Flex>
    </Box>
  );
}

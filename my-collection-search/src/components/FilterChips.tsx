"use client";

import React from "react";
import { Box, Flex, Text, chakra, type FlexProps } from "@chakra-ui/react";
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
  /** The result count ("81 albums"), in mono: right-aligned on the chip line from `md` up, its own line on phones. */
  summary?: React.ReactNode;
  /** False where the page shows its count elsewhere on phones (Albums, beside the sort). */
  summaryOnPhones?: boolean;
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

const chipText = {
  fontFamily: "label",
  fontSize: "12px",
  fontWeight: "semibold",
  letterSpacing: "0.04em",
} as const;

/**
 * One filter as a chip (#794): an active filter is a surface-filled chip with
 * an ink outline and an x that removes it; an inactive one is a quiet outline
 * that turns it on. The same chip on phones and desktop.
 */
function Chip({ chip, onToggle }: { chip: FilterChip; onToggle: (key: string) => void }) {
  const text = chipLabel(chip);
  return (
    <chakra.button
      type="button"
      onClick={() => onToggle(chip.key)}
      aria-label={chip.active ? `Remove filter ${text}` : undefined}
      aria-pressed={chip.active ? undefined : false}
      title={text}
      display="inline-flex"
      alignItems="center"
      gap="6px"
      flexShrink={0}
      // 44px touch target on phones, the 32px chip from `md` up.
      minH={{ base: "44px", md: "32px" }}
      pl="10px"
      pr={chip.active ? "6px" : "10px"}
      borderWidth="outline"
      borderColor={chip.active ? "border.ink" : "border"}
      bg={chip.active ? "bg.subtle" : "transparent"}
      color="fg"
      textTransform="uppercase"
      maxW="280px"
      _hover={{ bg: "bg.muted" }}
      {...chipText}
    >
      <Text as="span" truncate>
        {text}
      </Text>
      {chip.active && <LuX aria-hidden="true" size={14} strokeWidth={2.5} />}
    </chakra.button>
  );
}

export default function FilterChips({
  chips,
  onToggle,
  onClearAll,
  leading,
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
      {leading && (
        <Flex
          data-testid="filter-controls"
          columnGap={6}
          rowGap={2}
          flexWrap="wrap"
          alignItems="center"
          display={{ base: "none", md: "flex" }}
          mb={2}
        >
          {leading}
        </Flex>
      )}
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
            <Chip key={chip.key} chip={chip} onToggle={onToggle} />
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
              {...chipText}
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

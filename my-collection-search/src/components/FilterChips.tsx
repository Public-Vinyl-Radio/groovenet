"use client";

import React from "react";
import { Flex, Button, type FlexProps } from "@chakra-ui/react";
import { LuX } from "react-icons/lu";

export interface FilterChip {
  key: string;
  label: string;
  active: boolean;
}

interface FilterChipsProps {
  chips: FilterChip[];
  onToggle: (key: string) => void;
  onClearAll?: () => void;
  /**
   * Controls shown before the chips, such as the genre filter. Desktop only:
   * phones reach them through the filter sheet.
   */
  leading?: React.ReactNode;
  /** Space above the row, which goes with it when it's hidden. */
  mt?: FlexProps["mt"];
}

export default function FilterChips({ chips, onToggle, onClearAll, leading, mt }: FilterChipsProps) {
  const anyActive = chips.some((c) => c.active);

  return (
    <Flex
      gap={2}
      flexWrap="wrap"
      alignItems="center"
      mt={mt}
      // On phones the row holds only chips, so with none it takes no space.
      display={{ base: chips.length > 0 ? "flex" : "none", md: "flex" }}
    >
      {leading && (
        <Flex gap={2} flexWrap="wrap" alignItems="center" display={{ base: "none", md: "flex" }}>
          {leading}
        </Flex>
      )}
      {chips.map((chip) => (
        <Button
          key={chip.key}
          size="sm"
          variant={chip.active ? "solid" : "outline"}
          colorPalette={chip.active ? "blue" : "gray"}
          onClick={() => onToggle(chip.key)}
          borderRadius="full"
          px={3}
        >
          {chip.label}
          {chip.active && <LuX />}
        </Button>
      ))}
      {anyActive && onClearAll && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onClearAll}
          borderRadius="full"
          color="fg.muted"
        >
          Clear all
        </Button>
      )}
    </Flex>
  );
}

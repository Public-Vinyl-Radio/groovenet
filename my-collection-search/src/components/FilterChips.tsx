"use client";

import React from "react";
import { Flex, Button } from "@chakra-ui/react";
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
  /** A control shown before the chips, such as the genre filter. */
  leading?: React.ReactNode;
}

export default function FilterChips({ chips, onToggle, onClearAll, leading }: FilterChipsProps) {
  const anyActive = chips.some((c) => c.active);

  return (
    <Flex
      gap={2}
      flexWrap="nowrap"
      overflowX="auto"
      alignItems="center"
      pb={1}
      className="hide-scrollbar"
    >
      {leading}
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

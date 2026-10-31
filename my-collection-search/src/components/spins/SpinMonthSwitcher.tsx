"use client";

import React from "react";
import { Flex, IconButton, Text } from "@chakra-ui/react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { formatMonthLabel, shiftMonth } from "./spinMonth";

type Props = {
  month: string;
  /** The latest month there can be spins in (this month); next stops here. */
  latest: string;
  onChange: (month: string) => void;
  /** "OCT 2026" on phones instead of "OCTOBER 2026". */
  short?: boolean;
};

/** Previous / month / next, as one outlined strip on desktop. */
export default function SpinMonthSwitcher({ month, latest, onChange, short = false }: Props) {
  const atLatest = month >= latest;
  return (
    <Flex
      align="center"
      gap={short ? 1 : 0}
      borderWidth={short ? 0 : "outline"}
      borderColor="border.ink"
      data-testid={short ? "month-switcher-short" : "month-switcher"}
    >
      <IconButton
        aria-label="Previous month"
        variant="ghost"
        boxSize="44px"
        minW="44px"
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <FiChevronLeft />
      </IconButton>
      <Text
        aria-live="polite"
        h="44px"
        px={short ? 0 : 3.5}
        display="flex"
        alignItems="center"
        borderInlineWidth={short ? 0 : "outline"}
        borderColor="border.ink"
        fontFamily="mono"
        fontSize={short ? "xs" : "13px"}
        fontWeight="semibold"
        letterSpacing="0.08em"
        whiteSpace="nowrap"
      >
        {formatMonthLabel(month, short)}
      </Text>
      <IconButton
        aria-label="Next month"
        variant="ghost"
        boxSize="44px"
        minW="44px"
        disabled={atLatest}
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <FiChevronRight />
      </IconButton>
    </Flex>
  );
}

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
  /** Adds " · SO FAR" while `month` is the latest. */
  soFar?: boolean;
  /** Full width with a frame on phones (the recap page), the usual strip from `md`. */
  stretch?: boolean;
};

/** Previous / month / next, as one outlined strip on desktop. */
export default function SpinMonthSwitcher({
  month,
  latest,
  onChange,
  short = false,
  soFar = false,
  stretch = false,
}: Props) {
  const atLatest = month >= latest;
  const framed = !short || stretch;
  const keyWidth = stretch ? { base: "48px", md: "44px" } : "44px";
  return (
    <Flex
      align="center"
      gap={framed ? 0 : 1}
      w={stretch ? { base: "full", md: "auto" } : undefined}
      borderWidth={framed ? "outline" : 0}
      borderColor="border.ink"
      data-testid={short ? "month-switcher-short" : "month-switcher"}
    >
      <IconButton
        aria-label="Previous month"
        variant="ghost"
        h="44px"
        w={keyWidth}
        minW={keyWidth}
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <FiChevronLeft />
      </IconButton>
      <Text
        aria-live="polite"
        h="44px"
        px={framed ? 3.5 : 0}
        flex={stretch ? { base: 1, md: "initial" } : undefined}
        display="flex"
        alignItems="center"
        justifyContent="center"
        borderInlineWidth={framed ? "outline" : 0}
        borderColor="border.ink"
        fontFamily="mono"
        fontSize={short ? "xs" : "13px"}
        fontWeight="semibold"
        letterSpacing="0.08em"
        whiteSpace="nowrap"
      >
        {formatMonthLabel(month, short)}
        {soFar && atLatest ? " · SO FAR" : ""}
      </Text>
      <IconButton
        aria-label="Next month"
        variant="ghost"
        h="44px"
        w={keyWidth}
        minW={keyWidth}
        disabled={atLatest}
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <FiChevronRight />
      </IconButton>
    </Flex>
  );
}

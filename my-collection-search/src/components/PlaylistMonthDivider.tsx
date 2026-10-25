"use client";

import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import {
  formatGroupCount,
  type PlaylistMonthGroup,
} from "@/lib/playlistGroups";

/** Ink-filled mono month tab, 2px rule and the playlist/set count. */
export default function PlaylistMonthDivider({
  group,
}: {
  group: PlaylistMonthGroup;
}) {
  return (
    <Flex
      align="flex-end"
      gap={3}
      mb={3}
      borderBottomWidth="2px"
      borderColor="fg"
    >
      <Text
        as="h2"
        data-testid="month-tab"
        bg="fg"
        color="bg"
        fontFamily="mono"
        fontSize="xs"
        fontWeight="bold"
        letterSpacing="0.1em"
        px={3}
        py={1}
      >
        {group.label}
      </Text>
      <Text
        data-testid="month-count"
        ml="auto"
        pb={1}
        fontFamily="mono"
        fontSize="2xs"
        letterSpacing="0.06em"
        color="fg.muted"
        textTransform="uppercase"
        whiteSpace="nowrap"
      >
        {formatGroupCount(group)}
      </Text>
    </Flex>
  );
}

/** Phone row: day column and timeline rail beside the card. Desktop renders the card alone. */
export function TimelineRow({
  day,
  children,
}: {
  day: { day: string; weekday: string } | null;
  children: React.ReactNode;
}) {
  return (
    <Flex align="stretch" gap={{ base: 3, md: 0 }} position="relative">
      <Box
        data-testid="timeline-day"
        display={{ base: "flex", md: "none" }}
        flexDirection="column"
        alignItems="center"
        flexShrink={0}
        w="10"
        pt={3}
        fontFamily="mono"
        lineHeight="1.1"
        borderRightWidth="1px"
        borderColor="border"
        aria-hidden
      >
        {day && (
          <>
            <Text fontSize="md" fontWeight="bold">
              {day.day}
            </Text>
            <Text fontSize="2xs" letterSpacing="0.08em" color="fg.muted">
              {day.weekday}
            </Text>
          </>
        )}
      </Box>
      <Box flex="1" minW={0}>
        {children}
      </Box>
    </Flex>
  );
}

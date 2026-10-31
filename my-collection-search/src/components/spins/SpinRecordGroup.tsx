"use client";

import React from "react";
import { Box, Flex, HStack, Stack, Text, chakra } from "@chakra-ui/react";
import { FiChevronDown } from "react-icons/fi";
import { useDisplayTimeZone } from "@/providers/DisplayTimeZoneProvider";
import SpinTrackRow, { type SpinRowSelection } from "./SpinTrackRow";
import {
  formatPositionRange,
  formatTimeRange,
  type SpinRecordGroup as SpinRecordGroupData,
} from "./spinSummary";
import { countLabel, SpinArt, SpinMediumChip } from "./listeningLogParts";

type Props = SpinRowSelection & {
  group: SpinRecordGroupData;
  defaultExpanded?: boolean;
};

/** "A1–A3 · 3 TRACKS · 7:28 PM–7:38 PM". */
export function recordGroupMeta(group: SpinRecordGroupData, timeZone: string): string {
  const plays = group.plays;
  return [
    formatPositionRange(plays),
    countLabel(plays.length, "TRACK"),
    formatTimeRange(plays[plays.length - 1].playedAt, plays[0].playedAt, timeZone),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Consecutive spins from one record. A single spin is just its track row;
 * several collapse under the record, and the header expands them.
 */
export default function SpinRecordGroup({
  group,
  defaultExpanded = false,
  selectedKey,
  onSelect,
}: Props) {
  const timeZone = useDisplayTimeZone();
  const holdsSelection = group.plays.some((play) => play.key === selectedKey);
  const [expanded, setExpanded] = React.useState(defaultExpanded || holdsSelection);
  const listId = React.useId();

  // A selection that moves into the group (a link, or BEFORE / AFTER) opens it.
  React.useEffect(() => {
    if (holdsSelection) setExpanded(true);
  }, [holdsSelection]);

  if (group.plays.length === 1) {
    return <SpinTrackRow play={group.plays[0]} selectedKey={selectedKey} onSelect={onSelect} />;
  }

  const title = group.record ?? "Unknown record";
  const meta = recordGroupMeta(group, timeZone);

  return (
    <Box>
      <chakra.button
        type="button"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded((current) => !current)}
        w="full"
        minH={{ base: "72px", md: "auto" }}
        display="flex"
        alignItems="center"
        gap={{ base: 3, md: 3.5 }}
        py={{ base: 2, md: 2.5 }}
        pl={3}
        pr={{ base: 1, md: 3 }}
        textAlign="left"
        cursor="pointer"
        _hover={{ bg: "bg.muted" }}
      >
        <SpinArt src={group.thumbnail} stacked />
        <Stack gap={{ base: "3px", md: "2px" }} flex="1" minW={0}>
          <Text fontSize="15px" lineHeight="20px" fontWeight="semibold" truncate title={title}>
            {title}
          </Text>
          <Text fontSize="13px" lineHeight="18px" color="fg.muted" truncate>
            {group.artist}
            <Box as="span" display={{ base: "none", md: "inline" }}>
              {group.artist ? " · " : ""}
              <Box as="span" fontFamily="mono" fontSize="11px" letterSpacing="0.04em">
                {meta}
              </Box>
            </Box>
          </Text>
          <HStack gap={2} display={{ base: "flex", md: "none" }} minW={0}>
            <SpinMediumChip medium={group.medium} />
            <Text fontFamily="mono" fontSize="11px" color="fg.muted" truncate>
              {meta}
            </Text>
          </HStack>
        </Stack>
        <Box display={{ base: "none", md: "block" }}>
          <SpinMediumChip medium={group.medium} />
        </Box>
        <Flex
          w={{ base: "44px", md: "64px" }}
          h="44px"
          flexShrink={0}
          align="center"
          justify={{ base: "center", md: "flex-end" }}
        >
          <Box
            as="span"
            display="inline-flex"
            transform={expanded ? "rotate(180deg)" : undefined}
            aria-hidden="true"
          >
            <FiChevronDown size={18} />
          </Box>
        </Flex>
      </chakra.button>
      {expanded && (
        <Box
          as="ul"
          id={listId}
          listStyleType="none"
          ml={{ base: "72px", md: "78px" }}
          mr={{ base: 1, md: 3 }}
          mb={2.5}
          borderLeftWidth="outline"
          borderColor="border.ink"
        >
          {group.plays.map((play) => (
            <Box as="li" key={play.key}>
              <SpinTrackRow play={play} compact selectedKey={selectedKey} onSelect={onSelect} />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

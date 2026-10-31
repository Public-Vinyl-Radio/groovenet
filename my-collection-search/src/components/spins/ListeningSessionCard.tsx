"use client";

import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { useDisplayTimeZone } from "@/providers/DisplayTimeZoneProvider";
import SpinRecordGroup from "./SpinRecordGroup";
import type { SpinRowSelection } from "./SpinTrackRow";
import { formatTimeRange, type ListeningSession } from "./spinSummary";
import { countLabel, mediumLabel } from "./listeningLogParts";

/** "6 SPINS · 3 RECORDS · VINYL". */
export function listeningSessionMeta(session: ListeningSession): string {
  return [
    countLabel(session.plays.length, "SPIN"),
    countLabel(session.recordCount, "RECORD"),
    mediumLabel(session.medium),
  ].join(" · ");
}

/** A listening session: spins at most 20 minutes apart, as one outlined block. */
export default function ListeningSessionCard({
  session,
  selectedKey,
  onSelect,
}: SpinRowSelection & { session: ListeningSession }) {
  const timeZone = useDisplayTimeZone();
  const range = formatTimeRange(session.start, session.end, timeZone);

  return (
    <Box as="article" borderWidth="outline" borderColor="border.ink" boxShadow="md" bg="bg">
      <Flex
        as="header"
        direction={{ base: "column", md: "row" }}
        align={{ base: "start", md: "center" }}
        justify="space-between"
        gap={{ base: "2px", md: 3 }}
        minH={{ md: "36px" }}
        px={3}
        py={{ base: 2, md: 1.5 }}
        bg="bg.subtle"
        borderBottomWidth="outline"
        borderColor="border.ink"
        fontFamily="mono"
        fontSize="11px"
        letterSpacing={{ base: "0.06em", md: "0.08em" }}
      >
        <Text fontWeight="semibold">SESSION · {range}</Text>
        <Text color="fg.muted">{listeningSessionMeta(session)}</Text>
      </Flex>
      <Box as="ul" listStyleType="none">
        {session.records.map((group) => (
          <Box
            as="li"
            key={group.key}
            _notFirst={{ borderTopWidth: "rule", borderColor: "border" }}
          >
            <SpinRecordGroup group={group} selectedKey={selectedKey} onSelect={onSelect} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

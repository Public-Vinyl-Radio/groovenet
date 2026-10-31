"use client";

import React from "react";
import { Flex, HStack, Stack, Text } from "@chakra-ui/react";
import { useDisplayTimeZone } from "@/providers/DisplayTimeZoneProvider";
import SpinSessionActions from "./SpinSessionActions";
import { formatClockTime, formatTrackLine, type SpinPlay } from "./spinSummary";
import { SpinArt, SpinMediumChip } from "./listeningLogParts";

type Props = {
  play: SpinPlay;
  /** Inside an expanded record group: one line, no art, artist or chip. */
  compact?: boolean;
};

/** One spin in the listening log: `pos · title`, artist · record, the medium and the time. */
export default function SpinTrackRow({ play, compact = false }: Props) {
  const timeZone = useDisplayTimeZone();
  const label = formatTrackLine(play);
  const time = formatClockTime(play.playedAt, timeZone);
  const sub = [play.artist, play.record].filter(Boolean).join(" · ");

  if (compact) {
    return (
      <Flex minH="44px" align="center" gap={3} pl={3} minW={0} _hover={{ bg: "bg.muted" }}>
        <Text flex="1" minW={0} fontSize="sm" truncate title={label}>
          {label}
        </Text>
        <Text fontFamily="mono" fontSize={{ base: "11px", md: "xs" }} color="fg.muted">
          {time}
        </Text>
        <SpinSessionActions item={play.item} />
      </Flex>
    );
  }

  return (
    <Flex
      minH={{ base: "72px", md: "auto" }}
      align="center"
      gap={{ base: 3, md: 3.5 }}
      py={{ base: 2, md: 2.5 }}
      pl={3}
      pr={{ base: 1, md: 3 }}
      minW={0}
      _hover={{ bg: "bg.muted" }}
    >
      <SpinArt src={play.thumbnail} />
      <Stack gap={{ base: "3px", md: "2px" }} flex="1" minW={0}>
        <Text fontSize="15px" lineHeight="20px" fontWeight="semibold" truncate title={label}>
          {label}
        </Text>
        {sub && (
          <Text fontSize="13px" lineHeight="18px" color="fg.muted" truncate title={sub}>
            {sub}
          </Text>
        )}
        <HStack gap={2} display={{ base: "flex", md: "none" }}>
          <SpinMediumChip medium={play.medium} />
          <Text fontFamily="mono" fontSize="11px" color="fg.muted">
            {time}
          </Text>
        </HStack>
      </Stack>
      <HStack gap={3.5} display={{ base: "none", md: "flex" }} flexShrink={0}>
        <SpinMediumChip medium={play.medium} />
        <Text w="64px" textAlign="right" fontFamily="mono" fontSize="xs" color="fg.muted">
          {time}
        </Text>
      </HStack>
      <SpinSessionActions item={play.item} />
    </Flex>
  );
}

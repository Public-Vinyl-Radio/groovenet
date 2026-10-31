"use client";

import React from "react";
import { HStack, Stack, Text, chakra } from "@chakra-ui/react";
import { useDisplayTimeZone } from "@/providers/DisplayTimeZoneProvider";
import { formatClockTime, formatTrackLine, type SpinPlay } from "./spinSummary";
import { SpinArt, SpinMediumChip } from "./listeningLogParts";

export type SpinRowSelection = {
  /** The selected play's key, if any. */
  selectedKey?: string | null;
  /** Opens a play's detail. */
  onSelect?: (play: SpinPlay) => void;
};

type Props = SpinRowSelection & {
  play: SpinPlay;
  /** Inside an expanded record group: one line, no art, artist or chip. */
  compact?: boolean;
};

/** One spin in the listening log: `pos · title`, artist · record, the medium and the time. */
export default function SpinTrackRow({ play, compact = false, selectedKey, onSelect }: Props) {
  const timeZone = useDisplayTimeZone();
  const label = formatTrackLine(play);
  const time = formatClockTime(play.playedAt, timeZone);
  const sub = [play.artist, play.record].filter(Boolean).join(" · ");
  const selected = selectedKey === play.key;

  // A 2px outline is always drawn, so selecting a row doesn't shift its content.
  const rowProps = {
    type: "button" as const,
    "aria-current": selected ? ("true" as const) : undefined,
    onClick: () => onSelect?.(play),
    w: "full",
    display: "flex",
    alignItems: "center",
    minW: 0,
    textAlign: "left" as const,
    cursor: "pointer",
    borderWidth: "outline",
    borderColor: selected ? "border.ink" : "transparent",
    bg: selected ? "bg.subtle" : undefined,
    _hover: { bg: selected ? "bg.subtle" : "bg.muted" },
  };

  if (compact) {
    return (
      <chakra.button {...rowProps} minH="44px" gap={3} px={3}>
        <Text
          flex="1"
          minW={0}
          fontSize="sm"
          fontWeight={selected ? "semibold" : undefined}
          truncate
          title={label}
        >
          {label}
        </Text>
        <Text
          w={{ md: "64px" }}
          textAlign="right"
          fontFamily="mono"
          fontSize={{ base: "11px", md: "xs" }}
          color="fg.muted"
        >
          {time}
        </Text>
      </chakra.button>
    );
  }

  return (
    <chakra.button
      {...rowProps}
      minH={{ base: "72px", md: "auto" }}
      gap={{ base: 3, md: 3.5 }}
      py={{ base: 2, md: 2.5 }}
      pl={3}
      pr={3}
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
    </chakra.button>
  );
}

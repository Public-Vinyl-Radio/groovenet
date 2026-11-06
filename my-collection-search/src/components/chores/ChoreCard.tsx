"use client";

import React from "react";
import { Box, chakra, Flex, Text } from "@chakra-ui/react";
import Artwork from "@/components/player/Artwork";
import { StatusTag } from "@/components/ui/RoleTags";
import ShelfCode from "./ShelfCode";
import type { ChoreRowData } from "./ChoreGroup";

const CardButton = chakra("button");

function Tick({ checked }: { checked: boolean }) {
  return (
    <Flex
      as="span"
      aria-hidden="true"
      boxSize="24px"
      flexShrink={0}
      boxSizing="border-box"
      borderWidth="outline"
      borderRadius="md"
      borderColor="border.ink"
      bg={checked ? "fg" : "bg"}
      color="bg"
      align="center"
      justify="center"
    >
      {checked && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
        >
          <path d="M4 12l5 5 11-11" />
        </svg>
      )}
    </Flex>
  );
}

/**
 * One record of the pulled stack as a card: the shelf code large at the top, the
 * cover, title, artist and sleeve status. The whole card is the checkbox (an
 * overlay button), so the "No ID" link above it stays separately clickable.
 * The footer row has room at its end for a ⋯ menu (#1010).
 */
export default function ChoreCard({
  row,
  checked,
  onToggle,
}: {
  row: ChoreRowData;
  checked: boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <Box
      as="li"
      position="relative"
      display="flex"
      flexDirection="column"
      gap={2}
      p={3}
      minW={0}
      borderWidth="outline"
      borderRadius="md"
      borderColor="border.ink"
      boxShadow="sm"
      bg={checked ? "bg.subtle" : "bg"}
      _hover={{ bg: checked ? "bg.subtle" : "bg.muted" }}
    >
      <CardButton
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={[row.code ?? "No ID", row.title, row.artist].filter(Boolean).join(", ")}
        onClick={() => onToggle(row.key)}
        position="absolute"
        inset={0}
        zIndex={0}
        cursor="pointer"
        bg="transparent"
        borderRadius="md"
        _focusVisible={{ outline: "2px solid", outlineColor: "border.ink", outlineOffset: "2px" }}
      />
      <Flex align="center" justify="space-between" gap={2} minH="44px" pointerEvents="none">
        <ShelfCode code={row.code} editHref={row.editHref} title={row.title} size="card" />
        <Tick checked={checked} />
      </Flex>
      <Box pointerEvents="none">
        <Artwork src={row.thumbnail} alt="" fill />
      </Box>
      <Box minW={0} pointerEvents="none">
        <Text fontSize="15px" lineHeight="20px" fontWeight="semibold" lineClamp={2}>
          {row.title}
        </Text>
        <Text fontSize="13px" lineHeight="18px" color="fg.muted" truncate>
          {row.artist}
        </Text>
      </Box>
      <Flex align="center" justify="space-between" gap={2} minH="44px" pointerEvents="none">
        {row.sleeveUnknown ? (
          <StatusTag tone="neutral" flexShrink={0}>
            Sleeve unknown
          </StatusTag>
        ) : (
          <span />
        )}
        {/* #1010: the ⋯ menu goes here, with pointer-events back on. */}
      </Flex>
    </Box>
  );
}

"use client";

import React from "react";
import { Box, chakra, Flex, Heading, Spinner, Text, VisuallyHidden } from "@chakra-ui/react";
import Artwork from "@/components/player/Artwork";

export type ChoreRowData = {
  key: string;
  title: string;
  artist: string;
  thumbnail: string | null;
  /** "SPUN 3× IN OCT", "ADDED OCT 17"; the backlog has none. */
  meta?: string;
  /** No sleeve logged: the row shows the "SLEEVE ?" chip. */
  sleeveUnknown: boolean;
};

const RowButton = chakra("button");
const HeaderButton = chakra("button");

const monoLabel = {
  fontFamily: "mono",
  fontWeight: "semibold",
  letterSpacing: "0.06em",
} as const;

function SleeveChip() {
  return (
    <Text
      as="span"
      h="22px"
      px="7px"
      display="inline-flex"
      alignItems="center"
      flexShrink={0}
      borderWidth="outline"
      borderStyle="dashed"
      borderColor="border"
      fontFamily="mono"
      fontSize="10px"
      letterSpacing="0.08em"
      color="fg.muted"
    >
      <span aria-hidden="true">SLEEVE ?</span>
      <VisuallyHidden>Sleeve unknown</VisuallyHidden>
    </Text>
  );
}

function Tick({ checked }: { checked: boolean }) {
  return (
    <Flex
      as="span"
      aria-hidden="true"
      gridArea="check"
      boxSize="22px"
      flexShrink={0}
      boxSizing="border-box"
      borderWidth="outline"
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

/** One record as a checkbox: tick, cover, title and artist, meta, sleeve chip. */
export function ChoreRow({
  row,
  checked,
  onToggle,
}: {
  row: ChoreRowData;
  checked: boolean;
  onToggle: (key: string) => void;
}) {
  const hasExtras = !!row.meta || row.sleeveUnknown;
  return (
    <Box as="li" borderTopWidth="rule" borderColor="border" _first={{ borderTopWidth: 0 }}>
      <RowButton
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onToggle(row.key)}
        w="full"
        minH="64px"
        px={3}
        py={2}
        display="grid"
        alignItems="center"
        columnGap={{ base: 3, md: "14px" }}
        rowGap="2px"
        gridTemplateColumns={{
          base: "22px 44px minmax(0, 1fr)",
          md: "22px 44px minmax(0, 1fr) auto",
        }}
        gridTemplateAreas={{
          base: hasExtras
            ? `"check cover title" "check cover artist" "check cover meta"`
            : `"check cover title" "check cover artist"`,
          md: `"check cover title meta" "check cover artist meta"`,
        }}
        bg={checked ? "bg.subtle" : "transparent"}
        color="fg"
        textAlign="left"
        cursor="pointer"
        _hover={{ bg: checked ? "bg.subtle" : "bg.muted" }}
      >
        <Tick checked={checked} />
        <Box
          gridArea="cover"
          boxSize="44px"
          borderWidth="outline"
          borderColor="border.ink"
          overflow="hidden"
          alignSelf="center"
        >
          <Artwork src={row.thumbnail} alt="" size="40px" />
        </Box>
        <Text
          as="span"
          gridArea="title"
          alignSelf="end"
          fontSize="15px"
          lineHeight="20px"
          fontWeight="semibold"
          truncate
        >
          {row.title}
        </Text>
        <Text
          as="span"
          gridArea="artist"
          alignSelf="start"
          fontSize="13px"
          lineHeight="18px"
          color="fg.muted"
          truncate
        >
          {row.artist}
        </Text>
        {hasExtras && (
          <Flex as="span" gridArea="meta" align="center" gap={{ base: 2, md: 3 }} minW={0}>
            {row.meta && (
              <Text
                as="span"
                fontFamily="mono"
                fontSize={{ base: "10px", md: "11px" }}
                letterSpacing="0.04em"
                whiteSpace="nowrap"
              >
                {row.meta}
              </Text>
            )}
            {row.sleeveUnknown && <SleeveChip />}
          </Flex>
        )}
      </RowButton>
    </Box>
  );
}

type Props = {
  id: string;
  /** "NEW ARRIVALS". */
  title: string;
  /** Why the group comes where it does: "Clean before the first play." */
  reason: string;
  rows: ChoreRowData[];
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  /** Selects every row of the section, or clears them when all are selected. */
  onToggleSection: (keys: string[], select: boolean) => void;
  /** The backlog's "N MORE IN THE BACKLOG →". */
  more?: { label: string; onClick: () => void; loading?: boolean };
};

/**
 * One group of the Chores to-do queue (#943): an outlined block with a ruled
 * list, a surface header naming the group, and SELECT / CLEAR SECTION.
 * Renders nothing when the group is empty.
 */
export default function ChoreGroup({
  id,
  title,
  reason,
  rows,
  selected,
  onToggle,
  onToggleSection,
  more,
}: Props) {
  if (rows.length === 0) return null;
  const keys = rows.map((row) => row.key);
  const allSelected = keys.every((key) => selected.has(key));
  const headingId = `${id}-heading`;
  return (
    <Box
      as="article"
      aria-labelledby={headingId}
      borderWidth="outline"
      borderColor="border.ink"
      boxShadow="md"
      mr="6px"
      bg="bg"
    >
      <Flex
        as="header"
        minH="44px"
        pl={3}
        pr={1}
        py={{ base: 2, md: 0 }}
        align="center"
        gap={{ base: 2, md: 3 }}
        borderBottomWidth="outline"
        borderColor="border.ink"
        bg="bg.subtle"
      >
        <Flex
          flex="1"
          minW={0}
          direction={{ base: "column", md: "row" }}
          align={{ base: "flex-start", md: "baseline" }}
          gap={{ base: "2px", md: "10px" }}
        >
          <Heading
            as="h3"
            id={headingId}
            fontFamily="mono"
            fontSize="11px"
            fontWeight="semibold"
            letterSpacing={{ base: "0.06em", md: "0.08em" }}
          >
            {title}
          </Heading>
          <Text as="span" fontSize={{ base: "12px", md: "13px" }} color="fg.muted">
            {reason}
          </Text>
        </Flex>
        <HeaderButton
          type="button"
          onClick={() => onToggleSection(keys, !allSelected)}
          minH="44px"
          px={{ base: 2, md: "10px" }}
          flexShrink={0}
          bg="transparent"
          color="fg"
          fontSize="11px"
          textDecoration="underline"
          cursor="pointer"
          {...monoLabel}
        >
          {allSelected ? "CLEAR SECTION" : "SELECT SECTION"}
        </HeaderButton>
      </Flex>
      <Box as="ul" listStyleType="none" m={0} p={0}>
        {rows.map((row) => (
          <ChoreRow key={row.key} row={row} checked={selected.has(row.key)} onToggle={onToggle} />
        ))}
      </Box>
      {more && (
        <HeaderButton
          type="button"
          onClick={more.onClick}
          disabled={more.loading}
          w="full"
          h="44px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          gap={2}
          borderTopWidth="outline"
          borderColor="border.ink"
          bg="transparent"
          color="fg"
          fontSize="11px"
          cursor="pointer"
          _hover={{ bg: "bg.muted" }}
          {...monoLabel}
          letterSpacing="0.08em"
        >
          {more.loading && <Spinner size="xs" />}
          {more.label} →
        </HeaderButton>
      )}
    </Box>
  );
}

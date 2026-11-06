"use client";

import React from "react";
import { Box, chakra, Flex, Spinner, Text } from "@chakra-ui/react";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { StatusTag } from "@/components/ui/RoleTags";
import Artwork from "@/components/player/Artwork";
import { ViewModeSwitch } from "@/components/layout/ListHeader";
import type { TrackViewMode } from "@/hooks/useTrackViewMode";
import ChoreCard from "./ChoreCard";
import ShelfCode from "./ShelfCode";

export type ChoreRowData = {
  key: string;
  title: string;
  artist: string;
  thumbnail: string | null;
  /** The shelf code (`albums.library_identifier`); null shows "No ID". */
  code: string | null;
  /** The album's edit page, where a missing code is fixed. */
  editHref: string;
  /** "SPUN 3× IN OCT", "ADDED OCT 17"; the backlog has none. */
  meta?: string;
  /** No sleeve logged: the row shows a "Sleeve unknown" status tag. */
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
    <StatusTag tone="neutral" flexShrink={0}>
      Sleeve unknown
    </StatusTag>
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
    <Box
      as="li"
      position="relative"
      borderTopWidth="rule"
      borderColor="border"
      _first={{ borderTopWidth: 0 }}
      bg={checked ? "bg.subtle" : "transparent"}
      _hover={{ bg: checked ? "bg.subtle" : "bg.muted" }}
    >
      {/* The whole row is the checkbox; the "No ID" link sits above it. */}
      <RowButton
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
        _focusVisible={{ outline: "2px solid", outlineColor: "border.ink", outlineOffset: "-2px" }}
      />
      <Box
        pointerEvents="none"
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
      >
        <Tick checked={checked} />
        <Box
          gridArea="cover"
          boxSize="44px"
          borderWidth="outline"
          borderRadius="md"
          borderColor="border.ink"
          overflow="hidden"
          alignSelf="center"
        >
          <Artwork src={row.thumbnail} alt="" size="40px" />
        </Box>
        <Flex as="span" gridArea="title" alignSelf="end" align="center" gap={2} minW={0}>
          <ShelfCode code={row.code} editHref={row.editHref} title={row.title} />
          <Text as="span" fontSize="15px" lineHeight="20px" fontWeight="semibold" truncate minW={0}>
            {row.title}
          </Text>
        </Flex>
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
      </Box>
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
  /** A List/Grid switch in the header, and the layout it picks. */
  view?: { mode: TrackViewMode; onChange: (mode: TrackViewMode) => void };
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
  view,
}: Props) {
  if (rows.length === 0) return null;
  const keys = rows.map((row) => row.key);
  const allSelected = keys.every((key) => selected.has(key));
  const grid = view?.mode === "card";
  const headingId = `${id}-heading`;
  return (
    <Box
      as="article"
      aria-labelledby={headingId}
      borderWidth="outline"
      borderRadius="md"
      overflow="clip"
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
        flexWrap={{ base: "wrap", md: "nowrap" }}
        gap={{ base: 2, md: 3 }}
        borderBottomWidth="outline"
        borderColor="border.ink"
        bg="bg.subtle"
      >
        <Flex
          flex={{ base: "1 1 100%", md: "1" }}
          minW={0}
          direction={{ base: "column", md: "row" }}
          align={{ base: "flex-start", md: "baseline" }}
          gap={{ base: "2px", md: "10px" }}
        >
          <SectionLabel variant="overline" level={3} id={headingId}>
            {title}
          </SectionLabel>
          <Text as="span" fontSize={{ base: "12px", md: "13px" }} color="fg.muted">
            {reason}
          </Text>
        </Flex>
        {view && (
          <Box ms={{ base: 0, md: "auto" }} me={{ base: "auto", md: 0 }} flexShrink={0}>
            <ViewModeSwitch value={view.mode} onChange={view.onChange} />
          </Box>
        )}
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
      {grid ? (
        <Box
          as="ul"
          listStyleType="none"
          m={0}
          p="14px"
          pr="17px"
          pb="17px"
          display="grid"
          gap="14px"
          gridTemplateColumns={{
            base: "repeat(2, minmax(0, 1fr))",
            md: "repeat(3, minmax(0, 1fr))",
            xl: "repeat(5, minmax(0, 1fr))",
          }}
        >
          {rows.map((row) => (
            <ChoreCard
              key={row.key}
              row={row}
              checked={selected.has(row.key)}
              onToggle={onToggle}
            />
          ))}
        </Box>
      ) : (
        <Box as="ul" listStyleType="none" m={0} p={0}>
          {rows.map((row) => (
            <ChoreRow key={row.key} row={row} checked={selected.has(row.key)} onToggle={onToggle} />
          ))}
        </Box>
      )}
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

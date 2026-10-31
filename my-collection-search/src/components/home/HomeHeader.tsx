"use client";

import React from "react";
import { Box, chakra, Text } from "@chakra-ui/react";
import { LuSearch } from "react-icons/lu";
import type { HomeResponse } from "@/services/internalApi/home";
import PageHeader from "@/components/layout/PageHeader";

type Counts = HomeResponse["counts"];

const plural = (count: number, word: string) =>
  `${count.toLocaleString("en-US")} ${word}${count === 1 ? "" : "s"}`;

/** "4,044 tracks · 312 albums · 18 playlists". */
export function formatHomeCounts(counts: Counts): string {
  return [
    plural(counts.tracks, "track"),
    plural(counts.albums, "album"),
    plural(counts.playlists, "playlist"),
  ].join(" · ");
}

const SearchTrigger = chakra("button");

/**
 * Home's title row (#881). Search opens the command palette, which already
 * owns ⌘K: a search-field-styled button on desktop, the header's search icon
 * on phones.
 */
export default function HomeHeader({
  counts,
  onSearch,
}: {
  /** Null while the summary loads or after it fails: the line is left out. */
  counts: Counts | null;
  onSearch: () => void;
}) {
  return (
    <PageHeader
      title="Home"
      summary={counts ? formatHomeCounts(counts) : undefined}
      actions={[{ label: "Search", icon: <LuSearch />, onClick: onSearch }]}
      desktopActions={
        <SearchTrigger
          type="button"
          onClick={onSearch}
          aria-label="Search tracks, albums, artists"
          aria-keyshortcuts="Meta+K"
          w="360px"
          maxW="40vw"
          h="44px"
          px="14px"
          display="flex"
          alignItems="center"
          gap="10px"
          borderWidth="outline"
          borderColor="border.ink"
          bg="bg"
          color="fg.muted"
          cursor="text"
          textAlign="left"
          _hover={{ bg: "bg.muted" }}
        >
          <Box display="flex" flexShrink={0} aria-hidden="true">
            <LuSearch size={18} />
          </Box>
          <Text as="span" flex="1" minW={0} fontSize="15px" truncate>
            Search tracks, albums, artists
          </Text>
          <Text
            as="kbd"
            h="22px"
            px="6px"
            display="flex"
            alignItems="center"
            borderWidth="rule"
            borderColor="border"
            fontFamily="mono"
            fontSize="11px"
            aria-hidden="true"
          >
            ⌘K
          </Text>
        </SearchTrigger>
      }
    />
  );
}

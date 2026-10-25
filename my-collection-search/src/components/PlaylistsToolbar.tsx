"use client";

import React from "react";
import { Box, Button, Flex, Input, InputGroup } from "@chakra-ui/react";
import { LuSearch } from "react-icons/lu";
import { TbFileImport } from "react-icons/tb";
import type { PlaylistsViewMode } from "@/hooks/usePlaylistsViewMode";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  viewMode: PlaylistsViewMode;
  onViewModeChange: (mode: PlaylistsViewMode) => void;
  onImport: () => void;
};

const VIEW_OPTIONS: Array<{ value: PlaylistsViewMode; label: string }> = [
  { value: "cards", label: "CARDS" },
  { value: "list", label: "LIST" },
];

/**
 * Full-width search with no surrounding box. From `md` up the CARDS / LIST
 * switch and Import sit to its right; phones keep Import in the page header
 * and always get cards.
 */
export default function PlaylistsToolbar({
  query,
  onQueryChange,
  viewMode,
  onViewModeChange,
  onImport,
}: Props) {
  return (
    <Flex gap={3} align="center" mb={4}>
      <InputGroup startElement={<LuSearch size={16} />} flex="1">
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          variant="outline"
          bg="bg.panel"
          // 16px on phones so iOS doesn't zoom on focus.
          fontSize={{ base: "16px", md: "14px" }}
          h={{ base: "44px", md: "36px" }}
          placeholder="Search playlists..."
          aria-label="Search playlists"
        />
      </InputGroup>
      <Flex display={{ base: "none", md: "flex" }} align="center" gap={3}>
        <Box role="group" aria-label="View" display="flex" gap={1}>
          {VIEW_OPTIONS.map(({ value, label }) => (
            <Button
              key={value}
              size="sm"
              fontFamily="mono"
              variant={viewMode === value ? "solid" : "ghost"}
              aria-pressed={viewMode === value}
              onClick={() => onViewModeChange(value)}
            >
              {label}
            </Button>
          ))}
        </Box>
        <Button size="sm" variant="outline" flexShrink={0} onClick={onImport}>
          <TbFileImport /> Import
        </Button>
      </Flex>
    </Flex>
  );
}

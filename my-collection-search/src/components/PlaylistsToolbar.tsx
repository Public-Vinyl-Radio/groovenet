"use client";

import React from "react";
import { IconButton, Menu } from "@chakra-ui/react";
import { FiMoreVertical } from "react-icons/fi";
import { TbFileImport } from "react-icons/tb";
import { HeaderButton, ListSearchRow, SearchField } from "@/components/layout/ListHeader";
import type { PlaylistsViewMode } from "@/hooks/usePlaylistsViewMode";

/**
 * The search row under the Playlists header: the shared 48px field (44px on
 * phones) at the Albums width. The view switch and Import live in the page
 * header, as on Tracks and Albums.
 */
export default function PlaylistsToolbar({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
}) {
  return (
    <ListSearchRow
      maxW="640px"
      field={
        <SearchField
          value={query}
          onChange={onQueryChange}
          label="Search playlists"
          placeholder="Search playlists"
        />
      }
    />
  );
}

/**
 * Import playlist in the desktop page row. Only one action lives here, so it
 * stays an outline button rather than a kebab with a single item.
 */
export function PlaylistImportButton({ onImport }: { onImport: () => void }) {
  return (
    <HeaderButton onClick={onImport}>
      <TbFileImport aria-hidden="true" />
      Import playlist
    </HeaderButton>
  );
}

/** The phone header kebab: Import playlist, and a View choice (List / Grid). */
export function PlaylistsPhoneMenu({
  viewMode,
  onViewModeChange,
  onImport,
}: {
  viewMode: PlaylistsViewMode;
  onViewModeChange: (mode: PlaylistsViewMode) => void;
  onImport: () => void;
}) {
  return (
    <Menu.Root positioning={{ placement: "bottom-end" }}>
      <Menu.Trigger asChild>
        <IconButton variant="ghost" boxSize="44px" minW="44px" aria-label="Playlists actions">
          <FiMoreVertical />
        </IconButton>
      </Menu.Trigger>
      <Menu.Positioner>
        <Menu.Content minW="200px">
          <Menu.Item value="import" minH="44px" onClick={onImport}>
            <TbFileImport />
            Import playlist
          </Menu.Item>
          <Menu.RadioItemGroup
            value={viewMode}
            onValueChange={(details) => onViewModeChange(details.value as PlaylistsViewMode)}
          >
            <Menu.ItemGroupLabel
              fontFamily="label"
              fontSize="11px"
              letterSpacing="0.06em"
              textTransform="uppercase"
              color="fg.muted"
            >
              View
            </Menu.ItemGroupLabel>
            <Menu.RadioItem value="list" minH="44px">
              List
              <Menu.ItemIndicator />
            </Menu.RadioItem>
            <Menu.RadioItem value="cards" minH="44px">
              Grid
              <Menu.ItemIndicator />
            </Menu.RadioItem>
          </Menu.RadioItemGroup>
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  );
}

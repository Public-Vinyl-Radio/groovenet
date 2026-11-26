"use client";

import React from "react";
import { Box, IconButton, Menu } from "@chakra-ui/react";
import { FiMoreVertical } from "react-icons/fi";
import { TbFileImport } from "react-icons/tb";
import { HeaderButton, ListSearchRow, SearchField } from "@/components/layout/ListHeader";
import type { PlaylistsViewMode } from "@/hooks/usePlaylistsViewMode";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { PlaylistOwnerFilter } from "@/lib/playlistOwners";

export type PlaylistOwnerFilterProps = {
  value: PlaylistOwnerFilter;
  options: Array<{ value: PlaylistOwnerFilter; label: string }>;
  onChange: (value: PlaylistOwnerFilter) => void;
};

/**
 * The search row under the Playlists header: the shared 48px field (44px on
 * phones) at the Albums width. The view switch and Import live in the page
 * header, as on Tracks and Albums. With more than one household profile, an
 * owner filter follows on every width (#1284): All, Mine, then each other
 * profile.
 */
export default function PlaylistsToolbar({
  query,
  onQueryChange,
  owner,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  owner?: PlaylistOwnerFilterProps;
}) {
  const showOwner = !!owner && owner.options.length > 0;
  return (
    <>
      <ListSearchRow
        maxW="640px"
        mb={showOwner ? 3 : undefined}
        field={
          <SearchField
            value={query}
            onChange={onQueryChange}
            label="Search playlists"
            placeholder="Search playlists"
          />
        }
      />
      {showOwner && (
        <Box maxW={{ md: "640px" }} mb={{ base: 3, md: 4 }}>
          <SegmentedControl
            framed
            aria-label="Show playlists by owner"
            items={owner.options}
            value={owner.value}
            onValueChange={owner.onChange}
          />
        </Box>
      )}
    </>
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

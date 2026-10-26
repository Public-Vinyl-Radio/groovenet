"use client";

import React from "react";
import { Badge, IconButton, Menu } from "@chakra-ui/react";
import { FiMoreHorizontal, FiMoreVertical } from "react-icons/fi";
import { LuImage, LuSlidersHorizontal } from "react-icons/lu";

type Props = {
  /** Filters on; rides the kebab's corner and the *Filters* entry. */
  activeCount: number;
  onOpenFilters: () => void;
  onOpenArtwork: () => void;
};

/**
 * The Albums page's header kebab on phones (#751): what the toolbar no longer
 * carries. Borderless like the Tracks and playlist pages'.
 */
export default function AlbumSearchMenu({ activeCount, onOpenFilters, onOpenArtwork }: Props) {
  return (
    <Menu.Root positioning={{ placement: "bottom-end" }}>
      <Menu.Trigger asChild>
        <IconButton
          variant="ghost"
          boxSize="44px"
          minW="44px"
          position="relative"
          aria-label={activeCount > 0 ? `Albums actions, ${activeCount} filters on` : "Albums actions"}
        >
          <FiMoreVertical />
          {activeCount > 0 && (
            <Badge size="xs" colorPalette="accent" variant="solid" position="absolute" top="2px" right="2px">
              {activeCount}
            </Badge>
          )}
        </IconButton>
      </Menu.Trigger>
      <Menu.Positioner>
        <Menu.Content minW="200px">
          <Menu.Item value="filters" minH="44px" onClick={onOpenFilters}>
            <LuSlidersHorizontal />
            {activeCount > 0 ? `Filters (${activeCount})` : "Filters"}
          </Menu.Item>
          <Menu.Item value="artwork" minH="44px" onClick={onOpenArtwork}>
            <LuImage />
            Album artwork review
          </Menu.Item>
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  );
}

/**
 * The desktop page row's kebab on Albums (#794): the cover-image review and
 * anything else used too rarely for its own button. Outlined like the
 * controls beside it.
 */
export function AlbumOptionsMenu({ onOpenArtwork }: { onOpenArtwork: () => void }) {
  return (
    <Menu.Root positioning={{ placement: "bottom-end" }}>
      <Menu.Trigger asChild>
        <IconButton
          aria-label="More album options"
          variant="outline"
          boxSize="40px"
          minW="40px"
          borderWidth="outline"
          borderColor="border"
        >
          <FiMoreHorizontal />
        </IconButton>
      </Menu.Trigger>
      <Menu.Positioner>
        <Menu.Content minW="220px">
          <Menu.Item value="artwork" onClick={onOpenArtwork}>
            <LuImage />
            Album artwork review
          </Menu.Item>
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  );
}

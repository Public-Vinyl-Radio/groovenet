"use client";

import React from "react";
import { Badge, IconButton, Menu } from "@chakra-ui/react";
import { FiMoreVertical } from "react-icons/fi";
import { LuListChecks, LuSlidersHorizontal } from "react-icons/lu";

type Props = {
  /** Filters on; rides the kebab's corner and the *Search options* entry. */
  activeCount: number;
  selectMode: boolean;
  onOpenOptions: () => void;
  onToggleSelect: () => void;
};

/**
 * The Tracks page's header kebab on phones (#751): the two things the
 * toolbar no longer carries. Borderless like the playlist page's.
 */
export default function TrackSearchMenu({
  activeCount,
  selectMode,
  onOpenOptions,
  onToggleSelect,
}: Props) {
  return (
    <Menu.Root positioning={{ placement: "bottom-end" }}>
      <Menu.Trigger asChild>
        <IconButton
          variant="ghost"
          boxSize="44px"
          minW="44px"
          position="relative"
          aria-label={
            activeCount > 0 ? `Tracks actions, ${activeCount} filters on` : "Tracks actions"
          }
        >
          <FiMoreVertical />
          {activeCount > 0 && (
            <Badge
              size="xs"
              colorPalette="accent"
              variant="solid"
              position="absolute"
              top="2px"
              right="2px"
            >
              {activeCount}
            </Badge>
          )}
        </IconButton>
      </Menu.Trigger>
      <Menu.Positioner>
        <Menu.Content minW="200px">
          <Menu.Item value="options" minH="44px" onClick={onOpenOptions}>
            <LuSlidersHorizontal />
            {activeCount > 0 ? `Search options (${activeCount})` : "Search options"}
          </Menu.Item>
          <Menu.Item value="select" minH="44px" onClick={onToggleSelect}>
            <LuListChecks />
            {selectMode ? "Stop selecting" : "Select tracks"}
          </Menu.Item>
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  );
}

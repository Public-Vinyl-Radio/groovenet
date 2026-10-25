"use client";

import React, { useState } from "react";
import { Button, Menu, Box, Flex } from "@chakra-ui/react";
import { menuDivider } from "@/components/ui/action-menu-primitives";
import PlaylistActionsModal from "@/components/PlaylistActionsModal";
import {
  FiCopy,
  FiEdit,
  FiLayers,
  FiMoreVertical,
  FiPlay,
  FiSave,
  FiZap,
} from "react-icons/fi";
import { GiTakeMyMoney } from "react-icons/gi";
import { PiDna, PiFilePdf } from "react-icons/pi";
import { LuFileJson, LuFileInput } from "react-icons/lu";

export interface PlaylistActionsMenuProps {
  disabled?: boolean;
  onSortGreedy: () => void;
  onSortGenetic: () => void;
  onSortCohesiveBlocks: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onExportPdf: () => void;
  onOpenSaveDialog: () => void;
  onDuplicate?: () => void;
  onRename?: () => void;
  onOpenRecommendations?: () => void;
  isGeneticSorting?: boolean;
  isCohesiveBlocksSorting?: boolean;
  enqueuePlaylist: () => void;
  playlistName?: string;
  /** The strip's catalogue line on phones: `tracks · total time`. */
  summary?: string;
}


export default function PlaylistActionsMenu({
  disabled,
  onSortGreedy,
  onSortGenetic,
  onSortCohesiveBlocks,
  onExportJson,
  onImportJson,
  onExportPdf,
  onOpenSaveDialog,
  onDuplicate,
  onRename,
  onOpenRecommendations,
  enqueuePlaylist,
  isGeneticSorting,
  isCohesiveBlocksSorting,
  playlistName,
  summary = "",
}: PlaylistActionsMenuProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* Phone: centred modal (#751) */}
      <Box display={{ base: "block", md: "none" }}>
        <Button
          size="sm"
          variant="outline"
          aria-label="Playlist actions"
          boxSize="44px"
          minW="44px"
          px={0}
          disabled={disabled}
          onClick={() => setDrawerOpen(true)}
        >
          <FiMoreVertical />
        </Button>
        <PlaylistActionsModal
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          playlistName={playlistName}
          summary={summary}
          onEnqueue={enqueuePlaylist}
          onSave={onOpenSaveDialog}
          onDuplicate={onDuplicate}
          onRename={onRename}
          sort={[
            { label: "Greedy order", onClick: onSortGreedy },
            {
              label: isGeneticSorting ? "Sorting..." : "Genetic order",
              disabled: isGeneticSorting,
              onClick: onSortGenetic,
            },
            {
              label: isCohesiveBlocksSorting ? "Sorting..." : "Cohesive blocks",
              disabled: isCohesiveBlocksSorting,
              onClick: onSortCohesiveBlocks,
            },
            ...(onOpenRecommendations ? [{ label: "AI recommendations", onClick: onOpenRecommendations }] : []),
          ]}
          exportImport={[
            { label: "Export JSON", onClick: onExportJson },
            { label: "Export PDF", onClick: onExportPdf },
            { label: "Import & append JSON", onClick: onImportJson },
          ]}
        />
      </Box>

      {/* Desktop: dropdown menu */}
      <Box display={{ base: "none", md: "block" }}>
        <Menu.Root>
          <Menu.Trigger asChild>
            <Button
              size="sm"
              variant="outline"
              aria-label="Playlist actions"
              px={2}
              disabled={disabled}
            >
              <FiMoreVertical />
            </Button>
          </Menu.Trigger>
          <Menu.Positioner>
            <Menu.Content>
              <Flex px={3} py={1} fontWeight="bold" fontSize="sm" color="fg.muted">
                Playlist Sort
              </Flex>
              {menuDivider}
              <Menu.Item value="sort-greedy" onSelect={onSortGreedy}>
                <GiTakeMyMoney /> Greedy Order
              </Menu.Item>
              <Menu.Item value="sort-genetic" onSelect={onSortGenetic} disabled={isGeneticSorting}>
                <PiDna /> {isGeneticSorting ? "Sorting..." : "Genetic Order"}
              </Menu.Item>
              <Menu.Item value="sort-cohesive-blocks" onSelect={onSortCohesiveBlocks} disabled={isCohesiveBlocksSorting}>
                <FiLayers /> {isCohesiveBlocksSorting ? "Sorting..." : "Cohesive Blocks"}
              </Menu.Item>
              {onOpenRecommendations && (
                <Menu.Item value="recommendations" onSelect={onOpenRecommendations}>
                  <FiZap /> AI Recommendations
                </Menu.Item>
              )}
              {menuDivider}
              <Menu.Item value="export-json" onSelect={onExportJson}>
                <LuFileJson /> Export JSON
              </Menu.Item>
              <Menu.Item value="import-json" onSelect={onImportJson}>
                <LuFileInput /> Import & Append JSON
              </Menu.Item>
              <Menu.Item value="export-pdf" onSelect={onExportPdf}>
                <PiFilePdf /> Export PDF
              </Menu.Item>
              <Menu.Item value="save" onSelect={onOpenSaveDialog}>
                <FiSave /> Save Playlist
              </Menu.Item>
              {(onDuplicate || onRename) && (
                <>
                  {menuDivider}
                  {onDuplicate && (
                    <Menu.Item value="duplicate" onSelect={onDuplicate}>
                      <FiCopy /> Duplicate Playlist
                    </Menu.Item>
                  )}
                  {onRename && (
                    <Menu.Item value="rename" onSelect={onRename}>
                      <FiEdit /> Rename Playlist
                    </Menu.Item>
                  )}
                </>
              )}
              {menuDivider}
              <Menu.Item value="enqueue" onSelect={enqueuePlaylist}>
                <FiPlay /> Enqueue Playlist
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Menu.Root>
      </Box>
    </>
  );
}

"use client";

import React, { useState } from "react";
import { Button, Menu, Box, Flex, Portal } from "@chakra-ui/react";
import type { RankingProfileEntry } from "@groovenet/contracts";
import { menuDivider } from "@/components/ui/action-menu-primitives";
import PlaylistActionsModal from "@/components/PlaylistActionsModal";
import RankingProfilePicker from "@/components/RankingProfilePicker";
import type { TrackViewMode } from "@/hooks/useTrackViewMode";
import {
  FiCalendar,
  FiChevronRight,
  FiCopy,
  FiEdit,
  FiLayers,
  FiLock,
  FiUnlock,
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
  /** Turns the playlist into a set; given only while it isn't one. */
  onCreateSet?: () => void;
  /**
   * Who sees it (#1284): given only to the owner, in a household with several
   * profiles. Toggles between the household and private.
   */
  visibility?: { value: "household" | "private"; onToggle: () => void };
  isGeneticSorting?: boolean;
  isCohesiveBlocksSorting?: boolean;
  enqueuePlaylist: () => void;
  playlistName?: string;
  /** The strip's catalogue line on phones: `tracks · total time`. */
  summary?: string;
  /**
   * The ranking profile Genetic and Cohesive order by (#1193). Chosen where you
   * sort, beside the two modes that send it, never in the page header (#1231).
   */
  ordering?: {
    value: string;
    options: RankingProfileEntry[];
    onChange: (profileId: string) => void;
  };
  /**
   * List or Grid, chosen from the menu on desktop (#1231). Phones always show
   * cards (`useTrackViewMode`), so the sheet has no view choice to offer.
   */
  view?: { value: TrackViewMode; onChange: (mode: TrackViewMode) => void };
}

const groupLabel = {
  fontFamily: "label",
  fontSize: "11px",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "fg.muted",
} as const;

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
  onCreateSet,
  visibility,
  enqueuePlaylist,
  isGeneticSorting,
  isCohesiveBlocksSorting,
  playlistName,
  summary = "",
  ordering,
  view,
}: PlaylistActionsMenuProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const orderingName = ordering?.options.find((profile) => profile.id === ordering.value)?.name;
  const visibilityLabel = visibility?.value === "private" ? "Share with household" : "Make private";

  return (
    <>
      {/* Phone: centred modal (#751) */}
      <Box display={{ base: "block", md: "none" }}>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Playlist actions"
          boxSize="44px"
          minW="44px"
          px={0}
          disabled={disabled}
          onClick={() => setModalOpen(true)}
        >
          <FiMoreVertical />
        </Button>
        <PlaylistActionsModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          playlistName={playlistName}
          summary={summary}
          onEnqueue={enqueuePlaylist}
          onSave={onOpenSaveDialog}
          onDuplicate={onDuplicate}
          onRename={onRename}
          // The picker sits over the two modes that order by it; Greedy doesn't.
          sortHeader={
            ordering && (
              <RankingProfilePicker
                id="playlist-order-phone"
                label="Order by"
                value={ordering.value}
                options={ordering.options}
                onChange={ordering.onChange}
              />
            )
          }
          sort={[
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
          ]}
          more={[
            { label: "Greedy order", onClick: onSortGreedy },
            ...(onOpenRecommendations
              ? [{ label: "Suggestions", onClick: onOpenRecommendations }]
              : []),
            ...(onCreateSet ? [{ label: "Create set", onClick: onCreateSet }] : []),
            ...(visibility ? [{ label: visibilityLabel, onClick: visibility.onToggle }] : []),
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
              {/* The profile Genetic and Cohesive order by, right above them; it
                  stays open on a choice, so the sort is the next click. */}
              {ordering && (
                <Menu.Root positioning={{ placement: "right-start", gutter: 2 }}>
                  <Menu.TriggerItem data-testid="order-by-trigger">
                    <Box as="span" flex="1">
                      Order by{orderingName ? `: ${orderingName}` : ""}
                    </Box>
                    <FiChevronRight aria-hidden="true" />
                  </Menu.TriggerItem>
                  <Portal>
                    <Menu.Positioner>
                      <Menu.Content minW="200px">
                        <Menu.RadioItemGroup
                          value={ordering.value}
                          onValueChange={(details) => ordering.onChange(details.value)}
                        >
                          <Menu.ItemGroupLabel {...groupLabel}>Order by</Menu.ItemGroupLabel>
                          {ordering.options.map((profile) => (
                            <Menu.RadioItem
                              key={profile.id}
                              value={profile.id}
                              closeOnSelect={false}
                            >
                              {profile.name}
                              <Menu.ItemIndicator />
                            </Menu.RadioItem>
                          ))}
                        </Menu.RadioItemGroup>
                      </Menu.Content>
                    </Menu.Positioner>
                  </Portal>
                </Menu.Root>
              )}
              <Menu.Item value="sort-genetic" onSelect={onSortGenetic} disabled={isGeneticSorting}>
                <PiDna /> {isGeneticSorting ? "Sorting..." : "Genetic Order"}
              </Menu.Item>
              <Menu.Item
                value="sort-cohesive-blocks"
                onSelect={onSortCohesiveBlocks}
                disabled={isCohesiveBlocksSorting}
              >
                <FiLayers /> {isCohesiveBlocksSorting ? "Sorting..." : "Cohesive Blocks"}
              </Menu.Item>
              {onOpenRecommendations && (
                <Menu.Item value="recommendations" onSelect={onOpenRecommendations}>
                  <FiZap /> Suggestions
                </Menu.Item>
              )}
              {onCreateSet && (
                <Menu.Item value="create-set" onSelect={onCreateSet}>
                  <FiCalendar /> Create set
                </Menu.Item>
              )}
              {view && (
                <>
                  {menuDivider}
                  <Menu.RadioItemGroup
                    value={view.value}
                    onValueChange={(details) => view.onChange(details.value as TrackViewMode)}
                  >
                    <Menu.ItemGroupLabel {...groupLabel}>View</Menu.ItemGroupLabel>
                    <Menu.RadioItem value="row">
                      List
                      <Menu.ItemIndicator />
                    </Menu.RadioItem>
                    <Menu.RadioItem value="card">
                      Grid
                      <Menu.ItemIndicator />
                    </Menu.RadioItem>
                  </Menu.RadioItemGroup>
                </>
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
              {(onDuplicate || onRename || visibility) && (
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
                  {visibility && (
                    <Menu.Item value="visibility" onSelect={visibility.onToggle}>
                      {visibility.value === "private" ? <FiUnlock /> : <FiLock />} {visibilityLabel}
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

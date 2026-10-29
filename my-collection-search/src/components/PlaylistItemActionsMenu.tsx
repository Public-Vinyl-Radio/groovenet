"use client";

import React, { useState } from "react";
import { Box, Button, Menu } from "@chakra-ui/react";
import { menuDivider } from "@/components/ui/action-menu-primitives";
import PlaylistRowActionsModal from "@/components/PlaylistRowActionsModal";
import { FaPlay } from "react-icons/fa";
import {
  FiCalendar,
  FiEdit2,
  FiFileText,
  FiMoreVertical,
  FiPlusSquare,
  FiTrash,
} from "react-icons/fi";

interface PlaylistItemActionsMenuProps {
  playlistName: string;
  onPlay: () => void;
  onDelete: () => void;
  onCreateSet?: () => void;
  onOpen: () => void;
  /** Appends the playlist to the queue. */
  onEnqueue: () => void;
  onExportPdf?: () => void;
  /** The phone strip's catalogue line: count, duration and date. */
  summary?: string;
  /** A performed set. */
  played?: boolean;
  collaborators?: string;
}

export default function PlaylistItemActionsMenu({
  playlistName,
  onPlay,
  onDelete,
  onCreateSet,
  onOpen,
  onEnqueue,
  onExportPdf,
  summary = "",
  played,
  collaborators,
}: PlaylistItemActionsMenuProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* Phone: centred modal (#751) */}
      <Box display={{ base: "block", md: "none" }}>
        <Button
          size="xs"
          variant="ghost"
          boxSize="44px"
          minW="44px"
          px={0}
          aria-label="Playlist actions"
          onClick={() => setDrawerOpen(true)}
        >
          <FiMoreVertical />
        </Button>
        <PlaylistRowActionsModal
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          playlistName={playlistName}
          summary={summary}
          played={played}
          collaborators={collaborators}
          onPlay={onPlay}
          onEnqueue={onEnqueue}
          onOpen={onOpen}
          playlist={[
            ...(onCreateSet ? [{ label: "Turn into a set", onClick: onCreateSet }] : []),
            ...(onExportPdf ? [{ label: "Export PDF", onClick: onExportPdf }] : []),
          ]}
          danger={[{ label: "Delete playlist", onClick: onDelete }]}
        />
      </Box>

      {/* Desktop: dropdown menu */}
      <Box display={{ base: "none", md: "block" }}>
        <Menu.Root>
          <Menu.Trigger asChild>
            <Button size="xs" variant="ghost" px={2} aria-label="Playlist actions">
              <FiMoreVertical />
            </Button>
          </Menu.Trigger>
          <Menu.Positioner>
            <Menu.Content>
              <Menu.Item value="open" onClick={onOpen}>
                <FiEdit2 /> Open playlist
              </Menu.Item>
              <Menu.Item value="play-now" onClick={onPlay}>
                <FaPlay /> Play now
              </Menu.Item>
              <Menu.Item value="enqueue" onClick={onEnqueue}>
                <FiPlusSquare /> Enqueue
              </Menu.Item>
              {onCreateSet && (
                <Menu.Item value="turn-into-set" onClick={onCreateSet}>
                  <FiCalendar /> Turn into a set
                </Menu.Item>
              )}
              {onExportPdf && (
                <Menu.Item value="export-pdf" onClick={onExportPdf}>
                  <FiFileText /> Export PDF
                </Menu.Item>
              )}
              {menuDivider}
              <Menu.Item
                value="delete"
                onClick={onDelete}
                color="fg.error"
                _hover={{ bg: "bg.error", color: "fg.error" }}
              >
                <FiTrash /> Delete
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Menu.Root>
      </Box>
    </>
  );
}

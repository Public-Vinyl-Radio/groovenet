"use client";

import React from "react";
import { Box, Text } from "@chakra-ui/react";
import { FiExternalLink, FiPlay, FiPlusSquare } from "react-icons/fi";
import RetroDialog, { RetroDialogTitle } from "@/components/ui/RetroDialog";
import { Group, TileRow, overline, type ModalAction } from "@/components/ui/RetroModalParts";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playlistName: string;
  /** The catalogue line of the strip: count, duration and date. */
  summary: string;
  /** A performed set. */
  played?: boolean;
  collaborators?: string;
  onPlay: () => void;
  onEnqueue: () => void;
  onOpen: () => void;
  playlist: ModalAction[];
  danger: ModalAction[];
};

/** The phone Playlists-list row menu as a centred modal (#751). */
export default function PlaylistRowActionsModal({
  open,
  onOpenChange,
  playlistName,
  summary,
  played,
  collaborators,
  onPlay,
  onEnqueue,
  onOpen,
  playlist,
  danger,
}: Props) {
  const close = () => onOpenChange(false);
  return (
    <RetroDialog
      open={open}
      onOpenChange={onOpenChange}
      header={
        <Box flex="1" minW={0}>
          <Text {...overline} fontSize="11px" lineHeight="14px" opacity={0.8} lineClamp={1}>
            {summary}
            {played ? " · PLAYED" : ""}
          </Text>
          <RetroDialogTitle fontSize="16px" lineHeight="22px" fontWeight="semibold" lineClamp={1}>
            {playlistName}
          </RetroDialogTitle>
          {collaborators && (
            <Text fontSize="13px" lineHeight="18px" opacity={0.8} lineClamp={1}>
              {collaborators}
            </Text>
          )}
        </Box>
      }
    >
      <TileRow
        onDone={close}
        tiles={[
          { label: "Play now", icon: <FiPlay fill="currentColor" />, solid: true, onClick: onPlay },
          { label: "Enqueue", icon: <FiPlusSquare />, onClick: onEnqueue },
          { label: "Open", icon: <FiExternalLink />, onClick: onOpen },
        ]}
      />
      <Group label="Playlist" actions={playlist} onDone={close} />
      <Group label="Danger" actions={danger} danger onDone={close} />
    </RetroDialog>
  );
}

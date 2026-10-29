"use client";

import React from "react";
import { Box, Text, chakra } from "@chakra-ui/react";
import { FiCopy, FiPlay, FiSave } from "react-icons/fi";
import RetroDialog, { RetroDialogTitle } from "@/components/ui/RetroDialog";
import {
  Group,
  TileRow,
  overline,
  type ModalAction,
  type ModalTile,
} from "@/components/ui/RetroModalParts";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playlistName?: string;
  /** The catalogue line of the strip: `tracks · total time`. */
  summary: string;
  onEnqueue: () => void;
  onSave: () => void;
  onDuplicate?: () => void;
  /** Shown as a button in the strip. */
  onRename?: () => void;
  sort: ModalAction[];
  exportImport: ModalAction[];
};

/** The phone playlist page actions menu as a centred modal (#751). */
export default function PlaylistActionsModal({
  open,
  onOpenChange,
  playlistName,
  summary,
  onEnqueue,
  onSave,
  onDuplicate,
  onRename,
  sort,
  exportImport,
}: Props) {
  const close = () => onOpenChange(false);
  const tiles: ModalTile[] = [
    { label: "Enqueue", icon: <FiPlay fill="currentColor" />, solid: true, onClick: onEnqueue },
    { label: "Save", icon: <FiSave />, onClick: onSave },
    ...(onDuplicate ? [{ label: "Duplicate", icon: <FiCopy />, onClick: onDuplicate }] : []),
  ];
  return (
    <RetroDialog
      open={open}
      onOpenChange={onOpenChange}
      header={
        <>
          <Box flex="1" minW={0}>
            <Text {...overline} fontSize="11px" lineHeight="14px" opacity={0.8} lineClamp={1}>
              {summary}
            </Text>
            <RetroDialogTitle fontSize="16px" lineHeight="22px" fontWeight="semibold" lineClamp={1}>
              {playlistName ?? "Playlist actions"}
            </RetroDialogTitle>
          </Box>
          {onRename && (
            <chakra.button
              h="44px"
              px="12px"
              flexShrink={0}
              borderWidth="outline"
              borderColor="bg"
              fontFamily="label"
              fontSize="12px"
              letterSpacing="0.06em"
              textTransform="uppercase"
              _hover={{ opacity: 0.75 }}
              onClick={() => {
                onRename();
                close();
              }}
            >
              Rename
            </chakra.button>
          )}
        </>
      }
    >
      <TileRow tiles={tiles} onDone={close} />
      <Group label="Sort" actions={sort} onDone={close} />
      <Group label="Export & import" actions={exportImport} onDone={close} />
    </RetroDialog>
  );
}

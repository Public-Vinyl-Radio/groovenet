"use client";

import React from "react";
import { Box, Button, Menu, Portal, Text } from "@chakra-ui/react";
import { FiEdit, FiMoreVertical, FiTrash } from "react-icons/fi";
import { menuDivider } from "@/components/ui/action-menu-primitives";
import RetroDialog, { RetroDialogTitle } from "@/components/ui/RetroDialog";
import { Group, TileRow, overline } from "@/components/ui/RetroModalParts";
import ConfirmDialog from "@/components/records/ConfirmDialog";

type Props = {
  /** What the spin was, for the modal header and the delete prompt. */
  label: string;
  onEdit: () => void;
  /** Resolves once deleted; rejects to keep the prompt open. */
  onDelete: () => Promise<void>;
  deleting: boolean;
};

export default function SpinActionsMenu({ label, onEdit, onDelete, deleting }: Props) {
  const [modalOpen, setModalOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  return (
    <>
      {/* Mobile: centred retro modal (#751) */}
      <Box display={{ base: "block", md: "none" }} flexShrink={0}>
        <Button
          variant="plain"
          boxSize="44px"
          minW="44px"
          aria-label="Spin actions"
          onClick={() => setModalOpen(true)}
        >
          <FiMoreVertical size={16} />
        </Button>
        <RetroDialog
          open={modalOpen}
          onOpenChange={setModalOpen}
          header={
            <Box flex="1" minW={0}>
              <Text {...overline} fontSize="11px" lineHeight="14px" opacity={0.8}>
                Spin
              </Text>
              <RetroDialogTitle
                fontSize="16px"
                lineHeight="22px"
                fontWeight="semibold"
                lineClamp={1}
              >
                {label}
              </RetroDialogTitle>
            </Box>
          }
        >
          <TileRow
            onDone={() => setModalOpen(false)}
            tiles={[{ label: "Edit spin", icon: <FiEdit />, solid: true, onClick: onEdit }]}
          />
          <Group
            label="Danger"
            danger
            onDone={() => setModalOpen(false)}
            actions={[{ label: "Delete spin", onClick: () => setConfirmOpen(true) }]}
          />
        </RetroDialog>
      </Box>

      {/* Desktop: dropdown menu */}
      <Box display={{ base: "none", md: "block" }} flexShrink={0}>
        <Menu.Root>
          <Menu.Trigger asChild>
            <Button variant="plain" size="xs" aria-label="Spin actions">
              <FiMoreVertical size={16} />
            </Button>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content>
                <Menu.Item value="edit" onSelect={onEdit}>
                  <FiEdit /> Edit spin
                </Menu.Item>
                {menuDivider}
                <Menu.Item
                  value="delete"
                  onSelect={() => setConfirmOpen(true)}
                  color="fg.error"
                  _hover={{ bg: "bg.error", color: "fg.error" }}
                >
                  <FiTrash /> Delete spin
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </Box>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete spin?"
        body={
          <>
            <strong>{label}</strong> will be removed from your spin history and play counts.
          </>
        }
        confirmLabel="Delete"
        onConfirm={onDelete}
        pending={deleting}
      />
    </>
  );
}

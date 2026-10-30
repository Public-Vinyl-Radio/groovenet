"use client";

import React from "react";
import { Box, Button, Menu, Portal, Text } from "@chakra-ui/react";
import { FiDroplet, FiEdit, FiMoreVertical, FiTrash } from "react-icons/fi";
import { menuDivider } from "@/components/ui/action-menu-primitives";
import RetroDialog, { RetroDialogTitle } from "@/components/ui/RetroDialog";
import { Group, TileRow, overline } from "@/components/ui/RetroModalParts";

type Props = {
  /** The copy's name, for the modal header. */
  label: string;
  onLogCare: () => void;
  onEdit: () => void;
  /** Omitted for the default copy, which stays while the release has copies. */
  onRemove?: () => void;
};

/** A copy's actions: a centred retro modal on mobile (#751), a dropdown on desktop, as SpinActionsMenu. */
export default function RecordCopyMenu({ label, onLogCare, onEdit, onRemove }: Props) {
  const [modalOpen, setModalOpen] = React.useState(false);

  return (
    <>
      {/* Mobile: centred retro modal */}
      <Box display={{ base: "block", md: "none" }} flexShrink={0}>
        <Button
          variant="plain"
          boxSize="44px"
          minW="44px"
          aria-label="Copy actions"
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
                Copy
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
            tiles={[
              { label: "Log care", icon: <FiDroplet />, solid: true, onClick: onLogCare },
              { label: "Edit", icon: <FiEdit />, onClick: onEdit },
            ]}
          />
          <Group
            label="Danger"
            danger
            onDone={() => setModalOpen(false)}
            actions={onRemove ? [{ label: "Remove copy", onClick: onRemove }] : []}
          />
        </RetroDialog>
      </Box>

      {/* Desktop: dropdown menu */}
      <Box display={{ base: "none", md: "block" }} flexShrink={0}>
        <Menu.Root>
          <Menu.Trigger asChild>
            <Button variant="plain" size="xs" aria-label="Copy actions">
              <FiMoreVertical size={16} />
            </Button>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content>
                <Menu.Item value="log-care" onSelect={onLogCare}>
                  <FiDroplet /> Log care
                </Menu.Item>
                <Menu.Item value="edit" onSelect={onEdit}>
                  <FiEdit /> Edit label & notes
                </Menu.Item>
                {onRemove && (
                  <>
                    {menuDivider}
                    <Menu.Item
                      value="remove"
                      onSelect={onRemove}
                      color="fg.error"
                      _hover={{ bg: "bg.error", color: "fg.error" }}
                    >
                      <FiTrash /> Remove copy
                    </Menu.Item>
                  </>
                )}
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </Box>
    </>
  );
}

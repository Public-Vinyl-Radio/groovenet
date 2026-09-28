"use client";

import React from "react";
import {
  Box,
  Button,
  CloseButton,
  Dialog,
  Drawer,
  Menu,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react";
import { FiEdit, FiMoreVertical, FiTrash } from "react-icons/fi";
import { DrawerItem, drawerDivider, menuDivider } from "@/components/ui/action-menu-primitives";

type Props = {
  /** What the spin was, for the sheet header and the delete prompt. */
  label: string;
  onEdit: () => void;
  /** Resolves once deleted; rejects to keep the prompt open. */
  onDelete: () => Promise<void>;
  deleting: boolean;
};

export default function SpinActionsMenu({ label, onEdit, onDelete, deleting }: Props) {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const handleConfirm = async () => {
    try {
      await onDelete();
      setConfirmOpen(false);
    } catch {
      // The caller reports the failure; the prompt stays open to retry.
    }
  };

  return (
    <>
      {/* Mobile: bottom sheet */}
      <Box display={{ base: "block", md: "none" }} flexShrink={0}>
        <Button
          variant="plain"
          size="xs"
          aria-label="Spin actions"
          onClick={() => setSheetOpen(true)}
        >
          <FiMoreVertical size={16} />
        </Button>
        <Drawer.Root placement="bottom" open={sheetOpen} onOpenChange={(d) => setSheetOpen(d.open)}>
          <Portal>
            <Drawer.Backdrop />
            <Drawer.Positioner>
              <Drawer.Content borderTopRadius="xl">
                <Drawer.Header borderBottomWidth="1px" py={3} px={5} position="relative">
                  <Text fontWeight="semibold" fontSize="sm" lineClamp={1} pr={8}>{label}</Text>
                  <Drawer.CloseTrigger asChild>
                    <CloseButton size="sm" position="absolute" right={3} top="50%" transform="translateY(-50%)" />
                  </Drawer.CloseTrigger>
                </Drawer.Header>
                <Drawer.Body p={0} pb="max(env(safe-area-inset-bottom), 8px)">
                  <Stack gap={0}>
                    <DrawerItem
                      icon={<FiEdit />}
                      label="Edit spin"
                      onClick={() => { setSheetOpen(false); onEdit(); }}
                    />
                    {drawerDivider}
                    <DrawerItem
                      icon={<FiTrash />}
                      label="Delete spin"
                      color="red.500"
                      onClick={() => { setSheetOpen(false); setConfirmOpen(true); }}
                    />
                  </Stack>
                </Drawer.Body>
              </Drawer.Content>
            </Drawer.Positioner>
          </Portal>
        </Drawer.Root>
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

      <Dialog.Root
        open={confirmOpen}
        onOpenChange={(e) => !deleting && setConfirmOpen(e.open)}
        size="sm"
        role="alertdialog"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>Delete spin?</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <Text>
                  <strong>{label}</strong> will be removed from your spin history and play counts.
                </Text>
              </Dialog.Body>
              <Dialog.Footer>
                <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={deleting}>
                  Cancel
                </Button>
                <Button colorPalette="red" onClick={handleConfirm} loading={deleting}>
                  Delete
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}

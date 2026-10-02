"use client";

import React from "react";
import { Box, Button, CloseButton, Drawer, Menu, Portal, Stack, Text } from "@chakra-ui/react";
import { FiDroplet, FiEdit, FiMoreVertical, FiTrash } from "react-icons/fi";
import { DrawerItem, drawerDivider, menuDivider } from "@/components/ui/action-menu-primitives";

type Props = {
  /** The copy's name, for the sheet header. */
  label: string;
  onLogCare: () => void;
  onEdit: () => void;
  /** Omitted for the default copy, which stays while the release has copies. */
  onRemove?: () => void;
};

/** A copy's actions: a bottom sheet on mobile, a dropdown on desktop, as SpinActionsMenu. */
export default function RecordCopyMenu({ label, onLogCare, onEdit, onRemove }: Props) {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const fromSheet = (action: () => void) => () => {
    setSheetOpen(false);
    action();
  };

  return (
    <>
      {/* Mobile: bottom sheet */}
      <Box display={{ base: "block", md: "none" }} flexShrink={0}>
        <Button variant="plain" size="xs" aria-label="Copy actions" onClick={() => setSheetOpen(true)}>
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
                    <DrawerItem icon={<FiDroplet />} label="Log care" onClick={fromSheet(onLogCare)} />
                    <DrawerItem icon={<FiEdit />} label="Edit label & notes" onClick={fromSheet(onEdit)} />
                    {onRemove && (
                      <>
                        {drawerDivider}
                        <DrawerItem
                          icon={<FiTrash />}
                          label="Remove copy"
                          color="red.500"
                          onClick={fromSheet(onRemove)}
                        />
                      </>
                    )}
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

"use client";

import React, { useState } from "react";
import {
  Box,
  Button,
  CloseButton,
  Drawer,
  Menu,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react";
import { menuDivider, drawerDivider, DrawerItem } from "@/components/ui/action-menu-primitives";
import { FaPlay } from "react-icons/fa";
import { FiCalendar, FiEdit2, FiMoreVertical, FiTrash } from "react-icons/fi";

interface PlaylistItemActionsMenuProps {
  playlistName: string;
  onPlay: () => void;
  onDelete: () => void;
  onCreateSet?: () => void;
  onOpen: () => void;
}


export default function PlaylistItemActionsMenu({
  playlistName,
  onPlay,
  onDelete,
  onCreateSet,
  onOpen,
}: PlaylistItemActionsMenuProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const close = () => setDrawerOpen(false);

  return (
    <>
      {/* Mobile: bottom sheet */}
      <Box display={{ base: "block", md: "none" }}>
        <Button size="xs" variant="ghost" px={2} aria-label="Playlist actions" onClick={() => setDrawerOpen(true)}>
          <FiMoreVertical />
        </Button>
        <Drawer.Root placement="bottom" open={drawerOpen} onOpenChange={(d) => setDrawerOpen(d.open)}>
          <Portal>
            <Drawer.Backdrop />
            <Drawer.Positioner>
              <Drawer.Content borderTopRadius="xl">
                <Drawer.Header borderBottomWidth="1px" py={3} px={5} position="relative">
                  <Text fontWeight="semibold" fontSize="sm" lineClamp={1} pr={8}>
                    {playlistName}
                  </Text>
                  <Drawer.CloseTrigger asChild>
                    <CloseButton size="sm" position="absolute" right={3} top="50%" transform="translateY(-50%)" />
                  </Drawer.CloseTrigger>
                </Drawer.Header>
                <Drawer.Body p={0}>
                  <Stack gap={0}>
                    <DrawerItem icon={<FiEdit2 />} label="Open playlist" onClick={() => { onOpen(); close(); }} />
                    <DrawerItem icon={<FaPlay />} label="Play Now" onClick={() => { onPlay(); close(); }} />
                    {onCreateSet && <DrawerItem icon={<FiCalendar />} label="Turn into a set" onClick={() => { onCreateSet(); close(); }} />}
                    {drawerDivider}
                    <DrawerItem icon={<FiTrash />} label="Delete" color="red.500" onClick={() => { onDelete(); close(); }} />
                  </Stack>
                </Drawer.Body>
              </Drawer.Content>
            </Drawer.Positioner>
          </Portal>
        </Drawer.Root>
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
              {onCreateSet && (
                <Menu.Item value="turn-into-set" onClick={onCreateSet}>
                  <FiCalendar /> Turn into a set
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

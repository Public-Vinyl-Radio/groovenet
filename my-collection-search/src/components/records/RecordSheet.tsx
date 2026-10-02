"use client";

import React from "react";
import {
  Button,
  CloseButton,
  Dialog,
  Drawer,
  HStack,
  Portal,
  Text,
  useBreakpointValue,
} from "@chakra-ui/react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  saveLabel: string;
  saving: boolean;
  onSave: () => void;
  children: React.ReactNode;
};

/** A form in a dialog on desktop and a bottom sheet on mobile, as SpinFormDialog lays out. */
export default function RecordSheet({
  open,
  onOpenChange,
  title,
  saveLabel,
  saving,
  onSave,
  children,
}: Props) {
  // Undefined before the breakpoint is known (SSR): treat that as desktop.
  const isDesktop = useBreakpointValue({ base: true, md: false }) !== true;

  return isDesktop ? (
    <Dialog.Root open={open} onOpenChange={(details) => onOpenChange(details.open)} size="md">
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>{title}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body pb={6}>{children}</Dialog.Body>
            <Dialog.Footer>
              <HStack gap={2}>
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button loading={saving} onClick={onSave}>{saveLabel}</Button>
              </HStack>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  ) : (
    <Drawer.Root placement="bottom" open={open} onOpenChange={(details) => onOpenChange(details.open)}>
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content borderTopRadius="xl" maxH="92vh">
            <Drawer.Header borderBottomWidth="1px" py={3} px={4} position="relative">
              <Drawer.Title asChild>
                <Text fontWeight="semibold" fontSize="sm">{title}</Text>
              </Drawer.Title>
              <Drawer.CloseTrigger asChild>
                <CloseButton size="sm" position="absolute" right={3} top="50%" transform="translateY(-50%)" />
              </Drawer.CloseTrigger>
            </Drawer.Header>
            <Drawer.Body p={4} overflowY="auto">{children}</Drawer.Body>
            <Drawer.Footer borderTopWidth="1px" pt={3} pb="max(env(safe-area-inset-bottom), 16px)" px={4}>
              <HStack gap={2} w="full">
                <Button variant="outline" flex={1} onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button flex={1} loading={saving} onClick={onSave}>{saveLabel}</Button>
              </HStack>
            </Drawer.Footer>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}

"use client";

import React from "react";
import { Box, Button, Dialog, HStack, Portal, useBreakpointValue } from "@chakra-ui/react";
import RetroDialog from "@/components/ui/RetroDialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  saveLabel: string;
  saving: boolean;
  onSave: () => void;
  children: React.ReactNode;
};

/** A form in a dialog on desktop and a centred retro modal on mobile (#751), as SpinFormDialog lays out. */
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
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button loading={saving} onClick={onSave}>
                  {saveLabel}
                </Button>
              </HStack>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  ) : (
    <RetroDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <Box
          display="grid"
          gridTemplateColumns="repeat(2, minmax(0, 1fr))"
          gap="10px"
          p="12px 17px 12px 12px"
        >
          <Button variant="outline" h="44px" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="solid" h="44px" loading={saving} onClick={onSave}>
            {saveLabel}
          </Button>
        </Box>
      }
    >
      <Box p="14px 17px 16px 12px">{children}</Box>
    </RetroDialog>
  );
}

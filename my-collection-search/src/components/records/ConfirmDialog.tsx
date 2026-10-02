"use client";

import React from "react";
import { Button, Dialog, Portal, Text } from "@chakra-ui/react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  /** Resolves once done; rejects to keep the prompt open, as SpinActionsMenu's does. */
  onConfirm: () => Promise<void>;
  pending: boolean;
};

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  pending,
}: Props) {
  const handleConfirm = async () => {
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // The caller reports the failure; the prompt stays open to retry.
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => !pending && onOpenChange(e.open)}
      size="sm"
      role="alertdialog"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>{title}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Text>{body}</Text>
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              <Button colorPalette="red" onClick={handleConfirm} loading={pending}>
                {confirmLabel}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

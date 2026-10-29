"use client";

import React, { useRef } from "react";
import { Box, Button, Text } from "@chakra-ui/react";
import RetroDialog from "@/components/ui/RetroDialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  /** Resolves once done; rejects to keep the prompt open, as SpinActionsMenu's does. */
  onConfirm: () => Promise<void>;
  pending: boolean;
  /** Destructive confirms focus Cancel first and use the danger fill; otherwise the accent. */
  destructive?: boolean;
};

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  pending,
  destructive = true,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const handleConfirm = async () => {
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // The caller reports the failure; the prompt stays open to retry.
    }
  };

  return (
    <RetroDialog
      open={open}
      onOpenChange={onOpenChange}
      role="alertdialog"
      title={title}
      dismissible={!pending}
      initialFocusEl={destructive ? () => cancelRef.current : undefined}
    >
      <Box p="16px 14px" display="flex" flexDirection="column" gap={4}>
        <Text>{body}</Text>
        <Box display="grid" gridTemplateColumns="repeat(2, minmax(0, 1fr))" gap="10px" pr="3px">
          <Button
            ref={cancelRef}
            variant="outline"
            h="44px"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant="solid"
            h="44px"
            colorPalette={destructive ? "danger" : "accent"}
            onClick={handleConfirm}
            loading={pending}
          >
            {confirmLabel}
          </Button>
        </Box>
      </Box>
    </RetroDialog>
  );
}

"use client";

import React from "react";
import { Dialog, Flex, IconButton, Portal } from "@chakra-ui/react";
import { FiX } from "react-icons/fi";
import { retroDialog } from "@/app/houseStyle";

/** The accessible name of a dialog whose `header` is custom. */
export const RetroDialogTitle = Dialog.Title;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `alertdialog` for a confirmation that interrupts the user. */
  role?: "dialog" | "alertdialog";
  /** A label strip title. Give `header` instead for a richer strip. */
  title?: string;
  /** Replaces the title in the strip; it must contain a `Dialog.Title`. */
  header?: React.ReactNode;
  /** False while work is pending: Esc, the backdrop and the close button stop closing it. */
  dismissible?: boolean;
  /** The element to focus on open; defaults to the first focusable. */
  initialFocusEl?: () => HTMLElement | null;
  children: React.ReactNode;
};

/**
 * The house-style centred modal that replaces bottom sheets on phones (#735):
 * a 2px ink outline, a hard shadow, square corners, an ink label strip with
 * a close button, and a body that scrolls inside the viewport. Focus is
 * trapped and Esc closes, as with any Chakra dialog.
 */
export default function RetroDialog({
  open,
  onOpenChange,
  role = "dialog",
  title,
  header,
  dismissible = true,
  initialFocusEl,
  children,
}: Props) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => dismissible && onOpenChange(e.open)}
      closeOnEscape={dismissible}
      closeOnInteractOutside={dismissible}
      placement="center"
      motionPreset="scale"
      role={role}
      initialFocusEl={initialFocusEl}
    >
      <Portal>
        <Dialog.Backdrop css={retroDialog.backdrop} />
        <Dialog.Positioner css={retroDialog.positioner}>
          <Dialog.Content css={retroDialog.content} display="flex" flexDirection="column" overflow="hidden">
            <Flex
              align="center"
              gap={3}
              bg="border.ink"
              color="bg"
              pl={header ? "10px" : "14px"}
              pr="4px"
              minH={header ? undefined : "48px"}
              py={header ? "10px" : 0}
              flexShrink={0}
            >
              {header ?? (
                <Dialog.Title flex={1} fontFamily="label" fontSize="13px" letterSpacing="0.06em" textTransform="uppercase" fontWeight="semibold">
                  {title}
                </Dialog.Title>
              )}
              <Dialog.CloseTrigger asChild>
                <IconButton
                  aria-label="Close"
                  variant="ghost"
                  color="bg"
                  boxSize="44px"
                  minW="44px"
                  flexShrink={0}
                  disabled={!dismissible}
                  _hover={{ bg: "transparent", opacity: 0.75 }}
                >
                  <FiX />
                </IconButton>
              </Dialog.CloseTrigger>
            </Flex>
            <Dialog.Body p={0} flex="1" minH={0} overflowY="auto">
              {children}
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

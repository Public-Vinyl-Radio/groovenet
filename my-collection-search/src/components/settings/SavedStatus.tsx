"use client";

import React from "react";
import { Box, Button, Flex, Text } from "@chakra-ui/react";

type SavedStatusProps = {
  /** Show the line. False keeps the (empty) live region, so the next save is announced. */
  saved: boolean;
  /** What changed, before "Saved" ("Default set to collector-2"). */
  subject?: string;
  /** After "Saved" (the time, "14:02"). */
  detail?: string;
  /** Offers UNDO when set. */
  onUndo?: () => void;
};

/**
 * The instant-save status line, "DEFAULT SET TO COLLECTOR-2 · SAVED · UNDO".
 * Every setting saves as it changes, so this replaces Save buttons. It sits in
 * a polite live region that is always mounted: a region added together with
 * its text is not announced.
 */
export default function SavedStatus({ saved, subject, detail, onUndo }: SavedStatusProps) {
  const text = [subject, "Saved", detail].filter(Boolean).join(" · ");
  return (
    <Box role="status" aria-live="polite" minH="36px" display="flex" alignItems="center">
      {saved ? (
        <Flex
          data-testid="saved-status"
          align="center"
          gap={2}
          minH="36px"
          pl={3}
          pr={onUndo ? 1 : 3}
          borderWidth="outline"
          borderRadius="md"
          borderColor="border.ink"
          bg="bg.subtle"
        >
          <Text
            fontFamily="label"
            fontSize="xs"
            fontWeight="semibold"
            letterSpacing="0.06em"
            textTransform="uppercase"
          >
            {text}
          </Text>
          {onUndo ? (
            <Button
              variant="plain"
              size="xs"
              px={2}
              fontFamily="label"
              fontWeight="semibold"
              letterSpacing="0.06em"
              textTransform="uppercase"
              textDecoration="underline"
              onClick={onUndo}
            >
              Undo
            </Button>
          ) : null}
        </Flex>
      ) : null}
    </Box>
  );
}

"use client";

import React from "react";
import { Button, Flex, Text } from "@chakra-ui/react";
import { StatusTag } from "@/components/ui/RoleTags";

type Props = {
  /** What changed and how ("Order changed · by Selector"). */
  summary: string;
  /** Desktop's Save; phones save from the header's Save changes action. */
  onSave?: () => void;
  /** Back to the saved playlist; left out where that can't be done. */
  onDiscard?: () => void;
  saving?: boolean;
  discarding?: boolean;
};

/**
 * The one unsaved-state bar on the playlist page (#1231). It sticks under the
 * page header (the 52px phone bar, or the top of the page on desktop) so it
 * stays in view while the tracks scroll, which is where you look after a sort.
 * Analysis status tone, the accent solid for Save; a block gap above the cards.
 */
export default function PlaylistUnsavedBar({
  summary,
  onSave,
  onDiscard,
  saving = false,
  discarding = false,
}: Props) {
  return (
    <Flex
      role="region"
      aria-label="Unsaved changes"
      data-testid="playlist-unsaved-bar"
      position="sticky"
      top={{ base: "calc(var(--safe-top) + var(--header-h))", md: 0 }}
      // Under the phone header (80), over the rows and their menus.
      zIndex={70}
      align="center"
      gap={{ base: 2, md: 3 }}
      wrap="wrap"
      mb={{ base: 3, md: 4 }}
      px={{ base: 3, md: 4 }}
      py={2}
      bg="status.analysis.subtle"
      borderWidth="outline"
      borderColor="border.ink"
      borderRadius="md"
      boxShadow="md"
    >
      <StatusTag tone="analysis" size="sm" flexShrink={0}>
        Unsaved
      </StatusTag>
      <Text
        role="status"
        flex="1"
        minW={0}
        fontSize="sm"
        fontWeight="medium"
        color="status.analysis.fg"
        data-testid="playlist-unsaved-summary"
      >
        {summary}
      </Text>
      <Flex gap={2} flexShrink={0}>
        {onDiscard && (
          <Button
            size="sm"
            variant="outline"
            bg="bg"
            minH={{ base: "44px", md: "auto" }}
            loading={discarding}
            disabled={saving}
            onClick={onDiscard}
          >
            Discard
          </Button>
        )}
        {onSave && (
          <Button
            size="sm"
            variant="solid"
            colorPalette="accent"
            display={{ base: "none", md: "inline-flex" }}
            loading={saving}
            disabled={discarding}
            onClick={onSave}
          >
            Save changes
          </Button>
        )}
      </Flex>
    </Flex>
  );
}

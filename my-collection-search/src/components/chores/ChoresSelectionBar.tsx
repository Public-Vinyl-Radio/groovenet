"use client";

import React from "react";
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { choresCliHint, selectionLabel } from "./choresWording";

type Props = {
  selected: number;
  /** The pulled stack's number while the selection is that stack; null for an ad-hoc pick. */
  stackNo: number | null;
  onClear: () => void;
  clearing?: boolean;
  /** Opens the log care modal; LOG CARE is disabled without it. */
  onLogCare?: () => void;
};

/**
 * The bar at the foot of the Chores queue (#943). Desktop: a floating outlined
 * card, sticky above the player, with the terminal hint for a pulled stack.
 * Phone: edge to edge above the tab bar, shown only while something is selected.
 */
export default function ChoresSelectionBar({
  selected,
  stackNo,
  onClear,
  clearing,
  onLogCare,
}: Props) {
  const hasSelection = selected > 0;
  return (
    <Flex
      data-testid="chores-selection-bar"
      role="region"
      aria-label="Selection"
      position="sticky"
      zIndex={10}
      bottom={{ base: "var(--chrome-bottom, 0px)", md: "calc(var(--chrome-bottom, 0px) + 20px)" }}
      display={{ base: hasSelection ? "flex" : "none", md: "flex" }}
      minH={{ base: "auto", md: "60px" }}
      mx={{ base: -4, md: 0 }}
      mr={{ md: "6px" }}
      px={{ base: 4, md: 0 }}
      pl={{ md: 4 }}
      pr={{ md: 2 }}
      py={{ base: "10px", md: 2 }}
      align="center"
      gap={{ base: "10px", md: 3 }}
      borderWidth={{ base: 0, md: "outline" }}
      borderTopWidth="outline"
      borderColor="border.ink"
      bg="bg"
      boxShadow={{ base: "none", md: "md" }}
    >
      <Flex direction="column" flex="1" minW={0} gap="2px">
        <Text
          as="span"
          fontFamily={hasSelection ? "mono" : "body"}
          fontSize={hasSelection ? "13px" : "15px"}
          fontWeight={hasSelection ? "semibold" : "normal"}
          letterSpacing={hasSelection ? { base: "0.04em", md: "0.06em" } : "normal"}
          color={hasSelection ? "fg" : "fg.muted"}
        >
          <Box as="span" display={{ base: "none", md: "inline" }}>
            {selectionLabel(selected, stackNo, "desktop")}
          </Box>
          <Box as="span" display={{ base: "inline", md: "none" }}>
            {selectionLabel(selected, stackNo, "phone")}
          </Box>
        </Text>
        {hasSelection && stackNo !== null && (
          <Text
            display={{ base: "none", md: "block" }}
            fontFamily="mono"
            fontSize="11px"
            color="fg.muted"
            truncate
          >
            or from the terminal:{" "}
            <Text as="code" color="fg">
              {choresCliHint(stackNo)}
            </Text>
          </Text>
        )}
      </Flex>
      {hasSelection && (
        <>
          <Button variant="outline" size="sm" h="44px" onClick={onClear} loading={clearing}>
            CLEAR
          </Button>
          <Button variant="solid" size="sm" h="44px" onClick={onLogCare} disabled={!onLogCare}>
            LOG CARE →
          </Button>
        </>
      )}
    </Flex>
  );
}

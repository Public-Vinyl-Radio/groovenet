"use client";

import React from "react";
import { Flex, IconButton, Popover, Portal, Text } from "@chakra-ui/react";
import { FiX } from "react-icons/fi";
import { FiltersButton } from "@/components/layout/ListHeader";
import { FiltersFooter, overline } from "@/components/ui/RetroModalParts";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The list it filters, for the label strip: "Albums" reads `ALBUMS · 4 ACTIVE`. */
  scope: string;
  activeCount: number;
  onReset: () => void;
  /** The primary button: "Show 81 albums". */
  showLabel: string;
  /** The same sections as the phone modal. */
  children: React.ReactNode;
};

/**
 * The desktop filters panel (#794): the FILTERS button and, anchored under
 * it, the phone modal's shell at 460px — an ink label strip, the same
 * sections, and a fixed Reset + "Show N …" footer. Esc or a click outside
 * closes it and focus goes back to FILTERS.
 */
export default function FiltersPanel({ open, onOpenChange, scope, activeCount, onReset, showLabel, children }: Props) {
  return (
    <Popover.Root
      open={open}
      onOpenChange={(details) => onOpenChange(details.open)}
      positioning={{ placement: "bottom-end", offset: { mainAxis: 8 } }}
      lazyMount
      unmountOnExit
    >
      <Popover.Trigger asChild>
        <FiltersButton activeCount={activeCount} />
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content
            data-testid="filters-panel"
            // Named outright: the title's id isn't wired up on a lazily mounted first open.
            aria-label="Filters"
            w="460px"
            maxW="calc(100vw - 32px)"
            maxH="min(680px, var(--available-height))"
            bg="bg"
            display="flex"
            flexDirection="column"
            overflow="hidden"
          >
            <Flex align="center" gap={1} bg="border.ink" color="bg" pl="14px" pr="4px" py="6px" flexShrink={0}>
              <Flex direction="column" flex="1" minW={0}>
                <Text {...overline} fontSize="11px" lineHeight="14px" opacity={0.8}>
                  {activeCount > 0 ? `${scope} · ${activeCount} active` : scope}
                </Text>
                <Popover.Title fontSize="16px" lineHeight="22px" fontWeight="semibold">
                  Filters
                </Popover.Title>
              </Flex>
              <Popover.CloseTrigger asChild position="static">
                <IconButton
                  aria-label="Close filters"
                  variant="ghost"
                  color="bg"
                  boxSize="40px"
                  minW="40px"
                  _hover={{ bg: "transparent", opacity: 0.75 }}
                >
                  <FiX />
                </IconButton>
              </Popover.CloseTrigger>
            </Flex>
            <Popover.Body p={0} flex="1" minH={0} overflowY="auto">
              {children}
            </Popover.Body>
            <Popover.Footer p={0} flexShrink={0} display="block" borderTopWidth="outline" borderColor="border.ink">
              <FiltersFooter
                activeCount={activeCount}
                onReset={onReset}
                showLabel={showLabel}
                onShow={() => onOpenChange(false)}
              />
            </Popover.Footer>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

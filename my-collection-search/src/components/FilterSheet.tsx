"use client";

import React, { useState } from "react";
import {
  Badge,
  Button,
  CloseButton,
  Drawer,
  Heading,
  Portal,
  Stack,
} from "@chakra-ui/react";
import { LuSlidersHorizontal } from "react-icons/lu";

type FilterSheetProps = {
  /** Filters on, shown on the button. */
  count: number;
  /** Omit to hide Clear all. */
  onClearAll?: () => void;
  children: React.ReactNode;
};

/**
 * Every search filter behind one button on phones (#447), in a sheet from the
 * bottom, where a row of dropdowns would wrap and push the results down.
 * Changes apply as they're made, so the results behind it keep up; the active
 * filters still show as chips under the search box.
 */
export default function FilterSheet({ count, onClearAll, children }: FilterSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer.Root
      placement="bottom"
      // Mounted only while open, so its controls don't double the page's.
      lazyMount
      unmountOnExit
      open={open}
      onOpenChange={(details) => setOpen(details.open)}
    >
      <Drawer.Trigger asChild>
        <Button
          size="xs"
          variant="outline"
          flexShrink={0}
          aria-label={count > 0 ? `Filters, ${count} on` : "Filters"}
        >
          <LuSlidersHorizontal />
          Filters
          {count > 0 && (
            <Badge size="xs" colorPalette="blue" variant="solid" borderRadius="full">
              {count}
            </Badge>
          )}
        </Button>
      </Drawer.Trigger>
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content roundedTop="xl" maxH="85dvh">
            <Drawer.Header>
              <Drawer.Title>Filters</Drawer.Title>
            </Drawer.Header>
            <Drawer.Body>
              <Stack gap={6}>{children}</Stack>
            </Drawer.Body>
            <Drawer.Footer>
              {onClearAll && (
                <Button variant="ghost" onClick={onClearAll}>
                  Clear all
                </Button>
              )}
              <Button onClick={() => setOpen(false)}>Done</Button>
            </Drawer.Footer>
            <Drawer.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Drawer.CloseTrigger>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}

/** A titled group of controls in the sheet. */
export function FilterSheetSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack gap={3}>
      <Heading as="h3" size="sm">
        {title}
      </Heading>
      {children}
    </Stack>
  );
}

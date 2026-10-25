"use client";

import React from "react";
import { SimpleGrid } from "@chakra-ui/react";

export const PLAYLIST_GRID_COLUMNS = { base: 1, md: 2, xl: 3 } as const;

/**
 * One month's cards. Cards keep their own height and align to the top, so a
 * tall set card never stretches its neighbours. The right and bottom padding
 * leaves room for the cards' 6px hard shadow, which an overflow clip would cut.
 */
export default function PlaylistMonthGrid({
  list = false,
  children,
}: {
  /** List view: a single column. */
  list?: boolean;
  children: React.ReactNode;
}) {
  return (
    <SimpleGrid
      data-testid="month-grid"
      columns={list ? 1 : PLAYLIST_GRID_COLUMNS}
      gap={{ base: 3, md: 5 }}
      alignItems="start"
      pr="6px"
      pb="6px"
    >
      {children}
    </SimpleGrid>
  );
}

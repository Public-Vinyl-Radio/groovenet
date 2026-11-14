"use client";

import React from "react";
import { Grid, type GridProps } from "@chakra-ui/react";

/** A full album card's usual height, for skeletons and empty slots beside one. */
export const ALBUM_CARD_MIN_H = { base: "136px", md: "148px" } as const;

/**
 * The grid for full album cards (`AlbumResult layout="card"`): one column on
 * phones, two from `md`, a 20px column gap, and room for the cards' 6px hard
 * shadow. Each card carries a 14px mb, so rows only top that up on desktop.
 * The Albums page GRID, a genre's Albums tab and the artist page share it;
 * props override the defaults (the genre index turns phones into a scroller).
 */
export default function AlbumCardGrid({ children, ...props }: GridProps) {
  return (
    <Grid
      data-testid="album-card-grid"
      templateColumns={{ base: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }}
      columnGap={5}
      rowGap={{ base: 0, md: "6px" }}
      pr="6px"
      pb="6px"
      {...props}
    >
      {children}
    </Grid>
  );
}

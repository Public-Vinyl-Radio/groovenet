"use client";

import React from "react";
import { Box, Grid, Stack } from "@chakra-ui/react";

type Props = {
  header: React.ReactNode;
  /** #1246: what to try after the first import; absent once dismissed. */
  checklist?: React.ReactNode;
  /** Renders nothing when nothing is playing; the gap closes up. */
  nowPlaying?: React.ReactNode;
  /** #882: albums added in the last 30 days. */
  newArrivals?: React.ReactNode;
  month: React.ReactNode;
  /** #883: missing audio, missing BPM or key, due for cleaning, failed jobs. */
  attention?: React.ReactNode;
  /** #884: the draft set and recent playlists. */
  playlists?: React.ReactNode;
};

/**
 * Home's sections in the mock's order (HomeDesktop / HomePhone). From `lg` up,
 * two columns: New arrivals over Playlists & sets on the left, the month card
 * over Needs attention on the right, so neither column waits on the other.
 * Phones read source order (New arrivals, month, attention, Playlists) in one
 * column.
 *
 * The source order is the phone order and never changes. From `lg` the grid
 * places the children explicitly: the right stack spans both rows of column 2,
 * and the second row is `1fr` so spare height never opens a gap between the
 * left cards. Without New arrivals, Playlists takes row 1 and the grid has one
 * row.
 */
export default function HomeLayout({
  header,
  checklist,
  nowPlaying,
  newArrivals,
  month,
  attention,
  playlists,
}: Props) {
  const leftRows = newArrivals && playlists ? 2 : 1;
  return (
    <Box pb={8}>
      {header}
      {/* PageHeader brings 16px below it; desktop tops that up to the mock's 28px. */}
      <Stack gap={{ base: "22px", md: "28px" }} mt={{ md: 3 }}>
        {checklist}
        {nowPlaying}
        <Grid
          templateColumns={{ base: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" }}
          columnGap="32px"
          rowGap={{ base: "22px", md: "28px" }}
          templateRows={{ lg: leftRows === 2 ? "auto 1fr" : "auto" }}
          alignItems="start"
        >
          {newArrivals ? (
            <Box data-slot="new-arrivals" gridColumn={{ lg: 1 }} gridRow={{ lg: 1 }}>
              {newArrivals}
            </Box>
          ) : null}
          <Stack
            gap={{ base: "22px", md: "28px" }}
            gridColumn={{ lg: 2 }}
            gridRow={{ lg: `1 / span ${leftRows}` }}
          >
            {month}
            {attention}
          </Stack>
          {playlists ? (
            <Box
              data-slot="playlists"
              gridColumn={{ lg: 1 }}
              gridRow={{ lg: newArrivals ? 2 : 1 }}
              minW={0}
            >
              {playlists}
            </Box>
          ) : null}
        </Grid>
      </Stack>
    </Box>
  );
}

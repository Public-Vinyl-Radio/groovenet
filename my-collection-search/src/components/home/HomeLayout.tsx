"use client";

import React from "react";
import { Box, Grid, Stack } from "@chakra-ui/react";

type Props = {
  header: React.ReactNode;
  /** Renders nothing when nothing is playing; the gap closes up. */
  nowPlaying?: React.ReactNode;
  /** #882: albums added in the last 30 days. */
  newArrivals?: React.ReactNode;
  month: React.ReactNode;
  /** #883: missing audio, missing BPM or key, due for cleaning, failed jobs. */
  attention?: React.ReactNode;
  /** #884: the draft set and recent playlists, full width. */
  playlists?: React.ReactNode;
};

/**
 * Home's sections in the mock's order (HomeDesktop / HomePhone). From `lg` up,
 * two columns: New arrivals on the left, the month card over Needs attention
 * on the right, Playlists & sets across both. Phones read the same order in
 * one column.
 */
export default function HomeLayout({
  header,
  nowPlaying,
  newArrivals,
  month,
  attention,
  playlists,
}: Props) {
  return (
    <Box pb={8}>
      {header}
      {/* PageHeader brings 16px below it; desktop tops that up to the mock's 28px. */}
      <Stack gap={{ base: "22px", md: "28px" }} mt={{ md: 3 }}>
        {nowPlaying}
        <Grid
          templateColumns={{ base: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" }}
          columnGap="32px"
          rowGap={{ base: "22px", md: "28px" }}
          alignItems="start"
        >
          {newArrivals ? <Box data-slot="new-arrivals">{newArrivals}</Box> : null}
          <Stack gap={{ base: "22px", md: "28px" }} gridColumn={{ lg: 2 }}>
            {month}
            {attention}
          </Stack>
          {playlists ? (
            <Box data-slot="playlists" gridColumn="1 / -1">
              {playlists}
            </Box>
          ) : null}
        </Grid>
      </Stack>
    </Box>
  );
}

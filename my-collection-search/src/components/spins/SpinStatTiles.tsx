"use client";

import React from "react";
import { Box, Grid, Text } from "@chakra-ui/react";
import type { SpinRecapResponse } from "@/services/internalApi/spins";
import { describeChange, formatRecapHours, monthWord } from "./recapCharts";

type Stats = SpinRecapResponse["stats"];

type Props = {
  stats: Stats | null;
  /** The month before, on the recap page: adds "+N VS SEP" under each value. */
  previousMonth?: string;
  /** A standalone block (the recap page) rather than a row inside the strip's frame. */
  framed?: boolean;
};

const STATS = [
  ["SPINS", "spins"],
  ["HOURS", "hours"],
  ["RECORDS PULLED", "records_pulled"],
  ["NEW TO ROTATION", "new_to_rotation"],
] as const;

/** Spins, hours, records pulled, new to rotation: two by two on phones, a row from `md`. */
export default function SpinStatTiles({ stats, previousMonth, framed = false }: Props) {
  const noPrevious = stats ? stats.spins.previous === 0 : false;
  return (
    <Grid
      as="dl"
      templateColumns={{ base: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }}
      borderTopWidth="outline"
      borderInlineWidth={framed ? "outline" : { base: 0, md: "outline" }}
      borderBottomWidth={framed ? "outline" : { base: 0, md: "outline" }}
      borderColor="border.ink"
      boxShadow={framed ? "md" : { base: "none", md: "md" }}
      mr={framed ? "6px" : { md: "6px" }}
    >
      {STATS.map(([label, key], index) => {
        const stat = stats?.[key];
        const hours = key === "hours";
        const value = !stats
          ? "–"
          : hours
            ? formatRecapHours(stats.hours.value, stats.hours_known_share)
            : String(stat!.value);
        const change = (word: string) =>
          describeChange(stat!.value, stat!.previous, word, { hours, noPrevious });
        return (
          <Box
            key={label}
            px={{ base: 3, md: 4 }}
            py={{ base: 2.5, md: 3 }}
            borderLeftWidth={{
              base: index % 2 ? "outline" : 0,
              md: index ? "outline" : 0,
            }}
            borderTopWidth={{ base: index > 1 ? "outline" : 0, md: 0 }}
            borderColor="border.ink"
          >
            <Text
              as="dt"
              fontFamily="mono"
              fontSize={{ base: "10px", md: "11px" }}
              letterSpacing="0.08em"
              color="fg.muted"
            >
              {label}
            </Text>
            <Text
              as="dd"
              mt="2px"
              fontFamily="mono"
              fontSize={{ base: "22px", md: "26px" }}
              lineHeight={{ base: "28px", md: "32px" }}
              fontWeight="semibold"
            >
              {value}
            </Text>
            {previousMonth && stat && (
              <Text
                as="dd"
                fontFamily="mono"
                fontSize={{ base: "10px", md: "11px" }}
                letterSpacing={{ base: "0.04em", md: "0.06em" }}
                color="fg.muted"
              >
                <Box as="span" display={{ base: "inline", md: "none" }}>
                  {change(monthWord(previousMonth))}
                </Box>
                <Box as="span" display={{ base: "none", md: "inline" }}>
                  {change(monthWord(previousMonth, false))}
                </Box>
              </Text>
            )}
          </Box>
        );
      })}
    </Grid>
  );
}

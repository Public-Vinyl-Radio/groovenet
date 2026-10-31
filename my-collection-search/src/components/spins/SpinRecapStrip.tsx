"use client";

import React from "react";
import NextLink from "next/link";
import { Box, Flex, Grid, Heading, HStack, Link, Stack, Text } from "@chakra-ui/react";
import type { SpinRecapResponse } from "@/services/internalApi/spins";
import { genreTint } from "./recapCharts";
import { Bar, DIGITAL_HATCH, inkTint, Overline, SplitSegments, Swatch } from "./recapParts";
import { formatMonthName } from "./spinMonth";
import SpinStatTiles from "./SpinStatTiles";

type Genre = SpinRecapResponse["genre_mix"]["current"][number];

// A phone names this many genres and counts the rest.
const PHONE_GENRE_LIMIT = 3;

/** "LATIN · ROCK · ELECTRONIC · +3". */
export function summarizeGenres(genres: Genre[], limit = PHONE_GENRE_LIMIT): string {
  const names = genres.slice(0, limit).map((genre) => genre.name.toUpperCase());
  const rest = genres.length - limit;
  return [...names, ...(rest > 0 ? [`+${rest}`] : [])].join(" · ");
}

type Props = {
  month: string;
  /** True for this month, which is still going: "OCTOBER SO FAR". */
  current: boolean;
  recap: SpinRecapResponse | null;
};

/** The month at a glance: four stats, the vinyl/digital split and the genre mix. */
export default function SpinRecapStrip({ month, current, recap }: Props) {
  const monthName = formatMonthName(month);
  const vinyl = recap?.split.vinyl ?? 0;
  const digital = recap?.split.digital ?? 0;
  const genres = recap?.genre_mix.current ?? [];
  const recapHref = `/spins/recap/${month}`;

  return (
    <Box
      as="section"
      aria-labelledby="spin-recap-heading"
      borderWidth={{ base: "outline", md: 0 }}
      borderColor="border.ink"
      boxShadow={{ base: "md", md: "none" }}
      mr={{ base: "6px", md: 0 }}
    >
      <Link
        asChild
        display={{ base: "flex", md: "none" }}
        h="44px"
        px={3}
        alignItems="center"
        justifyContent="space-between"
        bg="fg"
        color="bg"
        textDecoration="none"
        fontFamily="mono"
        fontSize="xs"
        fontWeight="semibold"
        letterSpacing="0.06em"
        _hover={{ textDecoration: "none" }}
      >
        <NextLink href={recapHref}>
          <span>{current ? `${monthName} SO FAR` : `${monthName} RECAP`}</span>
          <span>FULL RECAP →</span>
        </NextLink>
      </Link>
      <Heading as="h2" id="spin-recap-heading" srOnly>
        {monthName} recap
      </Heading>

      <SpinStatTiles stats={recap?.stats ?? null} />

      <Grid
        templateColumns={{ base: "1fr", md: "minmax(0, 1fr) minmax(0, 2fr)" }}
        gap={{ base: 3, md: 8 }}
        p={{ base: 3, md: 0 }}
        pt={{ md: 4.5 }}
        pr={{ md: "6px" }}
        borderTopWidth={{ base: "outline", md: 0 }}
        borderColor="border.ink"
      >
        <Stack as="section" aria-labelledby="spin-split-heading" gap={2}>
          <Overline id="spin-split-heading">VINYL / DIGITAL</Overline>
          <Bar label={`Vinyl ${vinyl} spins, digital ${digital} spins`}>
            <SplitSegments vinyl={vinyl} digital={digital} />
          </Bar>
          <HStack
            gap={{ base: 2, md: 4.5 }}
            fontFamily="mono"
            fontSize={{ base: "11px", md: "xs" }}
            color={{ base: "fg.muted", md: "fg" }}
          >
            <HStack gap={1.5}>
              <Box display={{ base: "none", md: "block" }}>
                <Swatch bg="var(--gn-ink)" />
              </Box>
              <span>VINYL {vinyl}</span>
            </HStack>
            <Box as="span" display={{ base: "inline", md: "none" }} aria-hidden="true">
              ·
            </Box>
            <HStack gap={1.5}>
              <Box display={{ base: "none", md: "block" }}>
                <Swatch bg={DIGITAL_HATCH} />
              </Box>
              <span>DIGITAL {digital}</span>
            </HStack>
          </HStack>
        </Stack>

        <Stack as="section" aria-labelledby="spin-genre-heading" gap={2}>
          <Overline id="spin-genre-heading">
            GENRE MIX
            <Box as="span" display={{ base: "none", md: "inline" }}>
              {" "}
              THIS MONTH
            </Box>
          </Overline>
          {genres.length === 0 ? (
            <Text fontSize="13px" color="fg.muted">
              No genres yet.
            </Text>
          ) : (
            <>
              <Bar label={genres.map((g) => `${g.name} ${Math.round(g.share * 100)}%`).join(", ")}>
                {genres.map((genre, index) => (
                  <Box
                    key={genre.genre_id ?? genre.name}
                    flex={genre.share}
                    borderRightWidth={index < genres.length - 1 ? "outline" : 0}
                    borderColor="border.ink"
                    style={{
                      background: inkTint(genreTint(index)),
                    }}
                  />
                ))}
              </Bar>
              <Flex
                as="ul"
                listStyleType="none"
                display={{ base: "none", md: "flex" }}
                wrap="wrap"
                columnGap={4.5}
                rowGap={1}
                data-testid="genre-legend"
              >
                {genres.map((genre, index) => (
                  <HStack as="li" key={genre.genre_id ?? genre.name} gap={1.5} fontSize="13px">
                    <Swatch bg={inkTint(genreTint(index))} />
                    <span>{genre.name}</span>
                    <Text as="span" fontFamily="mono" fontSize="11px" color="fg.muted">
                      {Math.round(genre.spins)}
                    </Text>
                  </HStack>
                ))}
              </Flex>
              <Text
                display={{ base: "block", md: "none" }}
                fontFamily="mono"
                fontSize="11px"
                color="fg.muted"
                data-testid="genre-summary"
              >
                {summarizeGenres(genres)}
              </Text>
            </>
          )}
        </Stack>
      </Grid>
    </Box>
  );
}

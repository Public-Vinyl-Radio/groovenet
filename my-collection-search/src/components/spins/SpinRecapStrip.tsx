"use client";

import React from "react";
import NextLink from "next/link";
import { Box, Flex, Grid, Heading, HStack, Link, Stack, Text } from "@chakra-ui/react";
import type { SpinRecapResponse } from "@/services/internalApi/spins";
import { formatMonthName } from "./spinMonth";

type Genre = SpinRecapResponse["genre_mix"]["current"][number];

// The genre bar shades ink into the ground, darkest first, so it follows the
// palette and reads without colour; genres past the last step reuse it.
const GENRE_TINTS = [100, 70, 50, 34, 20, 8];
// A phone names this many genres and counts the rest.
const PHONE_GENRE_LIMIT = 3;

const inkTint = (percent: number) =>
  `color-mix(in srgb, var(--gn-ink) ${percent}%, var(--gn-ground))`;
const DIGITAL_HATCH = "repeating-linear-gradient(135deg, var(--gn-ink) 0 2px, transparent 2px 7px)";

/** Whole hours from 10 up, one decimal below; "≈" when some spins had no duration. */
export function formatRecapHours(hours: number, knownShare: number): string {
  const rounded = hours >= 10 ? Math.round(hours) : Math.round(hours * 10) / 10;
  return `${knownShare < 1 ? "≈" : ""}${rounded}`;
}

/** "LATIN · ROCK · ELECTRONIC · +3". */
export function summarizeGenres(genres: Genre[], limit = PHONE_GENRE_LIMIT): string {
  const names = genres.slice(0, limit).map((genre) => genre.name.toUpperCase());
  const rest = genres.length - limit;
  return [...names, ...(rest > 0 ? [`+${rest}`] : [])].join(" · ");
}

function Overline({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <Heading
      as="h3"
      id={id}
      fontFamily="mono"
      fontSize={{ base: "10px", md: "xs" }}
      fontWeight="semibold"
      letterSpacing="0.08em"
    >
      {children}
    </Heading>
  );
}

function Bar({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Flex
      role="img"
      aria-label={label}
      h={{ base: "20px", md: "24px" }}
      borderWidth="outline"
      borderColor="border.ink"
      boxShadow={{ base: "none", md: "sm" }}
      overflow="hidden"
    >
      {children}
    </Flex>
  );
}

function Swatch({ bg }: { bg: string }) {
  return (
    <Box
      as="span"
      aria-hidden="true"
      display="inline-block"
      boxSize="10px"
      flexShrink={0}
      borderWidth="outline"
      borderColor="border.ink"
      style={{ background: bg }}
    />
  );
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
  const stats = recap?.stats;
  const values: Array<[string, string]> = [
    ["SPINS", stats ? String(stats.spins.value) : "–"],
    ["HOURS", stats ? formatRecapHours(stats.hours.value, stats.hours_known_share) : "–"],
    ["RECORDS PULLED", stats ? String(stats.records_pulled.value) : "–"],
    ["NEW TO ROTATION", stats ? String(stats.new_to_rotation.value) : "–"],
  ];
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

      <Grid
        as="dl"
        templateColumns={{ base: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }}
        borderTopWidth="outline"
        borderInlineWidth={{ base: 0, md: "outline" }}
        borderBottomWidth={{ base: 0, md: "outline" }}
        borderColor="border.ink"
        boxShadow={{ base: "none", md: "md" }}
        mr={{ md: "6px" }}
      >
        {values.map(([label, value], index) => (
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
          </Box>
        ))}
      </Grid>

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
            {vinyl > 0 && (
              <Box
                flex={vinyl}
                bg="fg"
                borderRightWidth={digital > 0 ? "outline" : 0}
                borderColor="border.ink"
              />
            )}
            {digital > 0 && <Box flex={digital} style={{ background: DIGITAL_HATCH }} />}
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
                      background: inkTint(GENRE_TINTS[Math.min(index, GENRE_TINTS.length - 1)]),
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
                    <Swatch bg={inkTint(GENRE_TINTS[Math.min(index, GENRE_TINTS.length - 1)])} />
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

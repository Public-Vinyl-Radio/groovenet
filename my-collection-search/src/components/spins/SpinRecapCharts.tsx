"use client";

import React from "react";
import NextLink from "next/link";
import { Box, Flex, Grid, HStack, Link, Stack, Tabs, Text } from "@chakra-ui/react";
import { FiChevronRight } from "react-icons/fi";
import { artistHref } from "@/components/ArtistLink";
import type { SpinRecapResponse } from "@/services/internalApi/spins";
import {
  alignGenreMix,
  bpmCaption,
  busiestCaption,
  describeBpm,
  describeHeatmap,
  describeShares,
  genreDelta,
  HEAT_TINTS,
  heatLevels,
  monthWord,
  percent,
  recapWeeks,
  relativeWidths,
  WEEKDAYS,
} from "./recapCharts";
import { SpinArt } from "./listeningLogParts";
import {
  Bar,
  DIGITAL_HATCH,
  inkTint,
  Overline,
  SectionHeading,
  SplitSegments,
  Swatch,
} from "./recapParts";
import { formatMonthName } from "./spinMonth";

type Recap = SpinRecapResponse;

const mono = { fontFamily: "mono", letterSpacing: "0.04em" } as const;
const captionProps = { fontFamily: "mono", fontSize: "xs" } as const;
const axisProps = { ...mono, fontSize: { base: "10px", md: "11px" }, color: "fg.muted" } as const;

function ChartSection({ title, children }: { title: string; children: React.ReactNode }) {
  const id = React.useId();
  return (
    <Stack as="section" aria-labelledby={id} gap={{ base: 2.5, md: 3 }} minW={0}>
      <SectionHeading id={id}>{title}</SectionHeading>
      {children}
    </Stack>
  );
}

/** Vinyl/digital share of the month, then the same split week by week. */
export function RecapSplit({ month, recap }: { month: string; recap: Recap }) {
  const { vinyl, digital } = recap.split;
  const total = vinyl + digital;
  const weeks = recapWeeks(month, recap.by_week);
  const heights = relativeWidths(weeks.map((week) => week.vinyl + week.digital));
  return (
    <ChartSection title="VINYL / DIGITAL">
      <>
        <Bar
          label={`Vinyl ${vinyl} spins (${percent(vinyl, total)}%), digital ${digital} spins (${percent(digital, total)}%)`}
          h={{ base: "24px", md: "28px" }}
          boxShadow="sm"
        >
          <SplitSegments vinyl={vinyl} digital={digital} />
        </Bar>
        <HStack gap={{ base: 4, md: 4.5 }} fontFamily="mono" fontSize="xs">
          <HStack gap={1.5}>
            <Swatch bg="var(--gn-ink)" />
            <span>VINYL {vinyl}</span>
          </HStack>
          <HStack gap={1.5}>
            <Swatch bg={DIGITAL_HATCH} />
            <span>DIGITAL {digital}</span>
          </HStack>
        </HStack>
        <Box mt={1.5}>
          <Overline>BY WEEK</Overline>
        </Box>
        <Flex
          role="img"
          aria-label={`Spins per week: ${weeks
            .map(
              (week) =>
                `week ${week.week}, ${week.range}: ${week.vinyl} vinyl, ${week.digital} digital`,
            )
            .join("; ")}`}
          h={{ base: "110px", md: "120px" }}
          align="flex-end"
          gap={{ base: 3, md: 4.5 }}
          px={1}
          borderBottomWidth="outline"
          borderColor="border.ink"
        >
          {weeks.map((week, index) =>
            heights[index] > 0 ? (
              <Flex
                key={week.week}
                data-testid="week-bar"
                flex="1"
                direction="column"
                h={`${heights[index]}%`}
                borderWidth="outline"
                borderBottomWidth={0}
                borderColor="border.ink"
              >
                <Box flex={week.digital} style={{ background: DIGITAL_HATCH }} />
                <Box flex={week.vinyl} bg="fg" />
              </Flex>
            ) : (
              <Box key={week.week} data-testid="week-bar" flex="1" />
            ),
          )}
        </Flex>
        <Flex gap={{ base: 3, md: 4.5 }} px={1} {...axisProps}>
          {weeks.map((week) => (
            <Text as="span" key={week.week} flex="1" textAlign="center" title={week.range}>
              {week.label}
            </Text>
          ))}
        </Flex>
      </>
    </ChartSection>
  );
}

/** This month's genre mix over last month's, and a legend of changes that links to each genre. */
export function RecapGenreMix({
  month,
  previousMonth,
  recap,
}: {
  month: string;
  previousMonth: string;
  recap: Recap;
}) {
  const mix = alignGenreMix(recap.genre_mix.current, recap.genre_mix.previous);
  const name = (value: string) => {
    const word = formatMonthName(value);
    return word.charAt(0) + word.slice(1).toLowerCase();
  };
  const rowLabel = (text: string, current: boolean) => (
    <Text
      as="span"
      fontFamily="mono"
      fontSize={{ base: "11px", md: "xs" }}
      fontWeight={current ? "semibold" : "normal"}
      color={current ? "fg" : "fg.muted"}
    >
      {text}
    </Text>
  );
  return (
    <ChartSection title="GENRE MIX">
      <>
        <Grid templateColumns={{ base: "36px 1fr", md: "44px 1fr" }} alignItems="center" gap={3}>
          {rowLabel(monthWord(month), true)}
          <Bar
            label={`${name(month)} spins by top-level genre: ${describeShares(mix.rows)}`}
            h={{ base: "24px", md: "28px" }}
            boxShadow="sm"
          >
            {mix.rows.map((row, index) => (
              <Box
                key={row.key}
                flex={row.share}
                borderRightWidth={index < mix.rows.length - 1 ? "outline" : 0}
                borderColor="border.ink"
                style={{ background: inkTint(row.tint) }}
              />
            ))}
          </Bar>
          {rowLabel(monthWord(previousMonth), false)}
          {mix.previous ? (
            <Bar
              label={`${name(previousMonth)} spins by top-level genre: ${describeShares(mix.previous)}`}
              h={{ base: "24px", md: "28px" }}
              boxShadow="none"
            >
              {mix.previous.map((row, index, all) => (
                <Box
                  key={row.key}
                  flex={row.share}
                  borderRightWidth={index < all.length - 1 ? "outline" : 0}
                  borderColor="border.ink"
                  style={{ background: inkTint(row.tint) }}
                />
              ))}
            </Bar>
          ) : (
            <Text fontSize="13px" color="fg.muted">
              No spins in {name(previousMonth)} to compare.
            </Text>
          )}
        </Grid>
        <Grid
          as="ul"
          listStyleType="none"
          mt={{ base: 0.5, md: 1 }}
          templateColumns={{ base: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }}
          columnGap={6}
          rowGap={{ base: 0, md: "2px" }}
        >
          {mix.rows.map((row) => {
            const delta = genreDelta(row.share, row.previousShare);
            const spoken = `${row.name}, ${Math.round(row.spins)} spins${mix.previous ? `, ${delta.label}` : ""}`;
            const content = (
              <>
                <Swatch bg={inkTint(row.tint)} size="12px" />
                <Text as="span" flex="1" minW={0} truncate>
                  {row.name}
                </Text>
                <Text as="span" fontFamily="mono" fontSize="xs" color="fg.muted">
                  {Math.round(row.spins)}
                </Text>
                {mix.previous && (
                  <Text
                    as="span"
                    w="60px"
                    textAlign="right"
                    fontFamily="mono"
                    fontSize="xs"
                    fontWeight="semibold"
                  >
                    {delta.text}
                  </Text>
                )}
              </>
            );
            const rowProps = {
              minH: "44px",
              display: "flex",
              alignItems: "center",
              gap: { base: 2.5, md: 2 },
              color: "fg",
              fontSize: { base: "15px", md: "sm" },
            } as const;
            return (
              <Box
                as="li"
                key={row.key}
                borderTopWidth={{ base: "rule", md: 0 }}
                borderColor="border"
              >
                {row.genreId ? (
                  <Link
                    asChild
                    {...rowProps}
                    textDecoration="none"
                    _hover={{ bg: "bg.muted", textDecoration: "none" }}
                  >
                    <NextLink
                      href={`/genres/${encodeURIComponent(row.genreId)}`}
                      aria-label={spoken}
                    >
                      {content}
                      <Box as="span" display={{ base: "inline-flex", md: "none" }}>
                        <FiChevronRight aria-hidden="true" />
                      </Box>
                    </NextLink>
                  </Link>
                ) : (
                  <Box {...rowProps} pr={{ base: "22px", md: 0 }}>
                    <Box as="span" srOnly>
                      {spoken}
                    </Box>
                    <Box as="span" display="contents" aria-hidden="true">
                      {content}
                    </Box>
                  </Box>
                )}
              </Box>
            );
          })}
        </Grid>
      </>
    </ChartSection>
  );
}

type TopRow = {
  key: string;
  name: string;
  sub?: string;
  /** Undefined for a list without covers (artists). */
  cover?: string | null;
  href: string;
  spins: number;
};

const TOP_LISTS = [
  { value: "records", label: "RECORDS" },
  { value: "tracks", label: "TRACKS" },
  { value: "artists", label: "ARTISTS" },
] as const;
type TopListKey = (typeof TOP_LISTS)[number]["value"];

function topRows(recap: Recap, friendId: number): Record<TopListKey, TopRow[]> {
  const scope = `?friend_id=${friendId}`;
  return {
    records: recap.top_records.map((record) => ({
      key: record.release_id,
      name: record.title,
      sub: record.artist,
      cover: record.thumbnail,
      href: `/albums/${encodeURIComponent(record.release_id)}${scope}`,
      spins: record.spins,
    })),
    tracks: recap.top_tracks.map((track) => ({
      key: track.track_id,
      name: track.title,
      sub: track.artist,
      cover: track.thumbnail,
      href: `/tracks/${encodeURIComponent(track.track_id)}${scope}`,
      spins: track.spins,
    })),
    artists: recap.top_artists.map((artist) => ({
      key: artist.artist,
      name: artist.artist,
      href: artistHref(artist.artist, friendId),
      spins: artist.spins,
    })),
  };
}

function TopList({ rows, label }: { rows: TopRow[]; label: string }) {
  const widths = relativeWidths(rows.map((row) => row.spins));
  if (rows.length === 0) {
    return (
      <Text px={3.5} py={4} fontSize="sm" color="fg.muted">
        Nothing yet.
      </Text>
    );
  }
  return (
    <Box as="ol" listStyleType="none" py={1} aria-label={label}>
      {rows.map((row, index) => (
        <li key={row.key}>
          <Link
            asChild
            minH={{ base: "60px", md: "58px" }}
            px={{ base: 3, md: 3.5 }}
            py={1.5}
            display="flex"
            alignItems="center"
            gap={3}
            color="fg"
            textDecoration="none"
            _hover={{ bg: "bg.muted", textDecoration: "none" }}
          >
            <NextLink
              href={row.href}
              aria-label={`${index + 1}. ${[row.name, row.sub].filter(Boolean).join(", ")}, ${row.spins} spins`}
            >
              <Flex
                as="span"
                w="26px"
                h="22px"
                flexShrink={0}
                align="center"
                justify="center"
                borderWidth="outline"
                borderColor="border.ink"
                bg={index === 0 ? "fg" : undefined}
                color={index === 0 ? "bg" : "fg"}
                fontFamily="mono"
                fontSize="11px"
                fontWeight="semibold"
              >
                {index + 1}
              </Flex>
              {row.cover !== undefined && (
                <SpinArt src={row.cover} boxSize={{ base: "44px", md: "40px" }} />
              )}
              <Flex as="span" direction="column" gap={1} flex="1" minW={0}>
                <Text
                  as="span"
                  fontSize={{ base: "15px", md: "sm" }}
                  lineHeight={{ base: "20px", md: "18px" }}
                  fontWeight="semibold"
                  truncate
                  title={row.name}
                >
                  {row.name}
                </Text>
                {row.sub && (
                  <Text
                    as="span"
                    fontSize={{ base: "13px", md: "xs" }}
                    lineHeight="16px"
                    color="fg.muted"
                    truncate
                    title={row.sub}
                  >
                    {row.sub}
                  </Text>
                )}
                <Box
                  as="span"
                  aria-hidden="true"
                  display="block"
                  h="6px"
                  borderWidth="rule"
                  borderColor="border.ink"
                >
                  <Box as="span" display="block" h="full" w={`${widths[index]}%`} bg="fg" />
                </Box>
              </Flex>
              <Text
                as="span"
                w="32px"
                textAlign="right"
                fontFamily="mono"
                fontSize="xs"
                color="fg.muted"
              >
                {row.spins}
              </Text>
            </NextLink>
          </Link>
        </li>
      ))}
    </Box>
  );
}

const topFrame = {
  borderWidth: "outline",
  borderColor: "border.ink",
  boxShadow: "md",
  mr: "6px",
  minW: 0,
} as const;
const topHeading = {
  h: { base: "36px", md: "40px" },
  px: { base: 3, md: 3.5 },
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  borderBottomWidth: "outline",
  borderColor: "border.ink",
  fontFamily: "mono",
  fontSize: "xs",
  fontWeight: "semibold",
  letterSpacing: "0.08em",
} as const;

/**
 * Top five records, tracks and artists: side by side when `columns`, otherwise
 * one block with a tablist (phones and narrow windows).
 */
export function RecapTopLists({
  recap,
  friendId,
  columns,
}: {
  recap: Recap;
  friendId: number;
  columns: boolean;
}) {
  const rows = topRows(recap, friendId);
  const headingId = React.useId();

  if (columns) {
    return (
      <Grid templateColumns="repeat(3, minmax(0, 1fr))" gap={7}>
        {TOP_LISTS.map((list) => (
          <Box
            as="section"
            key={list.value}
            aria-labelledby={`${headingId}-${list.value}`}
            {...topFrame}
          >
            <Box as="h2" id={`${headingId}-${list.value}`} {...topHeading}>
              TOP {list.label}
              <Text as="span" fontWeight="normal" color="fg.muted" aria-hidden="true">
                SPINS
              </Text>
            </Box>
            <TopList rows={rows[list.value]} label={`Top ${list.label.toLowerCase()}`} />
          </Box>
        ))}
      </Grid>
    );
  }

  return (
    <Box as="section" aria-labelledby={headingId} {...topFrame}>
      <Box as="h2" id={headingId} {...topHeading}>
        TOP OF THE MONTH
      </Box>
      <Tabs.Root defaultValue="records" activationMode="automatic">
        <Tabs.List
          aria-label="Top lists"
          gap={0}
          display="grid"
          gridTemplateColumns="repeat(3, minmax(0, 1fr))"
          borderBottomWidth="outline"
          borderColor="border.ink"
        >
          {TOP_LISTS.map((list, index) => (
            <Tabs.Trigger
              key={list.value}
              value={list.value}
              justifyContent="center"
              h="44px"
              ml={index ? "-2px" : 0}
              fontSize="xs"
              letterSpacing="0.06em"
            >
              {list.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {TOP_LISTS.map((list) => (
          <Tabs.Content key={list.value} value={list.value} p={0}>
            <TopList rows={rows[list.value]} label={`Top ${list.label.toLowerCase()}`} />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </Box>
  );
}

const HOUR_TICKS = ["12A", "4A", "8A", "12P", "4P", "8P"];

/** Weekday × two-hour block, shaded by spins, with the busiest block named. */
export function RecapHeatmap({ recap }: { recap: Recap }) {
  const levels = heatLevels(recap.heatmap);
  const caption = busiestCaption(recap.heatmap);
  const columns = {
    base: "34px repeat(12, minmax(0, 1fr))",
    md: "40px repeat(12, minmax(0, 1fr))",
  };
  const gap = { base: "3px", md: "4px" };
  return (
    <ChartSection title="WHEN YOU LISTEN">
      <>
        <Stack role="img" aria-label={describeHeatmap(recap.heatmap)} gap={gap}>
          {levels.map((row, weekday) => (
            <Grid key={WEEKDAYS[weekday]} templateColumns={columns} gap={gap} alignItems="center">
              <Text as="span" {...axisProps}>
                {WEEKDAYS[weekday]}
              </Text>
              {row.map((level, block) => (
                <Box
                  key={block}
                  data-testid="heat-cell"
                  data-level={level}
                  h="22px"
                  borderWidth={level ? "outline" : "rule"}
                  borderColor={level ? "border.ink" : "border"}
                  style={{ background: inkTint(HEAT_TINTS[level]) }}
                />
              ))}
            </Grid>
          ))}
          <Grid
            templateColumns={{
              base: "34px repeat(6, minmax(0, 1fr))",
              md: "40px repeat(6, minmax(0, 1fr))",
            }}
            gap={gap}
            {...axisProps}
          >
            <span />
            {HOUR_TICKS.map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </Grid>
        </Stack>
        {caption && <Text {...captionProps}>{caption}</Text>}
      </>
    </ChartSection>
  );
}

const BPM_TICKS = ["80", "120", "160", "200"];

/** How the month's tempos spread, 80–200 BPM in tens, with the median and busiest range. */
export function RecapBpmSpread({ recap }: { recap: Recap }) {
  const { bpm } = recap;
  const heights = relativeWidths(bpm.histogram.map((bin) => bin.spins));
  const caption = bpmCaption(bpm);
  return (
    <ChartSection title="BPM SPREAD">
      {caption ? (
        <>
          <Flex
            role="img"
            aria-label={describeBpm(bpm)}
            h={{ base: "120px", md: "150px" }}
            align="flex-end"
            gap="3px"
            px="2px"
            borderBottomWidth="outline"
            borderColor="border.ink"
          >
            {bpm.histogram.map((bin, index) => (
              <Box key={bin.from} data-testid="bpm-bar" flex="1" h={`${heights[index]}%`} bg="fg" />
            ))}
          </Flex>
          <Flex justify="space-between" {...axisProps}>
            {BPM_TICKS.map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </Flex>
          <Text {...captionProps}>{caption}</Text>
        </>
      ) : (
        <Text fontSize="sm" color="fg.muted">
          None of this month&apos;s spins have a BPM yet.
        </Text>
      )}
    </ChartSection>
  );
}

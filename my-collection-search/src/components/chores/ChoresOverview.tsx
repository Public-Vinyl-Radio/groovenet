"use client";

import React from "react";
import { Box, Flex, Grid, Heading, Text } from "@chakra-ui/react";
import type { RecordCareProgressResponse } from "@/services/internalApi/recordCare";
import { Bar, Swatch } from "@/components/spins/recapParts";
import { useDisplayTimeZone } from "@/providers/DisplayTimeZoneProvider";
import {
  paceLine,
  progressAriaLabel,
  SLEEVE_STYLES,
  sleeveAriaLabel,
  sleeveLine,
  sleeveTotal,
  stackBlocks,
  stackUpNextLabel,
  type StackBlock,
} from "./choresWording";

// Columns of blocks per row: the whole run of a 400-copy library on one desktop
// line, three rows on a phone.
const DESKTOP_COLUMNS = 42;
const PHONE_COLUMNS = 14;

const blockStyle: Record<StackBlock, { bg: string; borderWidth: string; borderColor: string }> = {
  done: { bg: "fg", borderWidth: "rule", borderColor: "border.ink" },
  next: { bg: "bg", borderWidth: "outline", borderColor: "border.ink" },
  todo: { bg: "bg", borderWidth: "rule", borderColor: "border" },
};

function Overline({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <Heading
      as="h2"
      id={id}
      fontFamily="mono"
      fontSize={{ base: "11px", md: "xs" }}
      fontWeight="semibold"
      letterSpacing="0.08em"
    >
      {children}
    </Heading>
  );
}

function Progress({ progress }: { progress: RecordCareProgressResponse }) {
  const timeZone = useDisplayTimeZone();
  const blocks = stackBlocks(progress);
  const columns = (max: number) =>
    `repeat(${Math.max(1, Math.min(blocks.length, max))}, minmax(0, 1fr))`;
  return (
    <Flex
      as="section"
      aria-labelledby="chores-progress-heading"
      direction="column"
      gap="10px"
      px={{ base: 0, md: 4 }}
      py={{ base: 0, md: "14px" }}
    >
      <Flex align="baseline" justify="space-between" gap={3}>
        <Overline id="chores-progress-heading">LIBRARY CLEANING</Overline>
        <Text as="span" fontFamily="mono" fontSize={{ base: "11px", md: "xs" }} color="fg.muted">
          <Box as="span" display={{ base: "none", md: "inline" }}>
            {stackUpNextLabel(progress, "desktop")}
          </Box>
          <Box as="span" display={{ base: "inline", md: "none" }}>
            {stackUpNextLabel(progress, "phone")}
          </Box>
        </Text>
      </Flex>
      <Flex align="baseline" gap={{ base: 2, md: "10px" }}>
        <Text
          as="span"
          fontFamily="mono"
          fontSize={{ base: "26px", md: "30px" }}
          lineHeight={{ base: "32px", md: "36px" }}
          fontWeight="semibold"
        >
          {progress.cleaned.toLocaleString("en-US")}
        </Text>
        <Text as="span" fontFamily="mono" fontSize={{ base: "13px", md: "14px" }} color="fg.muted">
          / {progress.total.toLocaleString("en-US")} CLEANED
        </Text>
      </Flex>
      {blocks.length > 0 && (
        <Grid
          role="img"
          aria-label={progressAriaLabel(progress)}
          templateColumns={{ base: columns(PHONE_COLUMNS), md: columns(DESKTOP_COLUMNS) }}
          gap="3px"
        >
          {blocks.map((block, i) => (
            <Box
              key={i}
              data-block={block}
              h={{ base: "16px", md: "20px" }}
              boxSizing="border-box"
              {...blockStyle[block]}
            />
          ))}
        </Grid>
      )}
      <Text
        display={{ base: "none", md: "block" }}
        fontFamily="mono"
        fontSize="11px"
        letterSpacing="0.04em"
        color="fg.muted"
      >
        {paceLine(progress, timeZone)}
      </Text>
    </Flex>
  );
}

function SleeveBar({ bySleeve }: { bySleeve: RecordCareProgressResponse["by_sleeve_type"] }) {
  const shown = SLEEVE_STYLES.filter((s) => bySleeve[s.key] > 0);
  return (
    <Bar label={sleeveAriaLabel(bySleeve)} boxShadow="none" h={{ base: "18px", md: "24px" }}>
      {shown.map((s, i) => (
        <Box
          key={s.key}
          data-sleeve={s.key}
          flex={bySleeve[s.key]}
          minW={{ base: "8px", md: "10px" }}
          borderRightWidth={i < shown.length - 1 ? "outline" : 0}
          borderColor="border.ink"
          style={{ background: s.fill }}
        />
      ))}
    </Bar>
  );
}

function Sleeves({ progress }: { progress: RecordCareProgressResponse }) {
  const bySleeve = progress.by_sleeve_type;
  const used = SLEEVE_STYLES.filter((s) => bySleeve[s.key] > 0);
  const unused = sleeveLine(bySleeve, "unused");
  return (
    <Flex
      as="section"
      aria-labelledby="chores-sleeves-heading"
      direction="column"
      gap={{ base: "6px", md: "10px" }}
      px={{ base: 0, md: 4 }}
      pt={{ base: "10px", md: "14px" }}
      pb={{ base: 0, md: "14px" }}
      borderTopWidth={{ base: "rule", md: 0 }}
      borderLeftWidth={{ base: 0, md: "outline" }}
      borderTopColor="border"
      borderLeftColor="border.ink"
    >
      <Overline id="chores-sleeves-heading">
        SLEEVES
        <Box as="span" display={{ base: "none", md: "inline" }}>
          {" "}
          · {sleeveTotal(bySleeve).toLocaleString("en-US")} COPIES
        </Box>
      </Overline>
      <SleeveBar bySleeve={bySleeve} />
      <Text
        display={{ base: "block", md: "none" }}
        fontFamily="mono"
        fontSize="11px"
        color="fg.muted"
      >
        {sleeveLine(bySleeve, "used")}
      </Text>
      <Box
        as="ul"
        display={{ base: "none", md: "flex" }}
        flexDirection="column"
        gap={1}
        listStyleType="none"
        m={0}
        p={0}
        fontSize="13px"
      >
        {used.map((s) => (
          <Flex as="li" key={s.key} align="center" gap={2}>
            <Swatch bg={s.fill} />
            <Text as="span" flex="1">
              {s.label}
            </Text>
            <Text as="span" fontFamily="mono" fontSize="xs">
              {bySleeve[s.key].toLocaleString("en-US")}
            </Text>
          </Flex>
        ))}
        {unused && (
          <Text as="li" fontFamily="mono" fontSize="11px" color="fg.muted">
            {unused}
          </Text>
        )}
      </Box>
    </Flex>
  );
}

/**
 * The Chores page's top card (#943): library cleaning progress, one block per
 * stack, beside the copies by sleeve. Side by side from `md` up, stacked in
 * one card on a phone.
 */
export default function ChoresOverview({ progress }: { progress: RecordCareProgressResponse }) {
  return (
    <Grid
      data-testid="chores-overview"
      templateColumns={{ base: "minmax(0, 1fr)", md: "minmax(0, 3fr) minmax(0, 2fr)" }}
      gap={{ base: "10px", md: 0 }}
      p={{ base: 3, md: 0 }}
      mr="6px"
      borderWidth="outline"
      borderColor="border.ink"
      boxShadow="md"
    >
      <Progress progress={progress} />
      <Sleeves progress={progress} />
    </Grid>
  );
}

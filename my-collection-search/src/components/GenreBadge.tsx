"use client";

import React from "react";
import NextLink from "next/link";
import { Box, Flex, type ConditionalValue } from "@chakra-ui/react";
import { CategoryTag, CountTag, type TagSize } from "@/components/ui/RoleTags";
import { genreSearchHref, type GenreBadgeItem, type GenreSearchScope } from "@/lib/genres/links";

/**
 * Which field a badge shows. All three look the same, a Category tag (#963);
 * the kind names the field in the title and the React key.
 */
export type GenreBadgeKind = "track" | "discogs-genre" | "discogs-style";

export type GenreBadgeProps = {
  item: GenreBadgeItem;
  kind: GenreBadgeKind;
  /** Track search for track rows, album search for album cards (#376). */
  scope: GenreSearchScope;
  size?: ConditionalValue<TagSize>;
  /** How many records carry it (the playlist stats), shown as "Cumbia · 12". */
  count?: number;
};

/**
 * A genre that opens search filtered by it (#376). A value the taxonomy
 * doesn't know, an unreconciled `local_tags` entry, stays plain text with a
 * dashed ring.
 */
export default function GenreBadge({ item, kind, scope, size = "sm", count }: GenreBadgeProps) {
  const text = count === undefined ? item.label : `${item.label} · ${count.toLocaleString()}`;
  if (!item.slug) {
    return (
      <CategoryTag
        size={size}
        unreconciled
        title={kind === "track" ? "Not in the genre taxonomy yet" : item.label}
      >
        {text}
      </CategoryTag>
    );
  }

  return (
    <CategoryTag asChild size={size}>
      <NextLink
        href={genreSearchHref(item.slug, scope)}
        // Rows have their own click and selection handlers; a badge is its own target.
        onClick={(event) => event.stopPropagation()}
        aria-label={`Search ${scope} in ${item.label}`}
        title={text}
      >
        {text}
      </NextLink>
    </CategoryTag>
  );
}

/** A row of badges for one field, or nothing when it is empty. */
export function GenreBadgeList({
  items,
  ...badge
}: Omit<GenreBadgeProps, "item"> & { items: GenreBadgeItem[] }) {
  return (
    <>
      {items.map((item) => (
        <GenreBadge key={`${badge.kind}:${item.label}`} item={item} {...badge} />
      ))}
    </>
  );
}

export type GenreBadgeRowProps = {
  items: GenreBadgeItem[];
  kind: GenreBadgeKind;
  scope: GenreSearchScope;
  /** Badges kept on the one-line mobile row before folding the rest into "+N" (#470). */
  mobileLimit?: number;
  size?: GenreBadgeProps["size"];
  "data-testid"?: string;
};

// A tag that doesn't fit shrinks and ends in an ellipsis rather than being cut mid-letter.
const tagEllipsis = {
  "& > a, & > span:not([data-overflow])": {
    display: "block",
    minWidth: 0,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
};

/**
 * A track's genre badges (#470): wraps freely on desktop, but folds down to
 * one line on mobile — the first `mobileLimit` badges plus a "+N" badge for
 * the rest — so a long genre list doesn't make every card tall.
 */
export function GenreBadgeRow({
  items,
  kind,
  scope,
  mobileLimit = 3,
  size,
  "data-testid": testId,
}: GenreBadgeRowProps) {
  if (items.length === 0) return null;
  const overflow = Math.max(0, items.length - mobileLimit);
  const badge = { kind, scope, size };
  const mobileItems = overflow > 0 ? items.slice(0, mobileLimit) : items;

  return (
    <Box data-testid={testId}>
      <Flex gap={1.5} flexWrap="wrap" display={{ base: "none", md: "flex" }} css={tagEllipsis}>
        <GenreBadgeList items={items} {...badge} />
      </Flex>
      <Flex
        gap={1.5}
        flexWrap="nowrap"
        overflow="hidden"
        alignItems="center"
        display={{ base: "flex", md: "none" }}
        css={tagEllipsis}
      >
        <GenreBadgeList items={mobileItems} {...badge} />
        {overflow > 0 && (
          <CountTag data-overflow="" size={size ?? "sm"} flexShrink={0}>
            +{overflow}
          </CountTag>
        )}
      </Flex>
    </Box>
  );
}

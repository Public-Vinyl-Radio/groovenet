"use client";

import React from "react";
import NextLink from "next/link";
import { Badge, Box, Flex, type BadgeProps } from "@chakra-ui/react";
import { genreSearchHref, type GenreBadgeItem, type GenreSearchScope } from "@/lib/genres/links";

/**
 * Which field a badge shows. Each keeps the look it had before badges became
 * links: track genres solid, Discogs genres surface, Discogs styles outline.
 */
export type GenreBadgeKind = "track" | "discogs-genre" | "discogs-style";

const VARIANTS: Record<GenreBadgeKind, BadgeProps["variant"]> = {
  track: "solid",
  "discogs-genre": "surface",
  "discogs-style": "outline",
};

export type GenreBadgeProps = {
  item: GenreBadgeItem;
  kind: GenreBadgeKind;
  /** Track search for track rows, album search for album cards (#376). */
  scope: GenreSearchScope;
  size?: BadgeProps["size"];
  colorPalette?: BadgeProps["colorPalette"];
  /** Overrides the kind-derived variant, e.g. a uniform "subtle" treatment. */
  variant?: BadgeProps["variant"];
};

/**
 * A genre badge that opens search filtered by that genre (#376). A value the
 * taxonomy doesn't know — an unreconciled `local_tags` entry — stays plain
 * text, and an unreconciled track genre is drawn subtle so it reads as such.
 */
export default function GenreBadge({
  item,
  kind,
  scope,
  size = "sm",
  colorPalette,
  variant,
}: GenreBadgeProps) {
  if (!item.slug) {
    return (
      <Badge
        size={size}
        colorPalette={colorPalette}
        variant={variant ?? (kind === "track" ? "subtle" : VARIANTS[kind])}
        title={kind === "track" ? "Not in the genre taxonomy yet" : item.label}
      >
        {item.label}
      </Badge>
    );
  }

  return (
    <Badge
      asChild
      size={size}
      colorPalette={colorPalette}
      variant={variant ?? VARIANTS[kind]}
      cursor="pointer"
      focusVisibleRing="outside"
      _hover={{ textDecoration: "underline" }}
    >
      <NextLink
        href={genreSearchHref(item.slug, scope)}
        // Rows have their own click and selection handlers; a badge is its own target.
        onClick={(event) => event.stopPropagation()}
        aria-label={`Search ${scope} in ${item.label}`}
        title={item.label}
      >
        {item.label}
      </NextLink>
    </Badge>
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
  colorPalette?: GenreBadgeProps["colorPalette"];
  variant?: GenreBadgeProps["variant"];
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
  colorPalette,
  variant,
  "data-testid": testId,
}: GenreBadgeRowProps) {
  if (items.length === 0) return null;
  const overflow = Math.max(0, items.length - mobileLimit);
  const badge = { kind, scope, size, colorPalette, variant };
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
          <Badge
            data-overflow=""
            size={size ?? "sm"}
            variant="subtle"
            colorPalette="neutral"
            flexShrink={0}
          >
            +{overflow}
          </Badge>
        )}
      </Flex>
    </Box>
  );
}

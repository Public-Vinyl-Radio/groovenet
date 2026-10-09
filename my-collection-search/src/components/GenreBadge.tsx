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
};

/**
 * A genre badge that opens search filtered by that genre (#376). A value the
 * taxonomy doesn't know — an unreconciled `local_tags` entry — stays plain
 * text, and an unreconciled track genre is drawn subtle so it reads as such.
 */
export default function GenreBadge({ item, kind, scope, size = "sm", colorPalette }: GenreBadgeProps) {
  if (!item.slug) {
    return (
      <Badge
        size={size}
        colorPalette={colorPalette}
        variant={kind === "track" ? "subtle" : VARIANTS[kind]}
        title={kind === "track" ? "Not in the genre taxonomy yet" : undefined}
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
      variant={VARIANTS[kind]}
      cursor="pointer"
      focusVisibleRing="outside"
      _hover={{ textDecoration: "underline" }}
    >
      <NextLink
        href={genreSearchHref(item.slug, scope)}
        // Rows have their own click and selection handlers; a badge is its own target.
        onClick={(event) => event.stopPropagation()}
        aria-label={`Search ${scope} in ${item.label}`}
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
  "data-testid"?: string;
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
  "data-testid": testId,
}: GenreBadgeRowProps) {
  if (items.length === 0) return null;
  const overflow = Math.max(0, items.length - mobileLimit);
  const mobileItems = overflow > 0 ? items.slice(0, mobileLimit) : items;

  return (
    <Box data-testid={testId}>
      <Flex gap={1.5} flexWrap="wrap" display={{ base: "none", md: "flex" }}>
        <GenreBadgeList items={items} kind={kind} scope={scope} />
      </Flex>
      <Flex
        gap={1.5}
        flexWrap="nowrap"
        overflow="hidden"
        alignItems="center"
        display={{ base: "flex", md: "none" }}
      >
        <GenreBadgeList items={mobileItems} kind={kind} scope={scope} />
        {overflow > 0 && (
          <Badge size="sm" variant="subtle" colorPalette="gray" flexShrink={0}>
            +{overflow}
          </Badge>
        )}
      </Flex>
    </Box>
  );
}

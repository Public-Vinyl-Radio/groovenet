"use client";

import React from "react";
import NextLink from "next/link";
import { Box, Flex, type ConditionalValue } from "@chakra-ui/react";
import { CategoryTag, CountTag, type TagSize } from "@/components/ui/RoleTags";
import { genreHref, type GenreBadgeItem } from "@/lib/genres/links";

/**
 * Which field a badge shows. All three look the same, a Category tag (#963);
 * the kind names the field in the title and the React key.
 */
export type GenreBadgeKind = "track" | "discogs-genre" | "discogs-style";

export type GenreBadgeProps = {
  item: GenreBadgeItem;
  kind: GenreBadgeKind;
  size?: ConditionalValue<TagSize>;
  /** How many records carry it (the playlist stats), shown as "Cumbia · 12". */
  count?: number;
};

/**
 * A genre that opens its genre page (#376, #1013). A value the taxonomy
 * doesn't know, an unreconciled `local_tags` entry, stays plain text with a
 * dashed ring.
 */
export default function GenreBadge({ item, kind, size = "sm", count }: GenreBadgeProps) {
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
        href={genreHref(item.slug)}
        // Rows have their own click and selection handlers; a badge is its own target.
        onClick={(event) => event.stopPropagation()}
        aria-label={`Open ${item.label}`}
        title={`Open ${item.label}`}
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
  mobileLimit = 3,
  size,
  "data-testid": testId,
}: GenreBadgeRowProps) {
  if (items.length === 0) return null;
  const overflow = Math.max(0, items.length - mobileLimit);
  const badge = { kind, size };
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

/**
 * How many tags fit in `available` px (#1231): every tag whole, then the "+N"
 * count for the rest, its room reserved first. One tag always shows, and may
 * ellipsize, when even it and the count don't fit beside each other.
 */
export function fitGenreTags(
  widths: number[],
  gap: number,
  available: number,
  countWidth: number,
): number {
  const n = widths.length;
  if (n === 0) return 0;
  const all = widths.reduce((sum, w) => sum + w, 0) + gap * (n - 1);
  if (all <= available) return n;
  let shown = 1;
  let used = widths[0];
  for (let k = 2; k < n; k++) {
    used += gap + widths[k - 1];
    if (used + gap + countWidth > available) break;
    shown = k;
  }
  return shown;
}

// How far up to look for what clips the cell: the row's grid and the row itself.
const CLIP_DEPTH = 6;

/** The ancestors that clip the cell, nearest first. */
function clippingAncestors(cell: HTMLElement): HTMLElement[] {
  const clips: HTMLElement[] = [];
  let node = cell.parentElement;
  for (let depth = 0; node && depth < CLIP_DEPTH; depth++, node = node.parentElement) {
    if (getComputedStyle(node).overflowX !== "visible") clips.push(node);
  }
  return clips;
}

/**
 * The width of the cell that can be seen. A row whose columns need more room
 * than it has clips its grid at the right, so the cell can be wider than what
 * shows of it (#1231): fit to the nearest clipping edge, not the cell's box.
 */
function visibleWidth(cell: HTMLElement, clips: HTMLElement[]): number {
  const box = cell.getBoundingClientRect();
  const edges = clips.map((clip) => clip.getBoundingClientRect().right - box.left);
  return Math.max(0, Math.min(box.width, ...edges));
}

// Each shown tag keeps its full width; only a tag shown alone may shrink to an ellipsis.
const fittedTag = (shrink: boolean) => ({
  display: "flex",
  minWidth: 0,
  flexShrink: shrink ? 1 : 0,
  "& > *": {
    display: "block",
    minWidth: 0,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

export type FittedGenreListProps = {
  items: { item: GenreBadgeItem; kind: GenreBadgeKind }[];
  size?: TagSize;
  "data-testid"?: string;
};

/**
 * One line of genre tags that never clips one mid-border (#1231): as many whole
 * tags as the width allows, then a "+N" count, always whole, for the rest. A
 * hidden copy of the tags and the widest count is measured, and a
 * `ResizeObserver` on the cell re-fits only when its width changes, so a
 * virtualised list doesn't re-render rows as it scrolls.
 */
export function FittedGenreList({
  items,
  size = "sm",
  "data-testid": testId,
}: FittedGenreListProps) {
  const cellRef = React.useRef<HTMLDivElement>(null);
  const measureRef = React.useRef<HTMLDivElement>(null);
  const rowRef = React.useRef<HTMLDivElement>(null);
  const [shown, setShown] = React.useState(items.length);
  const labels = items.map(({ item }) => item.label).join("\u0000");

  React.useLayoutEffect(() => {
    const cell = cellRef.current;
    const measure = measureRef.current;
    if (!cell || !measure) return;
    const clips = clippingAncestors(cell);
    let lastWidth = -1;
    const fit = () => {
      const width = visibleWidth(cell, clips);
      if (width === lastWidth) return;
      lastWidth = width;
      // The tags end at the visible edge, so a lone tag ellipsizes there, not past it.
      (rowRef.current as HTMLDivElement).style.maxWidth = `${width}px`;
      const tags = [...measure.querySelectorAll<HTMLElement>("[data-measure-tag]")];
      const count = measure.querySelector("[data-measure-count]") as HTMLElement;
      const gap = parseFloat(getComputedStyle(measure).columnGap) || 0;
      const next = fitGenreTags(
        tags.map((tag) => tag.getBoundingClientRect().width),
        gap,
        width,
        count.getBoundingClientRect().width,
      );
      setShown(next);
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    // The cell, and what clips it: either can change what shows. `fit` does
    // nothing unless the visible width moved, so scrolling never re-renders a row.
    const observer = new ResizeObserver(fit);
    observer.observe(cell);
    clips.forEach((clip) => observer.observe(clip));
    // A web font arriving changes every tag's width.
    void document.fonts?.ready.then(() => {
      lastWidth = -1;
      fit();
    });
    return () => observer.disconnect();
  }, [labels]);

  if (items.length === 0) return null;
  const visible = items.slice(0, Math.max(1, shown));
  const hidden = items.slice(visible.length);

  return (
    <Box ref={cellRef} position="relative" minW={0} overflow="hidden" data-testid={testId}>
      <Flex ref={rowRef} gap={1.5} alignItems="center" flexWrap="nowrap" minW={0}>
        {visible.map(({ item, kind }) => (
          <Box key={`${kind}:${item.label}`} css={fittedTag(visible.length === 1)}>
            <GenreBadge item={item} kind={kind} size={size} />
          </Box>
        ))}
        {hidden.length > 0 && (
          <CountTag
            data-overflow=""
            size={size}
            flexShrink={0}
            title={hidden.map(({ item }) => item.label).join(", ")}
            aria-label={`${hidden.length} more ${hidden.length === 1 ? "genre" : "genres"}`}
          >
            +{hidden.length}
          </CountTag>
        )}
      </Flex>
      {/* What is measured: every tag at full width, and the widest count. */}
      <Flex
        ref={measureRef}
        aria-hidden="true"
        gap={1.5}
        position="absolute"
        top={0}
        left={0}
        visibility="hidden"
        pointerEvents="none"
        whiteSpace="nowrap"
      >
        {items.map(({ item, kind }) => (
          <CategoryTag
            key={`${kind}:${item.label}`}
            size={size}
            flexShrink={0}
            unreconciled={!item.slug}
            data-measure-tag=""
          >
            {item.label}
          </CategoryTag>
        ))}
        <CountTag size={size} flexShrink={0} data-measure-count="">
          +{items.length}
        </CountTag>
      </Flex>
    </Box>
  );
}

"use client";

import React from "react";
import { chakra, type HTMLChakraProps } from "@chakra-ui/react";
import { roleRecipes } from "@/app/houseStyle";

// The five passive badge roles (#963). Product code renders one of these, or
// `FilterChip`, never Chakra's `Badge` or `Tag`: the look lives in the recipes
// in houseStyle.ts, and each tag here only picks a variant. Each takes `asChild`
// for a link (`GenreBadge`) or a button (`TrackPlaylistUsage`).

export type TagSize = "sm" | "xs";

const StatusRoot = chakra("span", roleRecipes.statusTag);
const CategoryRoot = chakra("span", roleRecipes.categoryTag);
const MetaRoot = chakra("span", roleRecipes.metaTag);
const SourceRoot = chakra("span", roleRecipes.sourceTag);
const CountRoot = chakra("span", roleRecipes.countTag);

type TagProps = Omit<HTMLChakraProps<"span">, "size"> & { size?: TagSize };

export type StatusTone = "missing" | "analysis" | "success" | "neutral";

export type StatusTagProps = TagProps & {
  /** missing: data the pipeline needs; analysis: analysis to run or check; neutral: a plain state. */
  tone: StatusTone;
};

/** A state to notice or act on: No BPM, Failed, Paused, Sleeve unknown. Always a word, never solid. */
export function StatusTag(props: StatusTagProps) {
  return <StatusRoot {...props} />;
}

export type CategoryTagProps = TagProps & {
  /** Not in the genre taxonomy yet: drawn with a dashed ring. */
  unreconciled?: boolean;
  /** How many records carry it, shown after the label ("Cumbia · 12"). */
  count?: number;
};

/** What a record is: genre, style, mood. Track genres, Discogs genres and styles all look the same. */
export function CategoryTag({ count, children, asChild, ...props }: CategoryTagProps) {
  // With asChild the child element is the tag, so the count can't be appended here.
  if (asChild || count === undefined) {
    return (
      <CategoryRoot asChild={asChild} {...props}>
        {children}
      </CategoryRoot>
    );
  }
  return (
    <CategoryRoot {...props}>
      {children} · {count.toLocaleString()}
    </CategoryRoot>
  );
}

export type MetaTagProps = TagProps & {
  /** plain: a value; id: the library ID (accent, bold); raw: a path or hash, mono with its case kept. */
  variant?: "plain" | "id" | "raw";
};

/** A value: library ID, key, BPM, era, a count with its noun, a path. No fill. */
export function MetaTag(props: MetaTagProps) {
  return <MetaRoot {...props} />;
}

export type SourceStroke = "solid" | "dotted" | "dashed" | "double" | "fill";

export type SourceTagProps = TagProps & {
  /** The value's mark: a border style, or an ink fill. */
  stroke?: SourceStroke;
  /** On an ink-filled surface. */
  inverted?: boolean;
};

/** Provenance and output: Vinyl / Digital, Via CLI, Auto / Manual, On Lounge. A 2px ink ring. */
export function SourceTag(props: SourceTagProps) {
  return <SourceRoot {...props} />;
}

export type CountTagProps = TagProps & {
  /** plain: a number; strong: the one that matters (ink fill); dot: a notification (accent). */
  variant?: "plain" | "strong" | "dot";
};

/** A bare number: +3 overflow, a tab count, an active-filter dot. A count with a noun is a MetaTag. */
export function CountTag(props: CountTagProps) {
  return <CountRoot {...props} />;
}

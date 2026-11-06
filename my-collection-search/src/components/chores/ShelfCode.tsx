"use client";

import React from "react";
import Link from "next/link";
import { MetaTag } from "@/components/ui/RoleTags";

type Props = {
  /** `albums.library_identifier`: "LP-182", "S-013"; null when the album has none. */
  code: string | null;
  /** Where "No ID" goes: the album's edit page. */
  editHref: string;
  /** The record's title, so the link says whose ID is missing. */
  title: string;
  /** `card` is the big code at the top of a grid card. */
  size?: "row" | "card";
};

/**
 * The shelf code in the shared ID tag, or a muted "No ID" linking to the album's
 * edit page. It sits above the row's checkbox overlay, so the link stays clickable.
 */
export default function ShelfCode({ code, editHref, title, size = "row" }: Props) {
  const card = size === "card";
  if (code) {
    return (
      <MetaTag
        variant="id"
        size="sm"
        flexShrink={0}
        whiteSpace="nowrap"
        {...(card ? { fontSize: "20px", lineHeight: "24px", letterSpacing: "0.02em" } : {})}
      >
        {code}
      </MetaTag>
    );
  }
  return (
    <Link
      href={editHref}
      aria-label={`No ID for ${title}: add one`}
      style={{
        position: "relative",
        zIndex: 1,
        pointerEvents: "auto",
        display: "inline-flex",
        alignItems: "center",
        minHeight: "44px",
        margin: card ? "-10px 0" : "-12px 0",
        flexShrink: 0,
        whiteSpace: "nowrap",
        color: "var(--chakra-colors-fg-muted)",
        textDecoration: "underline",
        textUnderlineOffset: "3px",
        fontFamily: "var(--chakra-fonts-mono)",
        fontSize: card ? "14px" : "11px",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      No ID
    </Link>
  );
}

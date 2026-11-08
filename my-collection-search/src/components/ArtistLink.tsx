"use client";
import React from "react";
import NextLink from "next/link";
import { Link } from "@chakra-ui/react";
import type { ArtistCreditRef } from "@/api-contract/schemas";

/**
 * Renders one piece of the artist string; a function lets a caller style each link.
 * It runs once per credited artist, with plain-text joiners between the results, so
 * it must return INLINE content (a string or an `as="span"` element), never a block
 * (`<p>`, `<div>`): a block would put every artist on its own line. Truncation
 * belongs to the caller, as one wrapper around the whole `ArtistLink`.
 */
export type ArtistLabel = (text: string) => React.ReactNode;

export type ArtistLinkProps = {
  /** The display string, e.g. `A & B`. It stays the source of the visible text. */
  artist: string;
  /**
   * The structured credits behind `artist` (#708). Omitted means they were not
   * loaded, so the name falls back to an album search. Present means they were:
   * each credited artist links to their page, and placeholders and anything
   * unreconciled stay plain text.
   */
  credits?: ArtistCreditRef[] | null;
  friendId?: number | null;
  stopPropagation?: boolean;
  children?: React.ReactNode | ArtistLabel;
  className?: string;
};

/** The albums search for an artist, scoped to a collection when given one. */
export const artistHref = (artist: string, friendId?: number | null) =>
  `/albums?q=${encodeURIComponent(artist)}${friendId ? `&friend_id=${friendId}` : ""}`;

/** The artist page for a slug. */
export const artistPageHref = (slug: string) => `/artists/${encodeURIComponent(slug)}`;

export type ArtistSegment = { text: string; credit?: ArtistCreditRef };

/**
 * Cuts the display string into plain text and linkable credits by searching it
 * for each credit's spelling. Kept for credits that predate the stored joiner.
 */
function splitDisplayString(artist: string, credits: ArtistCreditRef[]): ArtistSegment[] {
  const haystack = artist.toLowerCase();
  const segments: ArtistSegment[] = [];
  let cursor = 0;

  const pushText = (text: string) => {
    if (!text) return;
    const last = segments[segments.length - 1];
    if (last && !last.credit) last.text += text;
    else segments.push({ text });
  };

  for (const credit of credits) {
    const name = credit.credited_as || credit.name;
    if (!name) continue;
    const at = haystack.indexOf(name.toLowerCase(), cursor);
    if (at === -1) continue;
    pushText(artist.slice(cursor, at));
    const text = artist.slice(at, at + name.length);
    if (credit.is_placeholder) pushText(text);
    else segments.push({ text, credit });
    cursor = at + name.length;
  }
  pushText(artist.slice(cursor));
  return segments;
}

/** `,` reads "A, B"; anything else ("&", "Featuring") sits between spaces. */
const joinerText = (joiner: string) => (joiner === "," ? ", " : ` ${joiner} `);

/**
 * The artist line for a row that has credits (#1078). It is built from the
 * credits, not searched for in the display string, so an inversion
 * (`Strokes, The`) or a `(12)` suffix still links: each primary or featured
 * artist by name in credit order, joined by the credited joiner. Remixers and
 * composers the display leaves out stay out, the same artist credited twice
 * shows once, and placeholders are plain text. A credit set without joiners
 * (stored before they were) falls back to finding the credits in the string.
 * No credits at all means the string is shown as it is.
 */
export function splitArtistCredits(artist: string, credits: ArtistCreditRef[]): ArtistSegment[] {
  const seen = new Set<number>();
  const shown = [...credits]
    .sort((a, b) => a.position - b.position)
    .filter((c) => {
      if (c.role !== "primary" && c.role !== "featured") return false;
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  const named = shown.filter((c) => c.name || c.credited_as);
  if (named.length === 0) return [{ text: artist }];

  const complete = named.slice(0, -1).every((c) => c.joiner);
  if (!complete && named.length > 1) {
    const found = splitDisplayString(artist, named);
    if (found.filter((s) => s.credit).length === named.filter((c) => !c.is_placeholder).length)
      return found;
  }

  const segments: ArtistSegment[] = [];
  const push = (segment: ArtistSegment) => {
    const last = segments[segments.length - 1];
    if (!segment.credit && last && !last.credit) last.text += segment.text;
    else segments.push(segment);
  };
  named.forEach((credit, i) => {
    const text = credit.name || credit.credited_as;
    if (credit.is_placeholder) push({ text });
    else push({ text, credit });
    if (i < named.length - 1) push({ text: joinerText(credit.joiner || ",") });
  });
  return segments;
}

const render = (children: ArtistLinkProps["children"], text: string) =>
  typeof children === "function" ? children(text) : text;

export default function ArtistLink({
  artist,
  credits,
  friendId,
  stopPropagation = false,
  children,
  className,
}: ArtistLinkProps) {
  const onClick = (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
  };

  if (credits) {
    return (
      <>
        {splitArtistCredits(artist, credits).map((segment, i) =>
          segment.credit ? (
            <Link
              key={`${segment.credit.id}-${i}`}
              as={NextLink}
              href={artistPageHref(segment.credit.slug)}
              display="inline"
              _hover={{ textDecoration: "underline" }}
              onClick={onClick}
              className={className}
            >
              {render(children, segment.text)}
            </Link>
          ) : (
            <React.Fragment key={`text-${i}`}>{segment.text}</React.Fragment>
          ),
        )}
      </>
    );
  }

  return (
    <Link
      as={NextLink}
      href={artistHref(artist, friendId)}
      _hover={{ textDecoration: "underline" }}
      onClick={onClick}
      className={className}
    >
      {typeof children === "function" ? children(artist) : (children ?? artist)}
    </Link>
  );
}

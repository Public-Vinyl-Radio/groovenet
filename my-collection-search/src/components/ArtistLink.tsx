"use client";
import React from "react";
import NextLink from "next/link";
import { Link } from "@chakra-ui/react";
import type { ArtistCreditRef } from "@/api-contract/schemas";

/** Renders one piece of the artist string; a function lets a caller style each link. */
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
 * Cuts the display string into plain text and linkable credits, keeping the
 * credited joiner (`A & B` stays `A & B`). A credit is found by the spelling
 * this release credits it as, in credit order; one that does not appear in the
 * string (a remixer or composer the display leaves out) is not rendered, and
 * the same artist credited twice links once. Placeholders and text between or
 * around credits are plain segments.
 */
export function splitArtistCredits(artist: string, credits: ArtistCreditRef[]): ArtistSegment[] {
  const haystack = artist.toLowerCase();
  const seen = new Set<number>();
  const ordered = [...credits].sort((a, b) => a.position - b.position);
  const segments: ArtistSegment[] = [];
  let cursor = 0;

  const pushText = (text: string) => {
    if (!text) return;
    const last = segments[segments.length - 1];
    if (last && !last.credit) last.text += text;
    else segments.push({ text });
  };

  for (const credit of ordered) {
    if (seen.has(credit.id)) continue;
    const name = credit.credited_as || credit.name;
    if (!name) continue;
    const at = haystack.indexOf(name.toLowerCase(), cursor);
    if (at === -1) continue;
    seen.add(credit.id);
    pushText(artist.slice(cursor, at));
    const text = artist.slice(at, at + name.length);
    if (credit.is_placeholder) pushText(text);
    else segments.push({ text, credit });
    cursor = at + name.length;
  }
  pushText(artist.slice(cursor));
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

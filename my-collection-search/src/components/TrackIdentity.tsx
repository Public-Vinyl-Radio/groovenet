"use client";

import React from "react";
import NextLink from "next/link";
import { Box, Link, Text, type LinkProps, type TextProps } from "@chakra-ui/react";
import AlbumLink from "@/components/AlbumLink";
import ArtistLink from "@/components/ArtistLink";
import type { Track } from "@/types/track";

/** What the link parts read off a track. */
export type TrackIdentityTrack = Pick<
  Track,
  "track_id" | "title" | "artist" | "album" | "artists"
> &
  Partial<Pick<Track, "release_id" | "friend_id">>;

/** The track page. `friend_id` rides along where the app's track links carry it. */
export function trackHref(track: Pick<TrackIdentityTrack, "track_id" | "friend_id">): string {
  const scope = track.friend_id ? `?friend_id=${track.friend_id}` : "";
  return `/tracks/${encodeURIComponent(track.track_id)}${scope}`;
}

// Rows have their own click, selection and drag handlers; a link is its own target.
const stop = (event: React.SyntheticEvent) => event.stopPropagation();

type TitleLinkProps = Omit<LinkProps, "children" | "href"> & {
  track: TrackIdentityTrack;
  /** Stop the click and press reaching a clickable or draggable row. Default on. */
  stopPropagation?: boolean;
  children?: React.ReactNode;
};

/** The track's title as a link to its page; the title text unless told otherwise. */
export function TrackTitleLink({
  track,
  stopPropagation = true,
  children,
  ...linkProps
}: TitleLinkProps) {
  return (
    <Link
      as={NextLink}
      href={trackHref(track)}
      _hover={{ textDecoration: "underline" }}
      onClick={stopPropagation ? stop : undefined}
      onMouseDown={stopPropagation ? stop : undefined}
      {...linkProps}
    >
      {children ?? track.title}
    </Link>
  );
}

/**
 * A cover that opens the album, like the player bar's. The title already
 * names the track and the album text names the album, so this is a second way
 * to the same place: hidden from assistive tech and out of the tab order, so
 * a row never has two tab stops for one target. Without a release it is just
 * the cover.
 */
export function TrackCoverLink({
  track,
  stopPropagation = true,
  children,
  className,
}: {
  track: TrackIdentityTrack;
  stopPropagation?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  if (!track.release_id) return <>{children}</>;
  const scope = track.friend_id ? `?friend_id=${track.friend_id}` : "";
  return (
    <Link asChild className={className} display="block" flexShrink={0}>
      <NextLink
        href={`/albums/${track.release_id}${scope}`}
        aria-hidden="true"
        tabIndex={-1}
        onClick={stopPropagation ? stop : undefined}
        onMouseDown={stopPropagation ? stop : undefined}
      >
        {children}
      </NextLink>
    </Link>
  );
}

export type TrackIdentityProps = {
  track: TrackIdentityTrack;
  /**
   * Which parts link. `all`: title, artist and album. `title`: only the title
   * (dense phone rows, where tiny inline links must not be the only route).
   * `none`: plain text, for a row that is itself the target.
   */
  links?: "all" | "title" | "none";
  /** Leave the album out of the byline. */
  hideAlbum?: boolean;
  stopPropagation?: boolean;
  titleProps?: TextProps;
  bylineProps?: TextProps;
};

/** The text half of a track: title, then `Artist · Album`, each part linked per `links`. */
export default function TrackIdentity({
  track,
  links = "all",
  hideAlbum = false,
  stopPropagation = true,
  titleProps,
  bylineProps,
}: TrackIdentityProps) {
  const album = hideAlbum ? "" : track.album;
  const byline = [track.artist, album].filter(Boolean).join(" · ");
  // Chakra's Link is inline-flex, which defeats the line's ellipsis.
  const inline = { "& a": { display: "inline" } } as const;
  return (
    <Box minW={0} flex={1}>
      <Text
        fontWeight="semibold"
        fontSize="15px"
        lineHeight="20px"
        truncate
        title={track.title}
        css={inline}
        {...titleProps}
      >
        {links === "none" ? (
          track.title
        ) : (
          <TrackTitleLink track={track} stopPropagation={stopPropagation} />
        )}
      </Text>
      <Text
        fontSize="12px"
        lineHeight="16px"
        color="fg.muted"
        truncate
        title={byline}
        css={inline}
        {...bylineProps}
      >
        {links === "all" ? (
          <>
            {track.artist ? (
              <ArtistLink
                artist={track.artist}
                credits={track.artists}
                friendId={track.friend_id}
                stopPropagation={stopPropagation}
              />
            ) : null}
            {track.artist && album ? " · " : null}
            {album ? (
              <AlbumLink
                releaseId={track.release_id}
                friendId={track.friend_id}
                stopPropagation={stopPropagation}
              >
                {album}
              </AlbumLink>
            ) : null}
          </>
        ) : (
          byline
        )}
      </Text>
    </Box>
  );
}

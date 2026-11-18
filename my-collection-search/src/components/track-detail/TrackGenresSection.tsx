"use client";

import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { GenreBadgeList } from "@/components/GenreBadge";
import { CategoryTag } from "@/components/ui/RoleTags";
import { useGenreLookup } from "@/hooks/useGenreTaxonomyQuery";
import { useTrack } from "@/hooks/useTrack";
import { discogsGenreBadges, trackGenreBadges, type GenreBadgeItem } from "@/lib/genres/links";
import type { Track } from "@/types/track";

type Props = {
  trackId: string;
  friendId: number;
  fallbackTrack: Track;
};

/** `items` without anything already shown, compared as typed ignoring case. */
function withoutSeen(items: GenreBadgeItem[], seen: Set<string>): GenreBadgeItem[] {
  return items.filter((item) => {
    const key = item.label.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// A tag shrinks and ends in an ellipsis rather than overflowing the header.
const tagCss = {
  "& > a, & > span": {
    minWidth: 0,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
};

const rowLabel = {
  fontFamily: "label",
  fontSize: "11px",
  lineHeight: "20px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "fg.muted",
} as const;

function GenreRow({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Box data-testid="track-genre-row" display="contents">
      <Text as="dt" {...rowLabel} title={title}>
        {label}
      </Text>
      <Flex as="dd" m={0} flexWrap="wrap" alignItems="center" gap={1.5} minW={0} css={tagCss}>
        {children}
      </Flex>
    </Box>
  );
}

/**
 * One labelled row per source (#1214): the track's DJ genres, then its album's
 * effective Discogs genres and styles, each a link into track search (#376),
 * then the genre the audio file declares (read-only, plain: it refreshes from the
 * file). The label sits in a fixed column so its tags wrap beside it, never
 * around it. A row with nothing to show isn't rendered, and each genre shows
 * once, in the first row that has it. Reads the store, so an edit shows at once.
 * Editing itself is the menu's Edit Track.
 */
export default function TrackGenresSection({ trackId, friendId, fallbackTrack }: Props) {
  const track = useTrack(trackId, friendId) ?? fallbackTrack;
  const lookup = useGenreLookup();
  const seen = new Set<string>();
  const trackGenres = withoutSeen(trackGenreBadges(track, lookup), seen);
  const discogsGenres = withoutSeen(
    discogsGenreBadges(track.album_genres ?? track.genres, lookup),
    seen,
  );
  const discogsStyles = withoutSeen(
    discogsGenreBadges(track.album_styles ?? track.styles, lookup),
    seen,
  );
  const hasAlbum = discogsGenres.length > 0 || discogsStyles.length > 0;
  // What the audio file's own tags say (#673): Apple/ID3 names, never a genre
  // assignment, so plain tags rather than links.
  const fileGenres = withoutSeen(
    (track.audio_file_genre ?? []).map((label) => ({ label, slug: null })),
    seen,
  );

  if (trackGenres.length === 0 && !hasAlbum && fileGenres.length === 0) {
    return (
      <Text data-testid="track-genres-section" fontSize="sm" color="fg.muted">
        No genres yet
      </Text>
    );
  }

  return (
    <Box
      as="dl"
      data-testid="track-genres-section"
      m={0}
      display="grid"
      gridTemplateColumns="56px minmax(0, 1fr)"
      columnGap={2}
      rowGap={1.5}
      alignItems="start"
      minW={0}
    >
      {trackGenres.length > 0 && (
        <GenreRow label="Genres">
          <GenreBadgeList items={trackGenres} kind="track" />
        </GenreRow>
      )}
      {hasAlbum && (
        <GenreRow label="Album">
          <GenreBadgeList items={discogsGenres} kind="discogs-genre" />
          <GenreBadgeList items={discogsStyles} kind="discogs-style" />
        </GenreRow>
      )}
      {fileGenres.length > 0 && (
        <GenreRow
          label="File"
          title="Read from the audio file's tags; refreshes when the file is re-read"
        >
          {fileGenres.map((item) => (
            <CategoryTag key={`file:${item.label}`} size="sm" data-testid="file-genre">
              {item.label}
            </CategoryTag>
          ))}
        </GenreRow>
      )}
    </Box>
  );
}

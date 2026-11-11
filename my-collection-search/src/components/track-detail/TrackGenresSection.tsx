"use client";

import { Flex, Text } from "@chakra-ui/react";
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

const groupLabel = {
  fontFamily: "label",
  fontSize: "11px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "fg.muted",
  mx: 1,
} as const;

/**
 * The track's DJ genres, then its album's effective Discogs genres and styles,
 * each a link into track search (#376), then the genre the audio file declares
 * (read-only: it refreshes from the file). One wrapping row for the track page
 * header; each genre shows once. Reads the store, so an edit shows at once.
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
  // assignment, so plain tags rather than links, under a label naming the file.
  const fileGenres = withoutSeen(
    (track.audio_file_genre ?? []).map((label) => ({ label, slug: null })),
    seen,
  );

  return (
    <Flex
      data-testid="track-genres-section"
      flexWrap="wrap"
      alignItems="center"
      gap={1.5}
      minW={0}
      css={tagCss}
    >
      <GenreBadgeList items={trackGenres} kind="track" />
      {trackGenres.length === 0 && (
        <Text as="span" fontSize="sm" color="fg.muted">
          No genres yet
        </Text>
      )}
      {hasAlbum && (
        <Text as="span" {...groupLabel}>
          Album
        </Text>
      )}
      <GenreBadgeList items={discogsGenres} kind="discogs-genre" />
      <GenreBadgeList items={discogsStyles} kind="discogs-style" />
      {fileGenres.length > 0 && (
        <Text
          as="span"
          {...groupLabel}
          title="Read from the audio file's tags; refreshes when the file is re-read"
        >
          Genre from file
        </Text>
      )}
      {fileGenres.map((item) => (
        <CategoryTag key={`file:${item.label}`} size="sm" data-testid="file-genre">
          {item.label}
        </CategoryTag>
      ))}
    </Flex>
  );
}

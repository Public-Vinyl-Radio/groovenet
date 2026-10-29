"use client";

import { Badge, Flex, Text } from "@chakra-ui/react";
import { GenreBadgeList } from "@/components/GenreBadge";
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

/**
 * The track's DJ genres, then its album's effective Discogs genres and styles,
 * each a link into track search (#376). One wrapping row for the track page
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

  return (
    <Flex
      data-testid="track-genres-section"
      flexWrap="wrap"
      alignItems="center"
      gap={1.5}
      minW={0}
      css={tagCss}
    >
      <GenreBadgeList
        items={trackGenres}
        kind="track"
        scope="tracks"
        colorPalette="status.genre"
        variant="subtle"
      />
      {trackGenres.length === 0 && (
        <Badge variant="outline" colorPalette="neutral" size="sm">
          No genres yet
        </Badge>
      )}
      {hasAlbum && (
        <Text
          as="span"
          fontFamily="label"
          fontSize="11px"
          letterSpacing="0.08em"
          textTransform="uppercase"
          color="fg.muted"
          mx={1}
        >
          Album
        </Text>
      )}
      <GenreBadgeList items={discogsGenres} kind="discogs-genre" scope="tracks" />
      <GenreBadgeList items={discogsStyles} kind="discogs-style" scope="tracks" />
    </Flex>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { chakra, Flex, Text } from "@chakra-ui/react";
import { CountTag } from "@/components/ui/RoleTags";
import { GenreBadgeList } from "@/components/GenreBadge";
import { RatingStars } from "@/components/TrackResult";
import { useGenreLookup } from "@/hooks/useGenreTaxonomyQuery";
import { useTracksQuery } from "@/hooks/useTracksQuery";
import { primaryGenreBadges } from "@/lib/genres/links";
import { formatBpmDelta, parseBpm } from "@/lib/mixCompat";
import type { Track } from "@/types/track";

export const Th = chakra("th");

export const dash = "–";

export const labelHead = {
  fontFamily: "label",
  fontSize: "11px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "fg.muted",
  fontWeight: "medium",
  textAlign: "left",
} as const;

export function BpmCell({ track, delta }: { track: Track; delta: number | null }) {
  const bpm = parseBpm(track.bpm);
  if (bpm === null) {
    return (
      <Text as="span" color="fg.subtle" aria-label="No BPM">
        {dash}
      </Text>
    );
  }
  return (
    <Text as="span" fontFamily="mono" whiteSpace="nowrap">
      <Text as="span" fontWeight="semibold">
        {Number(bpm.toFixed(1))}
      </Text>
      {delta !== null && (
        <Text
          as="span"
          fontSize="12px"
          color="fg.muted"
          ml={1.5}
          aria-label={`${Math.abs(delta)} BPM ${delta < 0 ? "slower" : delta > 0 ? "faster" : "same tempo"}`}
        >
          {formatBpmDelta(delta)}
        </Text>
      )}
    </Text>
  );
}

export function GenreCell({ track }: { track: Track }) {
  const lookup = useGenreLookup();
  const { items, kind } = primaryGenreBadges(track, lookup);
  if (items.length === 0)
    return (
      <Text as="span" color="fg.subtle">
        {dash}
      </Text>
    );
  const overflow = items.length - 1;
  return (
    <Flex
      gap={1.5}
      alignItems="center"
      minW={0}
      css={{
        "& > a, & > span:not([data-overflow])": {
          display: "block",
          minWidth: 0,
          maxWidth: "140px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        },
      }}
    >
      <GenreBadgeList items={items.slice(0, 1)} kind={kind} />
      {overflow > 0 && (
        <CountTag data-overflow="" size="sm" flexShrink={0}>
          +{overflow}
        </CountTag>
      )}
    </Flex>
  );
}

export function RatingCell({ track }: { track: Track }) {
  const { saveTrack } = useTracksQuery();
  const [rating, setRating] = useState(track.star_rating ?? 0);
  useEffect(() => setRating(track.star_rating ?? 0), [track.star_rating]);
  return (
    <RatingStars
      value={rating}
      onChange={(value) => {
        setRating(value);
        saveTrack({ track_id: track.track_id, friend_id: track.friend_id, star_rating: value });
      }}
    />
  );
}

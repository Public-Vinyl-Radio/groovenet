"use client";

import React, { useEffect, useState } from "react";
import NextLink from "next/link";
import { Badge, Box, chakra, Flex, Image, Link, Text } from "@chakra-ui/react";
import AlbumLink from "@/components/AlbumLink";
import ArtistLink from "@/components/ArtistLink";
import { GenreBadgeList } from "@/components/GenreBadge";
import { KeyChip, RatingStars } from "@/components/TrackResult";
import { useGenreLookup } from "@/hooks/useGenreTaxonomyQuery";
import { useTracksQuery } from "@/hooks/useTracksQuery";
import { primaryGenreBadges } from "@/lib/genres/links";
import { camelotOf, describeMix, formatBpmDelta, KEY_RELATION_LABEL, parseBpm, type KeyRelation } from "@/lib/mixCompat";
import { formatSeconds, getTrackDurationSeconds } from "@/lib/trackUtils";
import type { Track } from "@/types/track";

type Props = {
  /** The track the page is about; BPM and key are compared against it. */
  base: Track;
  tracks: Track[];
  /** Attribution is only useful across libraries. */
  showUsername?: boolean;
  /** The row's actions menu, given the track and its zero-based position. */
  renderActions: (track: Track, index: number) => React.ReactNode;
};

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

const trackHref = (t: Track) => `/tracks/${encodeURIComponent(t.track_id)}?friend_id=${t.friend_id}`;

/** The compatibility tag; its text carries the meaning, so colour is never the only cue. */
function MixTag({ relation }: { relation: KeyRelation }) {
  return (
    <Badge size="sm" variant="subtle" colorPalette={relation === "clash" ? "neutral" : "status.success"} whiteSpace="nowrap" flexShrink={0}>
      {KEY_RELATION_LABEL[relation]}
    </Badge>
  );
}

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
        <Text as="span" fontSize="12px" color="fg.muted" ml={1.5} aria-label={`${Math.abs(delta)} BPM ${delta < 0 ? "slower" : delta > 0 ? "faster" : "same tempo"}`}>
          {formatBpmDelta(delta)}
        </Text>
      )}
    </Text>
  );
}

export function GenreCell({ track }: { track: Track }) {
  const lookup = useGenreLookup();
  const { items, kind } = primaryGenreBadges(track, lookup);
  if (items.length === 0) return <Text as="span" color="fg.subtle">{dash}</Text>;
  const overflow = items.length - 1;
  return (
    <Flex gap={1.5} alignItems="center" minW={0} css={{ "& > a, & > span:not([data-overflow])": { minWidth: 0, maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }}>
      <GenreBadgeList items={items.slice(0, 1)} kind={kind} scope="tracks" colorPalette="status.genre" variant="subtle" />
      {overflow > 0 && (
        <Badge data-overflow="" size="sm" variant="subtle" colorPalette="neutral" flexShrink={0}>
          +{overflow}
        </Badge>
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

function Artwork({ track, size }: { track: Track; size: string }) {
  return (
    <Image
      src={track.audio_file_album_art_url || track.album_thumbnail || "/images/placeholder-artwork.png"}
      alt=""
      boxSize={size}
      objectFit="cover"
      flexShrink={0}
      borderWidth="rule"
      borderColor="border.ink"
      draggable={false}
    />
  );
}

function TitleLink({ track, ...rest }: { track: Track } & React.ComponentProps<typeof Link>) {
  return (
    <Link as={NextLink} href={trackHref(track)} fontWeight="semibold" _hover={{ textDecoration: "underline" }} {...rest}>
      {track.title}
    </Link>
  );
}

/** `artist · album · year`, with the library's username when browsing every library. */
function Byline({ track, showUsername }: { track: Track; showUsername?: boolean }) {
  const parts = [
    <ArtistLink key="artist" artist={track.artist} friendId={track.friend_id} />,
    track.album ? (
      <AlbumLink key="album" releaseId={track.release_id} friendId={track.friend_id}>
        {track.album}
      </AlbumLink>
    ) : null,
    track.year && track.year !== "0" ? <span key="year">{track.year}</span> : null,
    showUsername && track.username ? <span key="user">{track.username}</span> : null,
  ].filter(Boolean);
  return (
    <>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && " · "}
          {part}
        </React.Fragment>
      ))}
    </>
  );
}

/** Desktop: a table, one column per thing a DJ compares. */
export function RelatedTrackTable({ base, tracks, showUsername, renderActions }: Props) {
  // The table has a Rating column, so stars show unrated too instead of waiting for a hover.
  const rowReveal = { "& .track-result-rating": { opacity: 1 } };
  return (
    <Box borderWidth="outline" borderColor="border.ink" boxShadow="md" overflowX="auto" data-testid="related-table">
      <Box as="table" w="full" minW="900px" css={{ borderCollapse: "collapse" }}>
        <Box as="thead" bg="bg.subtle" borderBottomWidth="outline" borderColor="border.ink">
          <tr>
            {["Track", "Side", "Time", "BPM", "Key", "Genre", "Rating"].map((name) => (
              <Th scope="col" key={name} px="12px" py="10px" {...labelHead}>
                {name}
              </Th>
            ))}
            <Th scope="col" px="12px" py="10px" w="56px">
              <Box as="span" srOnly>
                Actions
              </Box>
            </Th>
          </tr>
        </Box>
        <tbody>
          {tracks.map((t, index) => {
            const mix = describeMix(base, t);
            const camelot = camelotOf(t.key);
            const seconds = getTrackDurationSeconds(t);
            return (
              <Box
                as="tr"
                key={`${t.track_id}-${t.friend_id}`}
                borderTopWidth="1px"
                borderColor="border"
                _hover={{ bg: "bg.muted" }}
                css={{ "& > td": { padding: "10px 12px", verticalAlign: "middle" }, ...rowReveal }}
              >
                <td>
                  <Flex alignItems="center" gap={3} minW={0}>
                    <Artwork track={t} size="48px" />
                    <Box minW={0} maxW="300px">
                      <TitleLink track={t} display="block" fontSize="15px" lineHeight="20px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" />
                      <Text fontSize="12px" lineHeight="16px" color="fg.muted" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                        <Byline track={t} showUsername={showUsername} />
                      </Text>
                    </Box>
                  </Flex>
                </td>
                <Box as="td" fontFamily="mono" fontSize="13px" color="fg.muted" whiteSpace="nowrap">
                  {t.position || dash}
                </Box>
                <Box as="td" fontFamily="mono" fontSize="13px" whiteSpace="nowrap">
                  {seconds !== null ? formatSeconds(seconds) : dash}
                </Box>
                <td>
                  <BpmCell track={t} delta={mix.bpmDelta} />
                </td>
                <td>
                  <Flex alignItems="center" gap={2}>
                    {camelot ? <KeyChip keyName={t.key} camelot={camelot} /> : <Text as="span" color="fg.subtle">{dash}</Text>}
                    {mix.keyRelation && <MixTag relation={mix.keyRelation} />}
                  </Flex>
                </td>
                <td>
                  <GenreCell track={t} />
                </td>
                <td>
                  <RatingCell track={t} />
                </td>
                <Box as="td" textAlign="right">
                  {renderActions(t, index)}
                </Box>
              </Box>
            );
          })}
        </tbody>
      </Box>
    </Box>
  );
}

/** Phone: one row per track, the mix line (BPM, key, compatibility) under the title. */
export function RelatedTrackList({ base, tracks, showUsername, renderActions }: Props) {
  return (
    <Box as="ul" listStyleType="none" m={0} p={0} borderWidth="outline" borderColor="border.ink" boxShadow="md" data-testid="related-list">
      {tracks.map((t, index) => {
        const mix = describeMix(base, t);
        const camelot = camelotOf(t.key);
        const seconds = getTrackDurationSeconds(t);
        const meta = [t.artist, seconds !== null ? formatSeconds(seconds) : null, t.position || null, showUsername ? t.username : null].filter(Boolean);
        return (
          <Flex
            as="li"
            key={`${t.track_id}-${t.friend_id}`}
            gap="10px"
            py="10px"
            pl="10px"
            pr="4px"
            borderTopWidth="1px"
            borderColor="border"
            css={{ "&:first-of-type": { borderTopWidth: 0 } }}
          >
            <Artwork track={t} size="52px" />
            <Flex direction="column" gap="2px" flex={1} minW={0}>
              <TitleLink track={t} fontSize="15px" lineHeight="20px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" />
              <Text fontSize="12px" lineHeight="16px" color="fg.muted" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                {meta.join(" · ")}
              </Text>
              <Flex flexWrap="wrap" alignItems="center" gap={1.5} mt="4px">
                <BpmCell track={t} delta={mix.bpmDelta} />
                {camelot && <KeyChip keyName={t.key} camelot={camelot} showName={false} />}
                {mix.keyRelation && <MixTag relation={mix.keyRelation} />}
              </Flex>
            </Flex>
            <Box alignSelf="center" css={{ "& button": { minWidth: "44px", minHeight: "44px" } }}>
              {renderActions(t, index)}
            </Box>
          </Flex>
        );
      })}
    </Box>
  );
}

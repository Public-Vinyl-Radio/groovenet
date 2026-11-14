"use client";

import React from "react";
import NextLink from "next/link";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Box, Flex, Link, Text } from "@chakra-ui/react";
import { MetaTag, StatusTag } from "@/components/ui/RoleTags";
import type { HomeResponse } from "@/services/internalApi/home";
import Artwork from "@/components/player/Artwork";
import AlbumResult from "@/components/AlbumResult";
import type { Album } from "@/types/track";
import { useDisplayTimeZone } from "@/providers/DisplayTimeZoneProvider";
import {
  addedLabel,
  ALL_ARRIVALS_HREF,
  arrivalHref,
  arrivalsCaption,
  playsLabel,
  ratingChip,
} from "./arrivalWording";

type Arrivals = HomeResponse["new_arrivals"];
type Arrival = Arrivals["items"][number];

type Props = {
  /** Null while the summary loads or after it fails. */
  arrivals: Arrivals | null;
  friendId: number;
  loading?: boolean;
  error?: string | null;
  /** The instant "added N days ago" counts from; defaults to now. */
  now?: Date;
};

function Chip({ rating, compact }: { rating: number | null; compact?: boolean }) {
  const chip = ratingChip(rating);
  const size = compact ? "xs" : "sm";
  if (!chip.rated) {
    return (
      <StatusTag tone="neutral" size={size} flexShrink={0}>
        {chip.label}
      </StatusTag>
    );
  }
  return (
    <MetaTag role="img" aria-label={chip.description} size={size} flexShrink={0}>
      {chip.label}
    </MetaTag>
  );
}

function ListRow({
  item,
  friendId,
  added,
  first,
}: {
  item: Arrival;
  friendId: number;
  added: string;
  first: boolean;
}) {
  return (
    <Box as="li" borderTopWidth={first ? 0 : "outline"} borderColor="border.ink">
      <Link
        asChild
        display="flex"
        alignItems="center"
        gap="14px"
        minH="84px"
        px="14px"
        py="10px"
        color="fg"
        textDecoration="none"
        _hover={{ textDecoration: "none", bg: "bg.muted" }}
      >
        <NextLink href={arrivalHref(item.release_id, friendId)}>
          <Box boxSize="60px" flexShrink={0}>
            <Artwork src={item.thumbnail} alt="" fill />
          </Box>
          <Flex as="span" direction="column" flex="1" minW={0} gap="3px">
            <Text as="span" fontSize="15px" lineHeight="20px" fontWeight="semibold" truncate>
              {item.title}
            </Text>
            <Text as="span" fontSize="13px" lineHeight="18px" color="fg.muted" truncate>
              {item.artist}
            </Text>
            <Text as="span" fontFamily="mono" fontSize="11px" color="fg.muted">
              {added}
            </Text>
          </Flex>
          <Flex as="span" direction="column" align="flex-end" gap="6px" flexShrink={0}>
            <Text as="span" fontFamily="mono" fontSize="12px" fontWeight="semibold">
              {playsLabel(item.play_count)}
            </Text>
            <Chip rating={item.album_rating} />
          </Flex>
        </NextLink>
      </Link>
    </Box>
  );
}

/** A phone scroller item: the compact album card, with plays and the rating as its meta. */
function ScrollerItem({ item, friendId }: { item: Arrival; friendId: number }) {
  const album: Album = {
    release_id: item.release_id,
    friend_id: friendId,
    title: item.title,
    artist: item.artist,
    album_thumbnail: item.thumbnail ?? undefined,
    album_rating: item.album_rating ?? undefined,
    track_count: 0,
  };
  return (
    <Box as="li" flex="0 0 140px" minW={0}>
      <AlbumResult
        album={album}
        layout="card"
        size="compact"
        meta={
          <Flex as="span" flex="1" align="center" justify="space-between" gap="4px" minW={0}>
            <Text as="span" fontFamily="mono" fontSize="10px" fontWeight="semibold">
              {playsLabel(item.play_count)}
            </Text>
            <Chip rating={item.album_rating} compact />
          </Flex>
        }
      />
    </Box>
  );
}

/** The compact card's height with this meta line: 140px cover, title, artist, plays + chip. */
const COMPACT_CARD_H = "216px";

function Skeletons() {
  return (
    <Box data-testid="new-arrivals-loading" aria-hidden="true">
      <Flex display={{ base: "flex", md: "none" }} gap="14px" overflow="hidden" p="12px">
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            flex="0 0 140px"
            h={COMPACT_CARD_H}
            bg="bg.muted"
            borderWidth="outline"
            borderRadius="md"
            overflow="clip"
            borderColor="border.ink"
          />
        ))}
      </Flex>
      <Box display={{ base: "none", md: "block" }}>
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            h="84px"
            bg="bg.muted"
            borderTopWidth={i ? "outline" : 0}
            borderColor="border.ink"
          />
        ))}
      </Box>
    </Box>
  );
}

function Notice({ role, children }: { role?: "alert"; children: React.ReactNode }) {
  return (
    <Text
      role={role}
      px="14px"
      py={3}
      fontFamily="mono"
      fontSize="xs"
      letterSpacing="0.06em"
      color="fg.muted"
    >
      {children}
    </Text>
  );
}

/**
 * Home's New arrivals (#882): albums added in the last 30 days, least played
 * first (the API's order, kept). A horizontal card scroller on phones, a list
 * from `md` up. Loads and fails on its own; the header stays either way.
 */
export function NewArrivals({ arrivals, friendId, loading, error, now }: Props) {
  const timeZone = useDisplayTimeZone();
  const at = now ?? new Date();
  const items = arrivals?.items ?? [];
  const unrated = arrivals?.unrated_count ?? 0;
  const windowDays = arrivals?.window_days ?? 30;
  const showCaption = !error && !!arrivals;

  let body: React.ReactNode;
  if (error) {
    body = <Notice role="alert">COULDN&apos;T LOAD NEW ARRIVALS · {error.toUpperCase()}</Notice>;
  } else if (!arrivals || loading) {
    body = <Skeletons />;
  } else if (items.length === 0) {
    body = (
      <Notice>
        NOTHING NEW IN THE LAST {windowDays} DAYS.{" "}
        <Link asChild color="fg" fontWeight="semibold">
          <NextLink href={ALL_ARRIVALS_HREF}>BROWSE ALBUMS →</NextLink>
        </Link>
      </Notice>
    );
  } else {
    body = (
      <>
        <Box
          as="ul"
          role="list"
          display={{ base: "flex", md: "none" }}
          listStyleType="none"
          gap="14px"
          overflowX="auto"
          m={0}
          p="12px"
        >
          {items.map((item) => (
            <ScrollerItem key={item.release_id} item={item} friendId={friendId} />
          ))}
        </Box>
        <Box
          as="ul"
          role="list"
          display={{ base: "none", md: "block" }}
          listStyleType="none"
          m={0}
          p={0}
        >
          {items.map((item, i) => (
            <ListRow
              key={item.release_id}
              item={item}
              friendId={friendId}
              added={addedLabel(item.date_added, timeZone, at)}
              first={i === 0}
            />
          ))}
        </Box>
      </>
    );
  }

  return (
    <Box
      as="section"
      aria-labelledby="home-new-arrivals-heading"
      aria-busy={loading || (!arrivals && !error) || undefined}
      mr={{ md: "6px" }}
      borderWidth="outline"
      borderRadius="md"
      borderColor="border.ink"
      boxShadow="md"
      overflow="clip"
    >
      <SectionLabel
        variant="header"
        id="home-new-arrivals-heading"
        link={{ href: ALL_ARRIVALS_HREF, label: "All →" }}
        meta={
          showCaption ? (
            <>
              <Text as="span" display={{ base: "none", md: "inline" }}>
                {arrivalsCaption(unrated, windowDays, "desktop")}
              </Text>
              <Text as="span" display={{ base: "inline", md: "none" }}>
                {arrivalsCaption(unrated, windowDays, "phone")}
              </Text>
            </>
          ) : undefined
        }
      >
        NEW ARRIVALS
      </SectionLabel>
      {body}
    </Box>
  );
}

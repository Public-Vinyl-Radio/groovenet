"use client";

import React from "react";
import NextLink from "next/link";
import { Box, Flex, Heading, Link, Text } from "@chakra-ui/react";
import type { HomeResponse } from "@/services/internalApi/home";
import Artwork from "@/components/player/Artwork";
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

const mono = { fontFamily: "mono", letterSpacing: "0.08em" } as const;

function Chip({ rating, compact }: { rating: number | null; compact?: boolean }) {
  const chip = ratingChip(rating);
  return (
    <Text
      as="span"
      role={chip.rated ? "img" : undefined}
      aria-label={chip.rated ? chip.description : undefined}
      h={compact ? "18px" : "20px"}
      px={compact ? "4px" : "6px"}
      display="inline-flex"
      alignItems="center"
      borderWidth="outline"
      borderColor="border.ink"
      bg={chip.rated ? "transparent" : "fg"}
      color={chip.rated ? "fg" : "bg"}
      fontSize={compact ? "9px" : "10px"}
      fontWeight="semibold"
      flexShrink={0}
      {...mono}
    >
      {chip.label}
    </Text>
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

function Card({ item, friendId }: { item: Arrival; friendId: number }) {
  return (
    <Box as="li" flex="0 0 140px">
      <Link
        asChild
        display="flex"
        flexDirection="column"
        h="100%"
        borderWidth="outline"
        borderColor="border.ink"
        boxShadow="md"
        color="fg"
        textDecoration="none"
        _hover={{ textDecoration: "none", bg: "bg.muted" }}
      >
        <NextLink href={arrivalHref(item.release_id, friendId)}>
          <Box h="136px" borderBottomWidth="outline" borderColor="border.ink" overflow="hidden">
            <Artwork src={item.thumbnail} alt="" size="136px" />
          </Box>
          <Flex as="span" direction="column" gap="2px" p="8px" minW={0}>
            <Text as="span" fontSize="14px" lineHeight="18px" fontWeight="semibold" truncate>
              {item.title}
            </Text>
            <Text as="span" fontSize="12px" lineHeight="16px" color="fg.muted" truncate>
              {item.artist}
            </Text>
            <Flex as="span" mt="6px" align="center" justify="space-between" gap="4px">
              <Text as="span" fontFamily="mono" fontSize="10px" fontWeight="semibold">
                {playsLabel(item.play_count)}
              </Text>
              <Chip rating={item.album_rating} compact />
            </Flex>
          </Flex>
        </NextLink>
      </Link>
    </Box>
  );
}

function Skeletons() {
  return (
    <Box data-testid="new-arrivals-loading" aria-hidden="true">
      <Flex display={{ base: "flex", md: "none" }} gap="14px" overflow="hidden">
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            flex="0 0 140px"
            h="212px"
            bg="bg.muted"
            borderWidth="outline"
            borderColor="border.ink"
          />
        ))}
      </Flex>
      <Box
        display={{ base: "none", md: "block" }}
        borderWidth="outline"
        borderColor="border.ink"
        boxShadow="md"
      >
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
      borderWidth="outline"
      borderColor="border.ink"
      fontFamily="mono"
      fontSize="xs"
      letterSpacing="0.06em"
      color="fg.muted"
    >
      {children}
    </Text>
  );
}

const linkProps = {
  alignSelf: "flex-start",
  fontFamily: "mono",
  fontSize: "xs",
  fontWeight: "semibold",
  letterSpacing: "0.04em",
  color: "fg",
} as const;

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
          mx="-16px"
          my={0}
          px="16px"
          pt="2px"
          pb="8px"
        >
          {items.map((item) => (
            <Card key={item.release_id} item={item} friendId={friendId} />
          ))}
        </Box>
        <Box
          as="ul"
          role="list"
          display={{ base: "none", md: "block" }}
          listStyleType="none"
          m={0}
          p={0}
          borderWidth="outline"
          borderColor="border.ink"
          boxShadow="md"
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
        <Link asChild display={{ base: "none", md: "inline-flex" }} {...linkProps}>
          <NextLink href={ALL_ARRIVALS_HREF}>All new arrivals →</NextLink>
        </Link>
      </>
    );
  }

  return (
    <Flex
      as="section"
      aria-labelledby="home-new-arrivals-heading"
      aria-busy={loading || (!arrivals && !error) || undefined}
      direction="column"
      gap={{ base: "10px", md: "12px" }}
      mr={{ md: "6px" }}
    >
      <Flex align="center" gap={{ base: "10px", md: "12px" }}>
        <Heading
          as="h2"
          id="home-new-arrivals-heading"
          h={{ base: "24px", md: "26px" }}
          px={{ base: "8px", md: "10px" }}
          display="flex"
          alignItems="center"
          bg="fg"
          color="bg"
          fontFamily="mono"
          fontSize={{ base: "11px", md: "xs" }}
          fontWeight="semibold"
          letterSpacing="0.08em"
        >
          NEW ARRIVALS
        </Heading>
        <Box flex="1" h="2px" bg="fg" aria-hidden="true" />
        {showCaption && (
          <>
            <Text
              as="span"
              display={{ base: "none", md: "inline" }}
              fontFamily="mono"
              fontSize="xs"
              color="fg.muted"
            >
              {arrivalsCaption(unrated, windowDays, "desktop")}
            </Text>
            <Text
              as="span"
              display={{ base: "inline", md: "none" }}
              fontFamily="mono"
              fontSize="11px"
              color="fg.muted"
            >
              {arrivalsCaption(unrated, windowDays, "phone")}
            </Text>
          </>
        )}
      </Flex>
      {body}
    </Flex>
  );
}

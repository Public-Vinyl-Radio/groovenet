"use client";

import { SectionHeading } from "@/components/ui/SectionHeading";
import { innerRadius } from "@/app/corners";
import React from "react";
import NextLink from "next/link";
import { Box, Button, Link, Text } from "@chakra-ui/react";
import type { GenrePageRef } from "@/api-contract/schemas";
import { genreHref } from "@/lib/genres/links";
import { rankedSubgenres } from "@/lib/genres/discovery";
import type { CountedGenreNode } from "@/lib/genres/tree";

export function GenreBarRows({
  genres,
  empty = "No related genres in the collection yet.",
}: {
  genres: GenrePageRef[];
  empty?: string;
}) {
  const largest = Math.max(1, ...genres.map((genre) => genre.track_count));
  return (
    <Box as="ul" listStyleType="none" p={3} flex={1}>
      {genres.map((genre) => (
        <Box as="li" key={genre.id}>
          <Link asChild display="flex" minH="44px" gap={3} fontSize="sm">
            <NextLink href={genreHref(genre.slug)}>
              <Text flex={1} minW={0} overflowWrap="anywhere">
                {genre.name}
              </Text>
              <Box
                aria-hidden="true"
                w="25%"
                h="10px"
                borderWidth="rule"
                borderRadius="md"
                overflow="hidden"
                borderColor="border.ink"
                flexShrink={0}
              >
                <Box bg="fg" h="full" w={`${(genre.track_count / largest) * 100}%`} />
              </Box>
              <Text minW="4ch" flexShrink={0} textAlign="end" fontFamily="label" color="fg.muted">
                {genre.track_count.toLocaleString()}
              </Text>
            </NextLink>
          </Link>
        </Box>
      ))}
      {genres.length === 0 && (
        <Box as="li">
          <Text color="fg.muted" p={1} fontSize="sm">
            {empty}
          </Text>
        </Box>
      )}
    </Box>
  );
}

/** The outlined crate and proportional linked rows shared by discovery and detail. */
export function GenreCrate({
  title,
  href,
  count,
  genres,
  empty,
  maxRows,
  children,
}: {
  title: string;
  href?: string;
  count?: number;
  genres: GenrePageRef[];
  empty?: string;
  /** Show this many rows, with a toggle to reveal the rest in place. */
  maxRows?: number;
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const capped = maxRows !== undefined && genres.length > maxRows;
  const shown = capped && !expanded ? genres.slice(0, maxRows) : genres;
  const collapse = () => {
    setExpanded(false);
    // Focus first so the browser scrolls the heading into view; the toggle
    // that had focus has just unmounted.
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView?.({ block: "start" });
  };
  const header = (
    <>
      <SectionHeading level={3} ref={headingRef} tabIndex={-1} minW={0} overflowWrap="anywhere">
        {title}
      </SectionHeading>
      {count !== undefined && (
        <Text fontFamily="label" fontWeight="semibold" fontSize="sm">
          {count.toLocaleString()}
        </Text>
      )}
    </>
  );
  return (
    <Box
      as="article"
      aria-label={`${title} crate`}
      borderWidth="outline"
      borderRadius="md"
      borderColor="border.ink"
      boxShadow="md"
      minW={0}
      display="flex"
      flexDirection="column"
    >
      {href ? (
        <Link
          asChild
          display="flex"
          justifyContent="space-between"
          gap={3}
          minH="52px"
          px={4}
          borderRadius="0"
          borderTopRadius={innerRadius}
          borderBottomWidth="outline"
          borderColor="border.ink"
        >
          <NextLink href={href}>{header}</NextLink>
        </Link>
      ) : (
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          gap={3}
          minH="52px"
          px={4}
          borderRadius="0"
          borderTopRadius={innerRadius}
          borderBottomWidth="outline"
          borderColor="border.ink"
        >
          {header}
        </Box>
      )}
      <GenreBarRows genres={shown} empty={empty} />
      {capped && (
        <Button
          variant="ghost"
          color="fg.muted"
          minH="44px"
          w="full"
          justifyContent="start"
          px={4}
          borderWidth="0"
          borderRadius="0"
          borderBottomRadius={children ? "0" : innerRadius}
          borderTopWidth="rule"
          borderColor="border"
          fontFamily="label"
          fontSize="xs"
          aria-expanded={expanded}
          onClick={expanded ? collapse : () => setExpanded(true)}
        >
          {expanded ? "Show fewer" : `Show all ${genres.length} ${title.toLowerCase()}`}
        </Button>
      )}
      {children}
    </Box>
  );
}

export function GenreIndexCrate({
  entry,
  onOpen,
}: {
  entry: CountedGenreNode;
  onOpen: () => void;
}) {
  return (
    <GenreCrate
      title={entry.node.name}
      href={genreHref(entry.node.slug)}
      count={entry.count}
      genres={rankedSubgenres(entry)
        .slice(0, 5)
        .map((child) => ({ ...child.node, track_count: child.count }))}
      empty="No subgenres with tracks yet."
    >
      <Button
        variant="plain"
        minH="44px"
        w="full"
        justifyContent="start"
        px={4}
        borderWidth="0"
        borderRadius="0"
        borderBottomRadius={innerRadius}
        borderTopWidth="rule"
        borderColor="border"
        fontFamily="label"
        fontSize="xs"
        textDecoration="underline"
        whiteSpace="normal"
        onClick={onOpen}
      >
        All {entry.node.name.toLowerCase()} subgenres →
      </Button>
    </GenreCrate>
  );
}

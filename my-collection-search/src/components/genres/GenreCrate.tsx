"use client";

import React from "react";
import NextLink from "next/link";
import { Box, Button, Heading, Link, Text } from "@chakra-ui/react";
import type { GenrePageRef } from "@/api-contract/schemas";
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
            <NextLink href={`/genres/${encodeURIComponent(genre.slug)}`}>
              <Text flex={1} minW={0} overflowWrap="anywhere">
                {genre.name}
              </Text>
              <Box
                aria-hidden="true"
                w="25%"
                h="10px"
                borderWidth="rule"
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
  children,
}: {
  title: string;
  href?: string;
  count?: number;
  genres: GenrePageRef[];
  empty?: string;
  children?: React.ReactNode;
}) {
  const header = (
    <>
      <Heading as="h3" fontSize="lg" minW={0} overflowWrap="anywhere">
        {title}
      </Heading>
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
          borderBottomWidth="outline"
          borderColor="border.ink"
        >
          {header}
        </Box>
      )}
      <GenreBarRows genres={genres} empty={empty} />
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
      href={`/genres/${encodeURIComponent(entry.node.slug)}`}
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

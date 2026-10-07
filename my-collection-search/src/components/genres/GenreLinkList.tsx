"use client";

import NextLink from "next/link";
import { Badge, Flex, Text } from "@chakra-ui/react";
import type { GenrePageRef } from "@/api-contract/schemas";

/** Links to genre pages (#376), each with how many tracks it holds, subgenres included. */
export default function GenreLinkList({ genres, empty }: { genres: GenrePageRef[]; empty?: string }) {
  if (genres.length === 0) {
    return empty ? (
      <Text fontSize="sm" color="fg.muted">
        {empty}
      </Text>
    ) : null;
  }
  return (
    <Flex gap={2} flexWrap="wrap">
      {genres.map((genre) => (
        <Badge
          key={genre.id}
          asChild
          size="md"
          variant="surface"
          cursor="pointer"
          focusVisibleRing="outside"
          _hover={{ textDecoration: "underline" }}
        >
          <NextLink href={`/genres/${encodeURIComponent(genre.slug)}`}>
            {genre.name}
            <Text as="span" color="fg.muted" ms={1}>
              {genre.track_count.toLocaleString()}
            </Text>
          </NextLink>
        </Badge>
      ))}
    </Flex>
  );
}

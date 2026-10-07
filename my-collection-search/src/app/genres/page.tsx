"use client";

import React from "react";
import NextLink from "next/link";
import { Box, Checkbox, Flex, Heading, Input, Link, Skeleton, Stack, Text, VStack } from "@chakra-ui/react";
import PageContainer from "@/components/layout/PageContainer";
import { useGenreTaxonomyQuery } from "@/hooks/useGenreTaxonomyQuery";
import { useTrackGenreFacets } from "@/hooks/useTrackGenreFacets";
import { countGenreTree, type CountedGenreNode } from "@/lib/genres/tree";
import { useUsername } from "@/providers/UsernameProvider";

function GenreRow({ entry, depth }: { entry: CountedGenreNode; depth: number }) {
  return (
    <>
      <Flex as="li" justify="space-between" gap={3} py={1} ps={depth * 5} borderBottomWidth="1px">
        <Link asChild fontWeight={depth === 0 ? "semibold" : "normal"} focusVisibleRing="outside">
          <NextLink href={`/genres/${encodeURIComponent(entry.node.slug)}`}>{entry.node.name}</NextLink>
        </Link>
        <Text color="fg.muted" fontSize="sm">
          {entry.count.toLocaleString()}
        </Text>
      </Flex>
      {entry.children.map((child) => (
        <GenreRow key={child.node.id} entry={child} depth={depth + 1} />
      ))}
    </>
  );
}

/** `/genres` (#376): the whole taxonomy with how many tracks the collection has in each. */
export default function GenresPage() {
  const { friend } = useUsername();
  const { data: tree, error } = useGenreTaxonomyQuery();
  const { counts } = useTrackGenreFacets({
    q: "",
    filter: friend ? `friend_id = ${friend.id}` : undefined,
    enabled: friend !== null && friend !== undefined,
  });
  const [search, setSearch] = React.useState("");
  const [showEmpty, setShowEmpty] = React.useState(false);

  const entries = React.useMemo(
    () => (tree && counts ? countGenreTree(tree, counts, { showEmpty, search }) : null),
    [tree, counts, showEmpty, search]
  );

  return (
    <PageContainer size="standard">
      <Stack gap={4}>
        <Box>
          <Heading size="2xl">Genres</Heading>
          <Text color="fg.muted" mt={1}>
            Browse the collection by genre. Counts include subgenres.
          </Text>
        </Box>

        <Flex gap={4} align="center" flexWrap="wrap">
          <Input
            placeholder="Find a genre"
            aria-label="Find a genre"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxW="320px"
          />
          <Checkbox.Root checked={showEmpty} onCheckedChange={(event) => setShowEmpty(event.checked === true)}>
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <Checkbox.Label>Show genres with no tracks</Checkbox.Label>
          </Checkbox.Root>
        </Flex>

        {error ? (
          <Text color="red.500">Couldn&apos;t load the genre taxonomy: {error.message}</Text>
        ) : !entries ? (
          <VStack align="stretch" gap={2} data-testid="genres-loading">
            <Skeleton height="24px" />
            <Skeleton height="24px" />
            <Skeleton height="24px" />
          </VStack>
        ) : entries.length === 0 ? (
          <Text color="fg.muted">No genres match.</Text>
        ) : (
          <Box as="ul" listStyleType="none" aria-label="Genre taxonomy">
            {entries.map((entry) => (
              <GenreRow key={entry.node.id} entry={entry} depth={0} />
            ))}
          </Box>
        )}
      </Stack>
    </PageContainer>
  );
}

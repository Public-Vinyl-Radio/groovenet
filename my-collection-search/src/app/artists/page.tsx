"use client";

import { usePaletteScope } from "@/providers/CommandPaletteProvider";

import React, { Suspense } from "react";
import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Box, Button, Flex, Link, Skeleton, Stack, Text } from "@chakra-ui/react";
import PageContainer from "@/components/layout/PageContainer";
import PageHeader from "@/components/layout/PageHeader";
import { ListSearchRow, SearchField } from "@/components/layout/ListHeader";
import { artistCountsLabel } from "@/components/ArtistFilter";
import { useArtistListQuery } from "@/hooks/useArtistListQuery";
import { useUsername } from "@/providers/UsernameProvider";
import { INDEX_LETTERS, artistCountLabel, indexLetterFromParam } from "@/lib/artists/indexLetters";

function LetterBar({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (letter: string | undefined) => void;
}) {
  const key = (label: string, letter: string | undefined) => {
    const on = value === letter;
    return (
      <Button
        key={label}
        size="xs"
        minW="32px"
        px={1}
        variant={on ? "solid" : "outline"}
        colorPalette="neutral"
        aria-pressed={on}
        aria-label={letter === "#" ? "Other characters" : (letter ?? "All artists")}
        onClick={() => onChange(letter)}
      >
        {label}
      </Button>
    );
  };
  return (
    <Flex as="nav" aria-label="Artists by letter" wrap="wrap" gap="6px">
      {key("All", undefined)}
      {INDEX_LETTERS.map((letter) => key(letter, letter))}
    </Flex>
  );
}

function ArtistsPageContent() {
  const router = useRouter();
  const pathname = usePathname() ?? "/artists";
  const searchParams = useSearchParams();
  const { friend, isHydrated } = useUsername();

  const urlQuery = searchParams.get("q") ?? "";
  const letter = indexLetterFromParam(searchParams.get("letter"));
  const [input, setInput] = React.useState(urlQuery);
  React.useEffect(() => setInput(urlQuery), [urlQuery]);

  const writeUrl = React.useCallback(
    (next: { q?: string; letter?: string | undefined }) => {
      const params = new URLSearchParams(searchParams.toString());
      const q = next.q !== undefined ? next.q.trim() : urlQuery;
      if (q) params.set("q", q);
      else params.delete("q");
      const nextLetter = "letter" in next ? next.letter : letter;
      if (nextLetter) params.set("letter", nextLetter);
      else params.delete("letter");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    [letter, pathname, router, searchParams, urlQuery],
  );

  usePaletteScope({
    id: "artists",
    label: "Artists",
    onSearch: (q) => {
      setInput(q);
      writeUrl({ q });
    },
  });

  // Search as the viewer types, once they pause.
  React.useEffect(() => {
    if (input.trim() === urlQuery) return;
    const handle = setTimeout(() => writeUrl({ q: input }), 250);
    return () => clearTimeout(handle);
  }, [input, urlQuery, writeUrl]);

  const { artists, total, isPending, isError, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useArtistListQuery({
      q: urlQuery,
      letter,
      friendId: friend?.id,
      enabled: isHydrated,
    });

  return (
    <PageContainer>
      <PageHeader>
        <PageHeader.Title meta={total === undefined ? undefined : artistCountLabel(total)}>
          Artists
        </PageHeader.Title>
      </PageHeader>
      <Stack gap={4}>
        <PageHeader.Toolbar>
          <ListSearchRow
            maxW="640px"
            mb={0}
            field={
              <SearchField
                value={input}
                onChange={setInput}
                onEnter={() => writeUrl({ q: input })}
                label="Search artists"
                placeholder="Search artists by name or alias"
              />
            }
          />
        </PageHeader.Toolbar>
        <LetterBar value={letter} onChange={(next) => writeUrl({ letter: next })} />

        {!isHydrated || isPending ? (
          <Stack gap={2} data-testid="artists-loading">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} h="44px" />
            ))}
          </Stack>
        ) : isError ? (
          <Text color="fg.muted">Couldn&apos;t load artists.</Text>
        ) : artists.length === 0 ? (
          <Text color="fg.muted">
            {urlQuery || letter ? "No artists match." : "No artists in this collection yet."}
          </Text>
        ) : (
          <>
            <Box
              as="ul"
              aria-label="Artists"
              listStyleType="none"
              borderWidth="outline"
              borderColor="border.ink"
              borderRadius="md"
              boxShadow="md"
              bg="bg"
              me="6px"
            >
              {artists.map((artist, index) => (
                <Box
                  as="li"
                  key={artist.id}
                  borderTopWidth={index === 0 ? 0 : "rule"}
                  borderColor="border"
                >
                  <Link
                    asChild
                    display="flex"
                    alignItems="center"
                    justifyContent="space-between"
                    gap={3}
                    minH="48px"
                    px={3}
                    py={2}
                    borderRadius="0"
                    _hover={{ bg: "bg.muted", textDecoration: "none" }}
                  >
                    <NextLink href={`/artists/${encodeURIComponent(artist.slug)}`}>
                      <Box minW={0}>
                        <Text fontWeight="semibold" truncate title={artist.name}>
                          {artist.name}
                        </Text>
                        {artist.sort_name !== artist.name && (
                          <Text fontSize="sm" color="fg.muted" truncate>
                            {artist.sort_name}
                          </Text>
                        )}
                      </Box>
                      <Text
                        fontFamily="label"
                        fontSize="sm"
                        color="fg.muted"
                        flexShrink={0}
                        textAlign="right"
                      >
                        {artistCountsLabel(artist)}
                      </Text>
                    </NextLink>
                  </Link>
                </Box>
              ))}
            </Box>
            {hasNextPage && (
              <Flex justify="center">
                <Button
                  size="sm"
                  variant="outline"
                  loading={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                >
                  Show more
                </Button>
              </Flex>
            )}
          </>
        )}
      </Stack>
    </PageContainer>
  );
}

export default function ArtistsPage() {
  return (
    <Suspense fallback={null}>
      <ArtistsPageContent />
    </Suspense>
  );
}

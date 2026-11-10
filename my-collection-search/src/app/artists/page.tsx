"use client";

import { usePaletteScope } from "@/providers/CommandPaletteProvider";

import React, { Suspense } from "react";
import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Box, Button, Flex, Link, Skeleton, Stack, Text } from "@chakra-ui/react";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { ArtistJumpIndex, JUMP_ROW_HEIGHT } from "@/components/artists/ArtistJumpIndex";
import PageContainer from "@/components/layout/PageContainer";
import PageHeader from "@/components/layout/PageHeader";
import { ListSearchRow, SearchField } from "@/components/layout/ListHeader";
import { artistCountsLabel } from "@/components/ArtistFilter";
import {
  ARTIST_FULL_PAGE_SIZE,
  useArtistLetters,
  useArtistListQuery,
} from "@/hooks/useArtistListQuery";
import type { ArtistListItem } from "@/api-contract/schemas";
import { useUsername } from "@/providers/UsernameProvider";
import {
  artistCountLabel,
  groupByIndexLetter,
  indexLetterFromHash,
  indexLetterFromParam,
} from "@/lib/artists/indexLetters";

const sectionId = (letter: string) => `artists-letter-${letter === "#" ? "other" : letter}`;

/** A section header sticks below the phone bar; on desktop, below the index row. */
const STICKY_TOP = { base: "calc(var(--safe-top) + var(--header-h))", md: JUMP_ROW_HEIGHT };

function ArtistRow({ artist, first }: { artist: ArtistListItem; first: boolean }) {
  return (
    <Box as="li" borderTopWidth={first ? 0 : "rule"} borderColor="border">
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
          <Text fontFamily="label" fontSize="sm" color="fg.muted" flexShrink={0} textAlign="right">
            {artistCountsLabel(artist)}
          </Text>
        </NextLink>
      </Link>
    </Box>
  );
}

/** One outlined block of artist rows with its own shadow. */
function ArtistBlock({ label, artists }: { label: string; artists: ArtistListItem[] }) {
  return (
    <Box
      as="ul"
      aria-label={label}
      listStyleType="none"
      borderWidth="outline"
      borderColor="border.ink"
      borderRadius="md"
      boxShadow="md"
      bg="bg"
      me="6px"
    >
      {artists.map((artist, index) => (
        <ArtistRow key={artist.id} artist={artist} first={index === 0} />
      ))}
    </Box>
  );
}

/** The section whose header has reached the top of the page, as the viewer scrolls. */
function useActiveLetter(letters: string[]) {
  const [active, setActive] = React.useState<string | undefined>();
  const key = letters.join("");
  React.useEffect(() => {
    if (!key) return setActive(undefined);
    const update = () => {
      let current = key[0];
      for (const letter of key) {
        const section = document.getElementById(sectionId(letter))?.closest("section");
        if (!section) continue;
        const top = parseFloat(getComputedStyle(section.firstElementChild!).top);
        if (section.getBoundingClientRect().top <= (Number.isNaN(top) ? 0 : top) + 1) {
          current = letter;
        }
      }
      setActive(current);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [key]);
  return active;
}

function ArtistsPageContent() {
  const router = useRouter();
  const pathname = usePathname() ?? "/artists";
  const searchParams = useSearchParams();
  const { friend, isHydrated } = useUsername();

  const urlQuery = searchParams.get("q") ?? "";
  // `?letter=` was the filter's URL; it's a jump target now (#1116).
  const legacyLetter = indexLetterFromParam(searchParams.get("letter"));
  const [input, setInput] = React.useState(urlQuery);
  React.useEffect(() => setInput(urlQuery), [urlQuery]);

  const writeUrl = React.useCallback(
    (next: { q?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      const q = next.q !== undefined ? next.q.trim() : urlQuery;
      if (q) params.set("q", q);
      else params.delete("q");
      params.delete("letter");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router, searchParams, urlQuery],
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

  const grouped = urlQuery === "";
  const { artists, total, isPending, isError, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useArtistListQuery({
      q: urlQuery,
      friendId: friend?.id,
      enabled: isHydrated,
      pageSize: grouped ? ARTIST_FULL_PAGE_SIZE : undefined,
    });
  const letterCounts = useArtistLetters(friend?.id, isHydrated && grouped);

  // The grouped list loads whole, so a jump never lands on a section that isn't there.
  React.useEffect(() => {
    if (grouped && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [grouped, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const groups = React.useMemo(() => groupByIndexLetter(artists), [artists]);
  const countByLetter = React.useMemo(
    () => new Map(letterCounts.data?.letters.map(({ letter, count }) => [letter, count])),
    [letterCounts.data],
  );
  const available = React.useMemo(
    () => new Set(countByLetter.size ? countByLetter.keys() : groups.map((g) => g.letter)),
    [countByLetter, groups],
  );
  const active = useActiveLetter(grouped ? groups.map((g) => g.letter) : []);

  // A letter to scroll to: from the hash, an old `?letter=` link, or the index.
  const [pending, setPending] = React.useState<string | undefined>();
  React.useEffect(() => {
    const fromHash = () => {
      const letter = indexLetterFromHash(window.location.hash);
      if (letter) setPending(letter);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  React.useEffect(() => {
    if (!legacyLetter) return;
    setPending(legacyLetter);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("letter");
    const query = params.toString();
    router.replace(
      `${query ? `${pathname}?${query}` : pathname}#${encodeURIComponent(legacyLetter)}`,
    );
  }, [legacyLetter, pathname, router, searchParams]);

  const scrollTo = React.useCallback((letter: string) => {
    const heading = document.getElementById(sectionId(letter));
    if (!heading) return false;
    heading.closest("section")?.scrollIntoView({ block: "start" });
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    return true;
  }, []);
  const jump = React.useCallback(
    (letter: string) => {
      if (!scrollTo(letter)) return;
      window.history.replaceState(null, "", `#${encodeURIComponent(letter)}`);
    },
    [scrollTo],
  );
  React.useEffect(() => {
    if (!pending || !grouped || isPending) return;
    // Wait for the section to load; give up when the collection has none.
    if (scrollTo(pending) || (!hasNextPage && !isFetchingNextPage)) setPending(undefined);
  }, [pending, grouped, isPending, groups, hasNextPage, isFetchingNextPage, scrollTo]);

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
        {grouped && available.size > 0 && (
          <ArtistJumpIndex available={available} active={active} onJump={jump} />
        )}

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
            {urlQuery ? "No artists match." : "No artists in this collection yet."}
          </Text>
        ) : grouped ? (
          <Stack gap={5} pe={{ base: "28px", md: 0 }}>
            {groups.map((group) => (
              <Box
                as="section"
                key={group.letter}
                aria-label={`Artists ${group.letter}`}
                // Land with the header at its stuck position, not under the index row.
                scrollMarginTop={{ base: 0, md: "-16px" }}
              >
                <Box position="sticky" top={STICKY_TOP} zIndex={50} bg="bg" pt={1} pb={2}>
                  <SectionLabel variant="strip" id={sectionId(group.letter)}>
                    {`${group.letter} · ${countByLetter.get(group.letter) ?? group.items.length}`}
                  </SectionLabel>
                </Box>
                <ArtistBlock label={`Artists under ${group.letter}`} artists={group.items} />
              </Box>
            ))}
          </Stack>
        ) : (
          <>
            <ArtistBlock label="Artists" artists={artists} />
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

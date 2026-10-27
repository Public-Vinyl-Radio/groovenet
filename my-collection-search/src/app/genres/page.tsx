"use client";

import React from "react";
import NextLink from "next/link";
import { Box, Button, Checkbox, Flex, Grid, Heading, Link, Skeleton, Stack, Text } from "@chakra-ui/react";
import AlbumResult from "@/components/AlbumResult";
import PageContainer from "@/components/layout/PageContainer";
import PageHeader from "@/components/layout/PageHeader";
import { SearchField } from "@/components/layout/ListHeader";
import RetroDialog from "@/components/ui/RetroDialog";
import { useGenreTaxonomyQuery } from "@/hooks/useGenreTaxonomyQuery";
import { useTrackGenreFacets } from "@/hooks/useTrackGenreFacets";
import { useRecentAlbumsQuery } from "@/hooks/useRecentAlbumsQuery";
import { countGenreTree, type CountedGenreNode } from "@/lib/genres/tree";
import { arrivalGenreSummary, rankedSubgenres } from "@/lib/genres/discovery";
import { flattenGenreTree } from "@/lib/genres/options";
import { useUsername } from "@/providers/UsernameProvider";

const genreHref = (entry: CountedGenreNode) => `/genres/${encodeURIComponent(entry.node.slug)}`;
// Semantic fills repeat for large taxonomies; names and counts identify every segment.
const fills = ["fg", "fg.muted", "border", "bg.muted", "bg.subtle"];

function Section({ title, mobileTitle, note, children }: { title: string; mobileTitle?: string; note?: string; children: React.ReactNode }) {
  return (
    <Box as="section" aria-label={title}>
      <Flex align="center" gap={3} mb={3} flexWrap="wrap">
        <Heading as="h2" fontFamily="label" fontSize="xs" letterSpacing="0.06em" textTransform="uppercase" bg="fg" color="bg" px={2} py={1}>
          <Box as="span" display={{ base: "inline", md: "none" }}>{mobileTitle ?? title}</Box>
          <Box as="span" display={{ base: "none", md: "inline" }}>{title}</Box>
        </Heading>
        <Box flex={1} minW={5} borderTopWidth="outline" borderColor="border.ink" />
        {note && <Text display={{ base: "none", md: "block" }} fontFamily="label" fontSize="xs" color="fg.muted">{note}</Text>}
      </Flex>
      {children}
    </Box>
  );
}

function GenreRows({ entries, depth = 0 }: { entries: CountedGenreNode[]; depth?: number }) {
  return entries.map((entry) => (
    <React.Fragment key={entry.node.id}>
      <Box as="li" listStyleType="none">
        <Link asChild display="flex" justifyContent="space-between" minH="44px" gap={3} ps={depth * 4} borderBottomWidth="rule" borderColor="border">
          <NextLink href={genreHref(entry)}>
            <Text fontWeight={depth === 0 ? "semibold" : "normal"}>{entry.node.name}</Text>
            <Text fontFamily="label" fontSize="sm" color="fg.muted">{entry.count.toLocaleString()}</Text>
          </NextLink>
        </Link>
        {entry.children.length > 0 && <Box as="ul"><GenreRows entries={entry.children} depth={depth + 1} /></Box>}
      </Box>
    </React.Fragment>
  ));
}

function GenreMix({ entries }: { entries: CountedGenreNode[] }) {
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  return (
    <Section title="The collection, by genre" mobileTitle="By genre" note="by tracks">
      {/* The legend supplies the links; tiny proportional segments need not be touch targets. */}
      <Flex aria-hidden="true" h={{ base: "28px", md: "44px" }} borderWidth="outline" borderColor="border.ink" boxShadow="sm" mb={4}>
        {entries.map((entry, index) => (
          <Box key={entry.node.id} data-testid="genre-mix-segment" width={`${entry.count / total * 100}%`} minW={0} overflow="hidden" bg={fills[index % fills.length]} color={index % fills.length < 2 ? "bg" : "fg"} borderInlineEndWidth="rule" borderColor="border.ink" px={{ base: 0, md: 2 }} display="flex" alignItems="center">
            <Text display={{ base: "none", md: "block" }} fontFamily="label" fontSize="xs" textTransform="uppercase" truncate>{entry.node.name}</Text>
          </Box>
        ))}
      </Flex>
      <Grid as="ul" aria-label="Genre mix" listStyleType="none" templateColumns={{ base: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" }} columnGap={5}>
        {entries.map((entry, index) => (
          <Box as="li" key={entry.node.id} minW={0}>
            <Link asChild display="flex" minH="44px" gap={2} w="full" fontSize="sm">
              <NextLink href={genreHref(entry)}>
                <Box aria-hidden="true" boxSize="14px" flexShrink={0} bg={fills[index % fills.length]} borderWidth="outline" borderColor="border.ink" />
                <Text flex={1}>{entry.node.name}</Text>
                <Text fontFamily="label" fontSize="xs" color="fg.muted">{entry.count.toLocaleString()}</Text>
              </NextLink>
            </Link>
          </Box>
        ))}
      </Grid>
    </Section>
  );
}

function Crate({ entry, onOpen }: { entry: CountedGenreNode; onOpen: () => void }) {
  const subgenres = rankedSubgenres(entry).slice(0, 5);
  const largest = subgenres[0]?.count ?? 1;
  return (
    <Box as="article" aria-label={`${entry.node.name} crate`} borderWidth="outline" borderColor="border.ink" boxShadow="md" minW={0} display="flex" flexDirection="column">
      <Link asChild display="flex" justifyContent="space-between" gap={3} minH="52px" px={4} borderBottomWidth="outline" borderColor="border.ink">
        <NextLink href={genreHref(entry)}>
          <Heading as="h3" fontSize="lg">{entry.node.name}</Heading>
          <Text fontFamily="label" fontWeight="semibold" fontSize="sm">{entry.count.toLocaleString()}</Text>
        </NextLink>
      </Link>
      <Box as="ul" listStyleType="none" p={3} flex={1}>
        {subgenres.map((child) => (
          <Box as="li" key={child.node.id}>
            <Link asChild display="flex" minH="44px" gap={3} fontSize="sm">
              <NextLink href={genreHref(child)}>
                <Text flex={1}>{child.node.name}</Text>
                <Box aria-hidden="true" w="25%" h="10px" borderWidth="rule" borderColor="border.ink" flexShrink={0}>
                  <Box bg="fg" h="full" w={`${child.count / largest * 100}%`} />
                </Box>
                <Text minW="4ch" textAlign="end" fontFamily="label" color="fg.muted">{child.count.toLocaleString()}</Text>
              </NextLink>
            </Link>
          </Box>
        ))}
        {subgenres.length === 0 && <Box as="li"><Text color="fg.muted" p={1} fontSize="sm">No subgenres with tracks yet.</Text></Box>}
      </Box>
      <Button variant="plain" minH="44px" w="full" justifyContent="start" px={4} borderTopWidth="rule" borderColor="border" fontFamily="label" fontSize="xs" textDecoration="underline" whiteSpace="normal" onClick={onOpen}>
        All {entry.node.name.toLowerCase()} subgenres →
      </Button>
    </Box>
  );
}

/** `/genres` (#815): discover the collection through its parent/child taxonomy. */
export default function GenresPage() {
  const { friend } = useUsername();
  const { data: tree, error: taxonomyError } = useGenreTaxonomyQuery();
  const { counts, error: countsError, isPlaceholderData } = useTrackGenreFacets({
    q: "",
    filter: friend ? `friend_id = ${friend.id}` : undefined,
    enabled: friend !== null && friend !== undefined,
  });
  const arrivals = useRecentAlbumsQuery(friend?.id);
  const [search, setSearch] = React.useState("");
  const [openCrateId, setOpenCrateId] = React.useState<string | null>(null);
  const [showEmpty, setShowEmpty] = React.useState(false);
  const entries = React.useMemo(
    () => tree && counts && !isPlaceholderData ? countGenreTree(tree, counts, { showEmpty: false, search: "" }) : null,
    [tree, counts, isPlaceholderData]
  );
  const searchEntries = React.useMemo(
    () => tree && counts && !isPlaceholderData ? countGenreTree(tree, counts, { showEmpty: true, search }) : [],
    [tree, counts, search, isPlaceholderData]
  );
  const fullCrate = React.useMemo(
    () => tree && counts && !isPlaceholderData ? countGenreTree(tree, counts, { showEmpty, search: "" }).find((entry) => entry.node.id === openCrateId) : undefined,
    [tree, counts, showEmpty, openCrateId, isPlaceholderData]
  );
  const summary = React.useMemo(
    () => arrivalGenreSummary(arrivals.albums, tree ?? []).map((genre) => `${genre.label} +${genre.count}`).join(" · "),
    [arrivals.albums, tree]
  );
  const genreCount = tree && counts && !isPlaceholderData ? flattenGenreTree(tree).filter((node) => (counts.get(node.id) ?? 0) > 0).length : undefined;
  const error = taxonomyError ?? countsError;

  return (
    <PageContainer size="standard">
      <PageHeader
        title="Genres"
        count={genreCount === undefined ? undefined : `${genreCount.toLocaleString()} genres`}
        desktopActions={
          <Box w="320px">
            <SearchField label="Find a genre" placeholder="Find a genre" value={search} onChange={setSearch} />
          </Box>
        }
      />
      <Stack gap={7}>
        <Box display={{ base: "block", md: "none" }}>
          <SearchField label="Find a genre" placeholder="Find a genre" value={search} onChange={setSearch} />
        </Box>
        {error ? (
          <Text role="alert" color="fg.error">Couldn&apos;t load genres: {error.message}</Text>
        ) : !entries ? (
          <Stack data-testid="genres-loading"><Skeleton h="44px" /><Skeleton h="180px" /><Skeleton h="240px" /></Stack>
        ) : search.trim() ? (
          <Section title="Search results">
            {searchEntries.length > 0 ? <Box as="ul" aria-label="Matching genres" listStyleType="none"><GenreRows entries={searchEntries} /></Box> : <Text color="fg.muted">No genres match.</Text>}
          </Section>
        ) : (
          <>
            {entries.length > 0 ? <GenreMix entries={entries} /> : <Text color="fg.muted">No genres in this collection yet.</Text>}
            <Section title="New arrivals" note={arrivals.albums.length > 0 ? `Last ${arrivals.albums.length} albums brought in` : undefined}>
              {arrivals.error ? <Text role="alert" color="fg.error">Couldn&apos;t load new arrivals: {arrivals.error.message}</Text> : arrivals.isPending ? <Skeleton h="140px" /> : arrivals.albums.length === 0 ? <Text color="fg.muted">No albums in this collection yet.</Text> : (
                <>
                  {summary && <Text fontFamily="label" fontSize="xs" color="fg.muted" textTransform="uppercase" mb={3}>{summary}</Text>}
                  <Grid templateColumns={{ base: `repeat(${arrivals.albums.length}, 160px)`, md: "repeat(2, minmax(0, 1fr))", xl: "repeat(4, minmax(0, 1fr))" }} gap={5} overflowX={{ base: "auto", md: "visible" }} p="0 6px 6px 0" aria-label="Recent albums" tabIndex={0}>
                    {arrivals.albums.map((album) => <AlbumResult key={`${album.release_id}:${album.friend_id}`} albumRef={album} layout="discovery" />)}
                  </Grid>
                </>
              )}
            </Section>
            <Section title="Crates" note="Top subgenres in each">
              <Grid templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" }} gap={5} p="0 6px 6px 0">
                {entries.map((entry) => <Crate key={entry.node.id} entry={entry} onOpen={() => { setOpenCrateId(entry.node.id); setShowEmpty(false); }} />)}
              </Grid>
            </Section>
          </>
        )}
      </Stack>
      <RetroDialog open={openCrateId !== null} onOpenChange={() => setOpenCrateId(null)} title={`${fullCrate?.node.name ?? "Genre"} subgenres`}>
        <Stack p={4} gap={3}>
          <Checkbox.Root minH="44px" checked={showEmpty} onCheckedChange={(event) => setShowEmpty(event.checked === true)}>
            <Checkbox.HiddenInput /><Checkbox.Control /><Checkbox.Label>Show genres with no tracks</Checkbox.Label>
          </Checkbox.Root>
          {fullCrate && fullCrate.children.length > 0 ? <Box as="ul" aria-label="All subgenres" listStyleType="none"><GenreRows entries={fullCrate.children} /></Box> : <Text color="fg.muted">No subgenres to show.</Text>}
        </Stack>
      </RetroDialog>
    </PageContainer>
  );
}

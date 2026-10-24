"use client";
import React, { useEffect, useRef } from "react";
import { Box, Flex, Grid, Spinner, Text, Button } from "@chakra-ui/react";
import { useAlbumsInfiniteQuery } from "@/hooks/useAlbumsQuery";
import { useAlbumsByRefs } from "@/hooks/useAlbum";
import AlbumResult, { ALBUM_MISSING_TAGS, type AlbumMissingKey } from "./AlbumResult";
import AlbumTable from "./AlbumTable";
import { useSearchParams } from "next/navigation";
import type { GenreFilterRef } from "@/lib/trackFilterSpec";

export default function AlbumSearchResults({
  friendId,
  onAddedGenresChange,
  layout = "card",
}: {
  friendId: number;
  /** Genres `include_similar` added (#485), reported up for the page to show as chips. */
  onAddedGenresChange?: (genres: GenreFilterRef[]) => void;
  /** "row" is the table list view; "card" the outlined cards (and every phone). */
  layout?: "row" | "card";
}) {
  const searchParams = useSearchParams();
  const observerTarget = useRef<HTMLDivElement>(null);

  const query = searchParams.get("q") || "";
  const sort = searchParams.get("sort") || "created_at:desc";
  const missingLibraryIdentifier = searchParams.get("missing_library_identifier") === "1";
  const missingLocalCoverArtUrl = searchParams.get("missing_local_cover_art_url") === "1";
  const missingAudio = searchParams.get("missing_audio") === "1";
  const missingTags = (Object.keys(ALBUM_MISSING_TAGS) as AlbumMissingKey[]).filter(
    (key) => searchParams.get(key) === "1"
  );
  const genres = searchParams.getAll("genre");
  const includeSimilar = searchParams.get("similar") === "1";
  const similarExclude = searchParams.getAll("similar_exclude");

  const { data, albumRefs, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } =
    useAlbumsInfiniteQuery({
      q: query,
      sort,
      friend_id: friendId,
      limit: 20,
      missing_library_identifier: missingLibraryIdentifier || undefined,
      missing_local_cover_art_url: missingLocalCoverArtUrl || undefined,
      missing_audio: missingAudio || undefined,
      ...(genres.length > 0 ? { genre: genres } : {}),
      ...(includeSimilar ? { include_similar: true } : {}),
      ...(similarExclude.length > 0 ? { similar_exclude: similarExclude } : {}),
    });

  const addedGenres = data?.pages[0]?.added_genres ?? [];
  useEffect(() => {
    onAddedGenresChange?.(addedGenres);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(addedGenres)]);

  const albumsFromStore = useAlbumsByRefs(albumRefs);
  const albumsFromQuery = data?.pages.flatMap((page) => page.hits) || [];
  const albums =
    albumsFromStore.length > 0 || albumsFromQuery.length === 0
      ? albumsFromStore
      : albumsFromQuery;

  // Intersection observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <Flex justify="center" align="center" py={10}>
        <Spinner size="xl" />
      </Flex>
    );
  }

  if (error) {
    return (
      <Box p={4}>
        <Text color="fg.error">Error loading albums: {error.message}</Text>
      </Box>
    );
  }

  const totalHits = data?.pages[0]?.estimatedTotalHits || 0;

  if (albums.length === 0) {
    return (
      <Box p={4}>
        <Text color="fg.muted">No albums found.</Text>
        {query && (
          <Text fontSize="sm" color="fg.muted" mt={2}>
            Try adjusting your search or filters.
          </Text>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Text fontSize="sm" color="fg.muted" mb={2}>
        {totalHits.toLocaleString()} {totalHits === 1 ? "album" : "albums"}
      </Text>

      {/* Album results */}
      {(() => {
        const results = albums.map((album) => (
          <AlbumResult
            key={`${album.release_id}_${album.friend_id}`}
            albumRef={{
              release_id: album.release_id,
              friend_id: album.friend_id,
            }}
            album={album}
            showEditFields={true}
            layout={layout}
            missingTags={missingTags}
          />
        ));
        return layout === "row" ? (
          <AlbumTable>{results}</AlbumTable>
        ) : (
          // Room for the cards' 6px hard shadow; each card carries a 14px mb.
          <Grid
            templateColumns={{ base: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }}
            columnGap={5}
            rowGap={{ base: 0, md: "6px" }}
            pr="6px"
            pb="6px"
          >
            {results}
          </Grid>
        );
      })()}

      {/* Infinite scroll trigger */}
      <Box ref={observerTarget} py={4}>
        {isFetchingNextPage && (
          <Flex justify="center">
            <Spinner />
          </Flex>
        )}
        {!hasNextPage && albums.length > 0 && (
          <Text textAlign="center" color="fg.muted" fontSize="sm">
            End of results
          </Text>
        )}
      </Box>

      {/* Manual load more button (backup for infinite scroll) */}
      {hasNextPage && !isFetchingNextPage && (
        <Flex justify="center" mt={4}>
          <Button onClick={() => fetchNextPage()} variant="outline">
            Load More
          </Button>
        </Flex>
      )}
    </Box>
  );
}

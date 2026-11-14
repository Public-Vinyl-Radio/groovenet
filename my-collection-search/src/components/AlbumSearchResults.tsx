"use client";
import React, { useCallback, useEffect } from "react";
import { Box, Flex, Spinner, Text, Button } from "@chakra-ui/react";
import { useAlbumsInfiniteQuery } from "@/hooks/useAlbumsQuery";
import { useAlbumsByRefs } from "@/hooks/useAlbum";
import { useInfiniteScrollSentinel } from "@/hooks/useInfiniteScrollSentinel";
import AlbumResult, { ALBUM_MISSING_TAGS, type AlbumMissingKey } from "./AlbumResult";
import AlbumTable from "./AlbumTable";
import AlbumCardGrid from "./AlbumCardGrid";
import { useSearchParams } from "next/navigation";
import { DEFAULT_ALBUM_SORT } from "./AlbumSortMenu";
import type { GenreFilterRef } from "@/lib/trackFilterSpec";
import type { ArtistFilterRef } from "@/api-contract/schemas";

export default function AlbumSearchResults({
  friendId,
  onAddedGenresChange,
  onFilterArtistsChange,
  layout = "card",
  onTotalChange,
}: {
  friendId: number;
  /** Genres `include_similar` added (#485), reported up for the page to show as chips. */
  /** `undefined` while the first page loads, so a chip can't claim "nothing added" too early. */
  onAddedGenresChange?: (genres: GenreFilterRef[] | undefined) => void;
  /** The artists an artist filter resolved to (#709), for naming the page's chips. */
  onFilterArtistsChange?: (artists: ArtistFilterRef[]) => void;
  /** "row" is the table list view; "card" the outlined cards (and every phone). */
  layout?: "row" | "card";
  /** Albums matching the search, once loaded; the filters modal shows it on its button. */
  onTotalChange?: (total: number) => void;
}) {
  const searchParams = useSearchParams();

  const query = searchParams.get("q") || "";
  const sort = searchParams.get("sort") || DEFAULT_ALBUM_SORT;
  const missingLibraryIdentifier = searchParams.get("missing_library_identifier") === "1";
  const missingLocalCoverArtUrl = searchParams.get("missing_local_cover_art_url") === "1";
  const missingAudio = searchParams.get("missing_audio") === "1";
  const missingTags = (Object.keys(ALBUM_MISSING_TAGS) as AlbumMissingKey[]).filter(
    (key) => searchParams.get(key) === "1",
  );
  const genres = searchParams.getAll("genre");
  const includeSimilar = searchParams.get("similar") === "1";
  const similarExclude = searchParams.getAll("similar_exclude");
  const artists = searchParams.getAll("artist");

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
      ...(artists.length > 0 ? { artist: artists } : {}),
    });

  const addedGenres = data?.pages[0]?.added_genres ?? [];
  useEffect(() => {
    onAddedGenresChange?.(isLoading ? undefined : addedGenres);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, JSON.stringify(addedGenres)]);

  const filterArtists = data?.pages[0]?.filter_artists;
  useEffect(() => {
    if (filterArtists) onFilterArtistsChange?.(filterArtists);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filterArtists)]);

  const totalHits = data?.pages[0]?.estimatedTotalHits || 0;
  useEffect(() => {
    if (!isLoading && !error) onTotalChange?.(totalHits);
  }, [isLoading, error, totalHits, onTotalChange]);

  const albumsFromStore = useAlbumsByRefs(albumRefs);
  const albumsFromQuery = data?.pages.flatMap((page) => page.hits) || [];
  const albums =
    albumsFromStore.length > 0 || albumsFromQuery.length === 0 ? albumsFromStore : albumsFromQuery;

  const loadMore = useCallback(() => void fetchNextPage(), [fetchNextPage]);
  const observerTarget = useInfiniteScrollSentinel({
    hasMore: Boolean(hasNextPage),
    loading: isFetchingNextPage,
    onLoadMore: loadMore,
  });

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

  if (albums.length === 0) {
    return (
      <Box>
        <Box p={4}>
          <Text color="fg.muted">No albums found.</Text>
          {query && (
            <Text fontSize="sm" color="fg.muted" mt={2}>
              Try adjusting your search or filters.
            </Text>
          )}
        </Box>
      </Box>
    );
  }

  return (
    <Box>
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
          <AlbumCardGrid>{results}</AlbumCardGrid>
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

"use client";
import React, { useEffect, useRef } from "react";
import { Box, Flex, Spinner, Text, Button } from "@chakra-ui/react";
import { useAlbumsInfiniteQuery } from "@/hooks/useAlbumsQuery";
import { useAlbumsByRefs } from "@/hooks/useAlbum";
import AlbumResult from "./AlbumResult";
import { useSearchParams } from "next/navigation";

export default function AlbumSearchResults({
  viewMode = "card",
  friendId,
}: {
  viewMode?: "card" | "table";
  friendId: number;
}) {
  const searchParams = useSearchParams();
  const observerTarget = useRef<HTMLDivElement>(null);

  const query = searchParams.get("q") || "";
  const sort = searchParams.get("sort") || "created_at:desc";
  const missingLibraryIdentifier = searchParams.get("missing_library_identifier") === "1";
  const missingLocalCoverArtUrl = searchParams.get("missing_local_cover_art_url") === "1";
  const missingAudio = searchParams.get("missing_audio") === "1";
  const genres = searchParams.getAll("genre");

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
    });
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
        <Text color="red.500">Error loading albums: {error.message}</Text>
      </Box>
    );
  }

  const totalHits = data?.pages[0]?.estimatedTotalHits || 0;

  if (albums.length === 0) {
    return (
      <Box p={4}>
        <Text color="gray.500">No albums found.</Text>
        {query && (
          <Text fontSize="sm" color="gray.400" mt={2}>
            Try adjusting your search or filters.
          </Text>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Text fontSize="sm" color="gray.500" mb={2}>
        {totalHits.toLocaleString()} {totalHits === 1 ? "album" : "albums"}
      </Text>

      {/* Album results */}
      <Box>
        {albums.map((album) => (
          <AlbumResult
            key={`${album.release_id}_${album.friend_id}`}
            albumRef={{
              release_id: album.release_id,
              friend_id: album.friend_id,
            }}
            album={album}
            showEditFields={true}
            compact={viewMode === "table"}
          />
        ))}
      </Box>

      {/* Infinite scroll trigger */}
      <Box ref={observerTarget} py={4}>
        {isFetchingNextPage && (
          <Flex justify="center">
            <Spinner />
          </Flex>
        )}
        {!hasNextPage && albums.length > 0 && (
          <Text textAlign="center" color="gray.500" fontSize="sm">
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

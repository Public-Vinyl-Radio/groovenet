"use client";

import React from "react";
import NextLink from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Box, Button, Flex, Heading, Image, Link, Spinner, Stack, Text } from "@chakra-ui/react";
import { FiImage } from "react-icons/fi";

import PageContainer from "@/components/layout/PageContainer";
import { toaster } from "@/components/ui/toaster";
import { syncArtworkIntoStores } from "@/hooks/useAlbumArtwork";
import { queryKeys } from "@/lib/queryKeys";
import { useUsername } from "@/providers/UsernameProvider";
import {
  applyAlbumArtwork,
  fetchAlbumArtworkReview,
  queueAlbumArtworkBackfill,
  type AlbumArtworkApplySource,
  type AlbumArtworkReviewItem,
} from "@/services/internalApi/albumArtwork";

const STATUS_LABELS: Record<AlbumArtworkReviewItem["art_match_status"], string> = {
  matched: "Matched",
  mismatch: "Looks different",
  no_reference: "No Discogs art to compare",
  no_candidate: "No embedded art",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function Cover({ src, caption }: { src: string | null; caption: string }) {
  return (
    <Stack gap={1} width={{ base: "50%", md: "200px" }}>
      <Box aspectRatio={1} borderRadius="md" overflow="hidden" borderWidth="1px" bg="bg.subtle">
        {src ? (
          <Image src={src} alt={caption} width="100%" height="100%" objectFit="contain" />
        ) : (
          <Flex align="center" justify="center" height="100%" color="fg.muted">
            <FiImage size={28} />
          </Flex>
        )}
      </Box>
      <Text fontSize="xs" color="fg.muted">
        {caption}
      </Text>
    </Stack>
  );
}

function ReviewRow({ item }: { item: AlbumArtworkReviewItem }) {
  const queryClient = useQueryClient();
  const apply = useMutation({
    mutationFn: (source: AlbumArtworkApplySource) =>
      applyAlbumArtwork(item.release_id, item.friend_id, source),
    onSuccess: (state) => {
      syncArtworkIntoStores(state);
      void queryClient.invalidateQueries({ queryKey: queryKeys.albumArtworkReviewRoot() });
    },
    onError: (error) =>
      toaster.create({
        title: "Could not update artwork",
        description: errorMessage(error),
        type: "error",
      }),
  });

  return (
    <Box borderWidth="1px" borderRadius="md" p={3}>
      <Flex justify="space-between" align="flex-start" gap={2} mb={3}>
        <Box minW={0}>
          <Link asChild fontWeight="semibold">
            <NextLink href={`/albums/${encodeURIComponent(item.release_id)}?friend_id=${item.friend_id}`}>
              {item.title}
            </NextLink>
          </Link>
          <Text fontSize="sm" color="fg.muted">
            {item.artist}
          </Text>
        </Box>
        <Badge colorPalette={item.art_match_status === "mismatch" ? "orange" : "gray"} flexShrink={0}>
          {STATUS_LABELS[item.art_match_status]}
          {item.art_match_distance !== null ? ` · ${item.art_match_distance}/64` : ""}
        </Badge>
      </Flex>
      <Flex gap={3} mb={3}>
        <Cover src={item.discogs_art_url} caption="Discogs" />
        <Cover src={item.apple_music_art_url} caption="Apple Music" />
      </Flex>
      <Flex gap={2} flexWrap="wrap">
        <Button
          size="sm"
          onClick={() => apply.mutate("apple_music")}
          loading={apply.isPending && apply.variables === "apple_music"}
          disabled={apply.isPending || !item.apple_music_art_url}
        >
          Use Apple Music art
        </Button>
        {item.discogs_art_url && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => apply.mutate("discogs")}
            loading={apply.isPending && apply.variables === "discogs"}
            disabled={apply.isPending}
          >
            Keep Discogs art
          </Button>
        )}
      </Flex>
    </Box>
  );
}

/**
 * Bulk artwork matching (#494): queue the matcher, then decide the albums it
 * would not decide alone — where the Apple Music art looks like a different
 * cover (often another pressing) or there was no Discogs art to compare.
 */
export default function AlbumArtworkReviewPage() {
  const { friend } = useUsername();
  const friendId = friend?.id;
  const queryClient = useQueryClient();

  const reviewQuery = useQuery({
    queryKey: queryKeys.albumArtworkReview(friendId),
    queryFn: () => fetchAlbumArtworkReview(friendId),
    enabled: !!friendId,
  });

  const backfill = useMutation({
    mutationFn: () => queueAlbumArtworkBackfill({ friend_id: friendId }),
    onSuccess: (result) => {
      toaster.create({
        title: result.queuedAlbums > 0 ? "Artwork matching queued" : "Nothing to match",
        description:
          result.queuedAlbums > 0
            ? `${result.queuedAlbums} album${result.queuedAlbums === 1 ? "" : "s"} queued. Flagged albums appear here as jobs finish.`
            : "Every album with downloaded audio has already been matched or has chosen art.",
        type: result.queuedAlbums > 0 ? "success" : "info",
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.albumArtworkReviewRoot() });
    },
    onError: (error) =>
      toaster.create({
        title: "Could not queue artwork matching",
        description: errorMessage(error),
        type: "error",
      }),
  });

  const albums = reviewQuery.data?.albums ?? [];

  return (
    <PageContainer size="standard" mb="100px">
      <Flex justify="space-between" align={{ base: "stretch", md: "center" }} gap={3} mb={2} direction={{ base: "column", md: "row" }}>
        <Heading size="lg">Album artwork</Heading>
        <Button onClick={() => backfill.mutate()} loading={backfill.isPending} disabled={!friendId}>
          Run artwork matching
        </Button>
      </Flex>
      <Text fontSize="sm" color="fg.muted" mb={6}>
        Matching compares the Apple Music art embedded in downloaded audio with the Discogs cover,
        and uses it only when they are the same image. Albums it is unsure about are listed here.
      </Text>

      {!friendId || reviewQuery.isLoading ? (
        <Flex justify="center" py={8}>
          <Spinner />
        </Flex>
      ) : reviewQuery.error ? (
        <Text color="fg.error">{errorMessage(reviewQuery.error)}</Text>
      ) : albums.length === 0 ? (
        <Text color="fg.muted">No albums need review.</Text>
      ) : (
        <Stack gap={3}>
          {albums.map((item) => (
            <ReviewRow key={`${item.release_id}:${item.friend_id}`} item={item} />
          ))}
        </Stack>
      )}
    </PageContainer>
  );
}

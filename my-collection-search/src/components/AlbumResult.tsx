"use client";
import React, { useState } from "react";
import NextLink from "next/link";
import {
  Box,
  Flex,
  Text,
  Link,
  Image,
  Button,
  Icon,
  RatingGroup,
  Badge,
} from "@chakra-ui/react";
import { useColorModeValue } from "@/components/ui/color-mode";
import { SiDiscogs } from "react-icons/si";
import { Album } from "@/types/track";
import { useUpdateAlbumMutation } from "@/hooks/useAlbumsQuery";
import { useAlbum } from "@/hooks/useAlbum";
import AlbumActionsMenu from "@/components/AlbumActionsMenu";
import RecordActionDialog from "@/components/records/RecordActionDialog";
import { useEnrichmentStore } from "@/stores/enrichmentStore";
import { getAlbumWithTracks } from "@/services/internalApi/albums";
import { useRouter } from "next/navigation";
import { toaster } from "@/components/ui/toaster";

function formatDate(dateString?: string): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString();
}

export type AlbumResultProps = {
  album?: Album;
  albumRef?: { release_id: string; friend_id: number };
  buttons?: React.ReactNode;
  showEditFields?: boolean;
  compact?: boolean;
};

export default function AlbumResult({
  album,
  albumRef,
  buttons,
  showEditFields = false,
  compact = false,
}: AlbumResultProps) {
  const releaseId = albumRef?.release_id ?? album?.release_id ?? "";
  const friendId = albumRef?.friend_id ?? album?.friend_id ?? -1;
  const albumFromStore = useAlbum(releaseId, friendId);
  const resolvedAlbum = albumFromStore ?? album;

  const artworkSrc =
    resolvedAlbum?.audio_file_album_art_url ||
    resolvedAlbum?.album_thumbnail ||
    "/images/placeholder-artwork.png";
  const [rating, setRating] = useState(resolvedAlbum?.album_rating || 0);
  const mutedText = useColorModeValue("gray.600", "gray.300");
  const subtleText = useColorModeValue("gray.500", "gray.400");

  const updateMutation = useUpdateAlbumMutation();
  const setEnrichmentQueue = useEnrichmentStore((s) => s.setQueue);
  const router = useRouter();
  const [isEnriching, setIsEnriching] = useState(false);
  const [logCareOpen, setLogCareOpen] = useState(false);
  const displayYear =
    resolvedAlbum?.year && resolvedAlbum.year !== "0" ? resolvedAlbum.year : "";

  React.useEffect(() => {
    if (!resolvedAlbum) return;
    setRating(resolvedAlbum.album_rating || 0);
  }, [resolvedAlbum, resolvedAlbum?.album_rating]);

  if (!resolvedAlbum) return null;

  const handleEnrichAlbum = async () => {
    setIsEnriching(true);
    try {
      const { tracks } = await getAlbumWithTracks(
        resolvedAlbum.release_id,
        resolvedAlbum.friend_id
      );
      if (tracks.length === 0) {
        toaster.create({
          title: "No tracks to enrich",
          description: "This album has no tracks.",
          type: "info",
        });
        return;
      }
      setEnrichmentQueue(
        tracks.map((track) => ({
          trackId: track.track_id,
          friendId: track.friend_id,
        }))
      );
      router.push("/enrich");
    } catch (error) {
      toaster.create({
        title: "Failed to open enrichment",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      setIsEnriching(false);
    }
  };

  if (compact) {
    return (
      <Flex
        borderBottomWidth="1px"
        py={2}
        px={1}
        gap={2}
        align="center"
        width="100%"
      >
        <Image
          src={artworkSrc}
          alt={resolvedAlbum.title}
          width="40px"
          height="40px"
          objectFit="cover"
          borderRadius="sm"
          flexShrink={0}
        />
        <Box flex={1} minW={0}>
          <Text fontSize="sm" fontWeight="bold" lineClamp={1}>
            <Link
              as={NextLink}
              href={`/albums/${resolvedAlbum.release_id}?friend_id=${resolvedAlbum.friend_id}`}
            >
              {resolvedAlbum.title}
            </Link>
          </Text>
          <Text fontSize="xs" color={mutedText} lineClamp={1}>
            {resolvedAlbum.artist}
            {displayYear ? ` · ${displayYear}` : ""}
          </Text>
        </Box>
        <Flex gap={1} flexShrink={0}>
          {resolvedAlbum.discogs_url && (
            <Link href={resolvedAlbum.discogs_url} target="_blank" rel="noopener noreferrer">
              <Button size="xs" variant="ghost" px={1}>
                <Icon as={SiDiscogs} />
              </Button>
            </Link>
          )}
          {showEditFields && (
            <Button asChild size="xs" variant="outline" px={1}>
              <Link
                as={NextLink}
                href={`/albums/${resolvedAlbum.release_id}/edit?friend_id=${resolvedAlbum.friend_id}`}
              >
                Edit
              </Link>
            </Button>
          )}
          {buttons}
        </Flex>
      </Flex>
    );
  }

  const displayGenres = resolvedAlbum.genres ?? [];
  const displayStyles = resolvedAlbum.styles ?? [];

  return (
    <Box
      borderWidth="1px"
      borderRadius="md"
      p={3}
      mb={2}
      width="100%"
    >
      <Flex gap={3} position="relative" width="100%">
        <Box
          flexShrink={0}
          width={{ base: "70px", md: "80px", lg: "90px" }}
          height={{ base: "70px", md: "80px", lg: "90px" }}
        >
          <Image
            src={artworkSrc}
            alt={resolvedAlbum.title}
            width="100%"
            height="100%"
            objectFit="cover"
            borderRadius="md"
          />
        </Box>

        <Flex direction="column" flex={1} minW={0} gap={1}>
          <Flex alignItems="center" gap={2} pr={{ base: 14, lg: 24 }}>
            <Text
              fontSize={{ base: "sm", md: "lg" }}
              fontWeight="bold"
              overflow="hidden"
              textOverflow="ellipsis"
              whiteSpace="nowrap"
              flex="1 1 auto"
              minW={0}
            >
              <Link
                as={NextLink}
                href={`/albums/${resolvedAlbum.release_id}?friend_id=${resolvedAlbum.friend_id}`}
                display="block"
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
                _hover={{ textDecoration: "underline" }}
              >
                {resolvedAlbum.title}
              </Link>
            </Text>
          </Flex>

          <Link
            as={NextLink}
            href={`/albums?q=${encodeURIComponent(resolvedAlbum.artist)}&friend_id=${resolvedAlbum.friend_id}`}
            _hover={{ textDecoration: "underline" }}
          >
            <Text
              fontSize={{ base: "xs", md: "sm" }}
              fontWeight="medium"
              color={mutedText}
              lineClamp={1}
            >
              {resolvedAlbum.artist}
            </Text>
          </Link>

          <Flex gap={2} fontSize="xs" color="gray.500" alignItems="center" flexWrap="wrap">
            {resolvedAlbum.library_identifier && (
              <Text
                color="blue.600"
                fontWeight="bold"
                flexShrink={0}
              >
                {resolvedAlbum.library_identifier}
              </Text>
            )}
            {displayYear && <Text>{displayYear}</Text>}
            {resolvedAlbum.track_count > 0 && (
              <>
                <Text color="gray.400">·</Text>
                <Text>
                  {resolvedAlbum.track_count} track{resolvedAlbum.track_count !== 1 ? "s" : ""}
                </Text>
              </>
            )}
          </Flex>

          <Flex
            gap={3}
            fontSize="xs"
            flexWrap="wrap"
            alignItems="center"
            color="gray.500"
            mt={0.5}
          >
            <RatingGroup.Root
              value={rating}
              onValueChange={(details) => {
                setRating(details.value);
                updateMutation.mutate({
                  release_id: resolvedAlbum.release_id,
                  friend_id: resolvedAlbum.friend_id,
                  album_rating: details.value,
                });
              }}
              count={5}
              size="xs"
            >
              {[1, 2, 3, 4, 5].map((index) => (
                <RatingGroup.Item key={index} index={index}>
                  <RatingGroup.ItemIndicator />
                </RatingGroup.Item>
              ))}
            </RatingGroup.Root>
            {resolvedAlbum.label && (
              <Text display={{ base: "none", md: "block" }}>{resolvedAlbum.label}</Text>
            )}
            {resolvedAlbum.catalog_number && (
              <Text display={{ base: "none", md: "block" }}>Cat: {resolvedAlbum.catalog_number}</Text>
            )}
            {resolvedAlbum.country && (
              <Text display={{ base: "none", md: "block" }}>{resolvedAlbum.country}</Text>
            )}
            {resolvedAlbum.date_added && (
              <Text display={{ base: "none", md: "block" }}>
                Added: {formatDate(resolvedAlbum.date_added)}
              </Text>
            )}
          </Flex>

          {(displayGenres.length > 0 || displayStyles.length > 0) && (
            <Flex gap={2} flexWrap="wrap" display={{ base: "none", md: "flex" }} mt={0.5}>
              {displayGenres.map((genre) => (
                <Badge key={genre} size="sm" variant="surface">
                  {genre}
                </Badge>
              ))}
              {displayStyles.map((style) => (
                <Badge key={style} size="sm" variant="outline">
                  {style}
                </Badge>
              ))}
            </Flex>
          )}
        </Flex>

        <Flex
          position="absolute"
          top={{ base: 0, md: 2 }}
          right={{ base: 0, md: 2 }}
          gap={1}
          alignItems="center"
        >
          <AlbumActionsMenu
            albumTitle={resolvedAlbum.title}
            albumArtist={resolvedAlbum.artist}
            discogsUrl={resolvedAlbum.discogs_url}
            editAlbumHref={showEditFields ? `/albums/${resolvedAlbum.release_id}/edit?friend_id=${resolvedAlbum.friend_id}` : undefined}
            onEnrichAlbum={handleEnrichAlbum}
            isEnriching={isEnriching}
            onLogCare={() => setLogCareOpen(true)}
          />
          {/* Mounted only while open: a list holds many rows. */}
          {logCareOpen && (
            <RecordActionDialog
              open
              onOpenChange={setLogCareOpen}
              releaseId={resolvedAlbum.release_id}
              friendId={resolvedAlbum.friend_id}
              albumTitle={resolvedAlbum.title}
            />
          )}
        </Flex>
      </Flex>

      {resolvedAlbum.condition && (
        <Flex mt={3} gap={3} fontSize="sm" color={subtleText} flexWrap="wrap">
          <Text>Condition: {resolvedAlbum.condition}</Text>
        </Flex>
      )}
    </Box>
  );
}

"use client";

import React from "react";
import { Badge, Box, HStack, VStack, Text, Spinner } from "@chakra-ui/react";
import PlaylistItemActionsMenu from "@/components/PlaylistItemActionsMenu";
import { formatDateWithRelative } from "@/lib/date";
import type { Playlist } from "@/types/track";
import { FiMapPin } from "react-icons/fi";

export function formatDuration(seconds?: number) {
  if (!seconds) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * Cover URLs for the 2x2 mosaic: the first four tracks' album art.
 * `cover_urls` is the field the list endpoint will return (#771); until it does
 * this is empty and every cell falls back to a tinted block.
 */
export function playlistCoverUrls(playlist: Playlist): string[] {
  const urls = (playlist as { cover_urls?: unknown }).cover_urls;
  if (!Array.isArray(urls)) return [];
  return urls.filter((url): url is string => typeof url === "string" && url.length > 0).slice(0, 4);
}

const MOSAIC_TINTS = ["bg.muted", "bg.subtle", "bg.emphasized", "bg.muted"] as const;

export function CoverMosaic({ urls, size = "72px" }: { urls: string[]; size?: string }) {
  return (
    <Box
      data-testid="playlist-mosaic"
      display="grid"
      gridTemplateColumns="1fr 1fr"
      gridTemplateRows="1fr 1fr"
      boxSize={size}
      flexShrink={0}
      borderWidth="rule"
      borderColor="border.ink"
      overflow="hidden"
      aria-hidden="true"
    >
      {MOSAIC_TINTS.map((tint, i) => (
        <Box
          key={i}
          data-testid={urls[i] ? "mosaic-cover" : "mosaic-tint"}
          bg={tint}
          bgImage={urls[i] ? `url(${urls[i]})` : undefined}
          bgSize="cover"
          backgroundPosition="center"
        />
      ))}
    </Box>
  );
}

interface PlaylistListItemProps {
  playlist: Playlist;
  isLoading?: boolean;
  onClick: () => void;
  onPlay: () => void;
  onDelete: () => void;
  onEnqueue: () => void;
  onExportPdf?: () => void;
  onCreateSet?: () => void;
  /** Desktop day line above the name (`MON 10`). Set when the row sits under a month divider, which also hides the meta date on phones. */
  dayLabel?: string;
}

/** The phone modal strip: count, duration and date. */
export function playlistSummary(playlist: Playlist): string {
  return [
    `${playlist.tracks.length} tracks`,
    formatDuration(playlist.total_duration_seconds),
    playlist.set?.last_performed_at
      ? `Played ${formatDateWithRelative(playlist.set.last_performed_at)}`
      : formatDateWithRelative(playlist.created_at),
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function PlaylistListItem({
  playlist,
  isLoading,
  onClick,
  onPlay,
  onDelete,
  onEnqueue,
  onExportPdf,
  onCreateSet,
  dayLabel,
}: PlaylistListItemProps) {
  const duration = formatDuration(playlist.total_duration_seconds);
  const collaborators = playlist.set?.collaborators.map((person) => person.username).join(", ");
  const showDate = !dayLabel;
  return (
    <Box
      data-testid="playlist-card"
      w="100%"
      textAlign="left"
      p={3}
      borderWidth="outline"
      borderColor="border.ink"
      boxShadow="md"
      _hover={{ bg: "bg.muted" }}
      _active={{ bg: "bg.subtle" }}
    >
      <HStack justify="space-between" align="flex-start" gap={3}>
        <Box
          display="flex"
          alignItems="center"
          gap={3}
          minW={0}
          cursor="pointer"
          role="button"
          tabIndex={0}
          onClick={onClick}
          onKeyDown={(e) => {
            if (e.key === "Enter") onClick();
          }}
        >
          <CoverMosaic urls={playlistCoverUrls(playlist)} />
          <VStack align="start" gap={1} minW={0}>
            {dayLabel && (
              <Text
                data-testid="playlist-day"
                display={{ base: "none", md: "block" }}
                fontFamily="mono"
                fontSize="2xs"
                letterSpacing="0.08em"
                color="fg.muted"
              >
                {dayLabel}
              </Text>
            )}
            <HStack gap={2} minW={0} align="flex-start">
              <Text fontWeight="semibold" fontSize="sm" lineClamp={2}>
                {playlist.set?.title || playlist.name}
              </Text>
              {playlist.set && (
                <Badge size="sm" colorPalette={playlist.set.status === "performed" ? "status.success" : "status.genre"}>
                  {playlist.set.status === "performed" ? "Played" : "Set"}
                </Badge>
              )}
            </HStack>
            <HStack
              data-testid="playlist-meta"
              columnGap={2}
              rowGap={0}
              wrap="wrap"
              color="fg.muted"
              fontFamily="mono"
              fontSize="xs"
            >
              <Text whiteSpace="nowrap">{playlist.tracks.length} tracks</Text>
              {duration && (
                <>
                  <Text>·</Text>
                  <Text whiteSpace="nowrap">{duration}</Text>
                </>
              )}
              {collaborators && (
                <>
                  <Text>·</Text>
                  <Text whiteSpace="nowrap">w/ {collaborators}</Text>
                </>
              )}
              {showDate && (
                <>
                  <Text>·</Text>
                  <Text whiteSpace="nowrap">
                    {playlist.set?.last_performed_at
                      ? `Played ${formatDateWithRelative(playlist.set.last_performed_at)}`
                      : formatDateWithRelative(playlist.created_at)}
                  </Text>
                </>
              )}
            </HStack>
            {playlist.set?.venue_name && (
              <HStack gap={1} color="fg.muted" fontSize="xs">
                <FiMapPin />
                <Text lineClamp={1}>{playlist.set.venue_name}</Text>
              </HStack>
            )}
          </VStack>
        </Box>

        <HStack gap={1} flexShrink={0}>
          {isLoading && <Spinner size="xs" />}
          <PlaylistItemActionsMenu
            playlistName={playlist.name}
            onOpen={onClick}
            onPlay={onPlay}
            onDelete={onDelete}
            onEnqueue={onEnqueue}
            onExportPdf={onExportPdf}
            summary={playlistSummary(playlist)}
            played={playlist.set?.status === "performed"}
            collaborators={collaborators}
            onCreateSet={playlist.set ? undefined : onCreateSet}
          />
        </HStack>
      </HStack>
    </Box>
  );
}

"use client";

import React from "react";
import { Badge, Box, HStack, VStack, Text, Spinner } from "@chakra-ui/react";
import PlaylistItemActionsMenu from "@/components/PlaylistItemActionsMenu";
import { formatDateWithRelative } from "@/lib/date";
import type { Playlist } from "@/types/track";
import { FiMapPin, FiUsers } from "react-icons/fi";

function formatDuration(seconds?: number) {
  if (!seconds) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

interface PlaylistListItemProps {
  playlist: Playlist;
  isLoading?: boolean;
  onClick: () => void;
  onPlay: () => void;
  onDelete: () => void;
  onCreateSet?: () => void;
}

export default function PlaylistListItem({
  playlist,
  isLoading,
  onClick,
  onPlay,
  onDelete,
  onCreateSet,
}: PlaylistListItemProps) {
  return (
    <Box
      w="100%"
      textAlign="left"
      px={4}
      py={3}
      borderWidth="1px"
      borderRadius="md"
      _hover={{ bg: "bg.muted", borderColor: "blue.200" }}
      _active={{ bg: "bg.subtle" }}
    >
      <HStack justify="space-between" align="center" gap={3}>
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
          {playlist.set?.cover_image_url ? (
            <Box
              boxSize="10"
              rounded="md"
              flexShrink={0}
              bgImage={`url(${playlist.set.cover_image_url})`}
              bgSize="cover"
              backgroundPosition="center"
            />
          ) : null}
          <VStack align="start" gap={0} minW={0}>
            <HStack gap={2} minW={0}>
              <Text fontWeight="semibold" fontSize="sm" lineClamp={1}>
                {playlist.set?.title || playlist.name}
              </Text>
              {playlist.set && (
                <Badge size="sm" colorPalette={playlist.set.status === "performed" ? "green" : "purple"}>
                  {playlist.set.status === "performed" ? "Played" : "Set"}
                </Badge>
              )}
            </HStack>
            <HStack gap={2} color="fg.muted" fontSize="xs">
              <Text>{playlist.tracks.length} tracks</Text>
              {formatDuration(playlist.total_duration_seconds) && <><Text>·</Text><Text>{formatDuration(playlist.total_duration_seconds)}</Text></>}
              <Text>·</Text>
              <Text>
                {playlist.set?.last_performed_at
                  ? `Played ${formatDateWithRelative(playlist.set.last_performed_at)}`
                  : formatDateWithRelative(playlist.created_at)}
              </Text>
            </HStack>
            {playlist.set && (playlist.set.collaborators.length > 0 || playlist.set.venue_name) && (
              <HStack gap={2} color="fg.muted" fontSize="xs" lineClamp={1}>
                {playlist.set.collaborators.length > 0 && (
                  <HStack gap={1}>
                    <FiUsers />
                    <Text>{playlist.set.collaborators.map((person) => person.username).join(", ")}</Text>
                  </HStack>
                )}
                {playlist.set.venue_name && (
                  <HStack gap={1}>
                    <FiMapPin />
                    <Text>{playlist.set.venue_name}</Text>
                  </HStack>
                )}
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
            onCreateSet={playlist.set ? undefined : onCreateSet}
          />
        </HStack>
      </HStack>
    </Box>
  );
}

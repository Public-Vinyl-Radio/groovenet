"use client";

import React from "react";
import NextLink from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Flex, Link, Popover, Portal, Text } from "@chakra-ui/react";
import { MetaTag } from "@/components/ui/RoleTags";
import type { Track } from "@/types/track";
import { queryKeys } from "@/lib/queryKeys";
import { fetchTrackPlaylists } from "@/services/internalApi/tracks";

type TrackPlaylistUsageProps = {
  track: Pick<Track, "track_id" | "friend_id">;
  count: number;
  size?: "xs" | "sm";
};

export default function TrackPlaylistUsage({ track, count, size = "xs" }: TrackPlaylistUsageProps) {
  const [open, setOpen] = React.useState(false);
  const playlistsQuery = useQuery({
    queryKey: queryKeys.trackPlaylists(track.track_id, track.friend_id),
    queryFn: () => fetchTrackPlaylists(track.track_id, track.friend_id),
    enabled: open && count > 0,
    staleTime: 30_000,
  });

  if (count <= 0) return null;

  return (
    <Popover.Root open={open} onOpenChange={(details) => setOpen(details.open)}>
      <Popover.Trigger asChild>
        <MetaTag as="button" size={size}>
          {count} playlist{count === 1 ? "" : "s"}
        </MetaTag>
      </Popover.Trigger>
      {/* In a portal: a virtualised row below would otherwise paint over it. */}
      <Portal>
        <Popover.Positioner>
          <Popover.Content maxW="280px">
            <Popover.Body>
              {playlistsQuery.isLoading ? (
                <Text fontSize="sm" color="fg.muted">
                  Loading playlists...
                </Text>
              ) : playlistsQuery.error ? (
                <Text fontSize="sm" color="fg.error">
                  Failed to load playlists
                </Text>
              ) : playlistsQuery.data && playlistsQuery.data.length > 0 ? (
                <Flex direction="column" gap={1.5}>
                  {playlistsQuery.data.map((playlist) => (
                    <Flex
                      key={`${playlist.id}:${playlist.position}`}
                      justify="space-between"
                      alignItems="center"
                      gap={3}
                    >
                      <Link asChild fontSize="sm" fontWeight="medium" lineClamp={1}>
                        <NextLink href={`/playlists/${playlist.id}`}>{playlist.name}</NextLink>
                      </Link>
                      <MetaTag size="xs" flexShrink={0}>
                        #{playlist.position}
                      </MetaTag>
                    </Flex>
                  ))}
                </Flex>
              ) : (
                <Text fontSize="sm" color="fg.muted">
                  No playlist memberships found.
                </Text>
              )}
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

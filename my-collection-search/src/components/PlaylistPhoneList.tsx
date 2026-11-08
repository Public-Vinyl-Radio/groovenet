"use client";

import React from "react";
import NextLink from "next/link";
import { Box, Flex, Link, Spinner, Text } from "@chakra-ui/react";
import PlaylistItemActionsMenu from "@/components/PlaylistItemActionsMenu";
import PlaylistMonthDivider from "@/components/PlaylistMonthDivider";
import {
  CoverMosaic,
  SetFlyer,
  formatDuration,
  playlistCoverUrls,
  playlistSummary,
  type PlaylistActionHandlers,
} from "@/components/PlaylistListItem";
import { MetaTag } from "@/components/ui/RoleTags";
import { playlistDayParts, type PlaylistMonthGroup } from "@/lib/playlistGroups";
import type { Playlist } from "@/types/track";

/** `Fri 30 · 12 tracks · 49m`: day, count and length, whatever is known. */
export function phoneMeta(playlist: Playlist): string {
  const day = playlistDayParts(playlist);
  const count = playlist.tracks.length;
  return [
    day ? `${day.weekday.charAt(0)}${day.weekday.slice(1).toLowerCase()} ${day.day}` : null,
    `${count} ${count === 1 ? "track" : "tracks"}`,
    formatDuration(playlist.total_duration_seconds),
  ]
    .filter(Boolean)
    .join(" · ");
}

function PhoneRow({
  playlist,
  loading,
  actions,
}: {
  playlist: Playlist;
  loading: boolean;
  actions: PlaylistActionHandlers;
}) {
  const set = playlist.set;
  const title = set?.title || playlist.name;
  const collaborators = set?.collaborators.map((person) => person.username).join(", ") ?? "";

  return (
    <Flex
      as="li"
      data-testid="playlist-phone-row"
      align="center"
      minH="60px"
      borderBottomWidth="rule"
      borderColor="border"
      _last={{ borderBottomWidth: 0 }}
    >
      {/* The row is the link; the kebab is its sibling, never nested in it. */}
      <Link
        as={NextLink}
        href={`/playlists/${playlist.id}`}
        flex="1"
        minW={0}
        display="flex"
        alignItems="center"
        gap={3}
        py={2}
        pl={3}
        color="fg"
        textDecoration="none"
        _hover={{ bg: "bg.muted", textDecoration: "none" }}
        aria-label={title}
      >
        {set?.flyer_url ? (
          <SetFlyer url={set.flyer_url} compact />
        ) : (
          <CoverMosaic urls={playlistCoverUrls(playlist)} size="40px" />
        )}
        <Box flex="1" minW={0}>
          <Flex align="center" gap={2} minW={0}>
            <Text fontWeight="semibold" fontSize="sm" truncate>
              {title}
            </Text>
            {set && (
              <MetaTag size="xs" flexShrink={0}>
                Set
              </MetaTag>
            )}
          </Flex>
          <Text fontFamily="mono" fontSize="xs" color="fg.muted" truncate>
            {phoneMeta(playlist)}
          </Text>
        </Box>
      </Link>
      {loading && <Spinner size="xs" />}
      <PlaylistItemActionsMenu
        playlistName={playlist.name}
        onOpen={actions.onClick}
        onPlay={actions.onPlay}
        onDelete={actions.onDelete}
        onEnqueue={actions.onEnqueue}
        onExportPdf={actions.onExportPdf}
        summary={playlistSummary(playlist)}
        played={set?.status === "performed"}
        collaborators={collaborators}
        onCreateSet={set ? undefined : actions.onCreateSet}
      />
    </Flex>
  );
}

/**
 * Phone list view: per month, one outlined block of ruled rows (the desktop
 * table is too wide). Each row is a link to the playlist with the actions
 * kebab beside it.
 */
export default function PlaylistPhoneList({
  groups,
  loadingId,
  getActions,
}: {
  groups: PlaylistMonthGroup[];
  loadingId?: number | null;
  getActions: (playlist: Playlist) => PlaylistActionHandlers;
}) {
  return (
    <>
      {groups.map((group) => (
        <Box as="section" key={group.key} aria-label={group.label} mb={5}>
          <PlaylistMonthDivider group={group} />
          <Box
            as="ul"
            listStyleType="none"
            m={0}
            mr="6px"
            mb="6px"
            p={0}
            borderWidth="outline"
            borderRadius="md"
            borderColor="border.ink"
            boxShadow="md"
            overflow="hidden"
          >
            {group.playlists.map((playlist) => (
              <PhoneRow
                key={playlist.id}
                playlist={playlist}
                loading={playlist.id === loadingId}
                actions={getActions(playlist)}
              />
            ))}
          </Box>
        </Box>
      ))}
    </>
  );
}

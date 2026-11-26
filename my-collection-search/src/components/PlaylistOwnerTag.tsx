"use client";

import React from "react";
import { chakra } from "@chakra-ui/react";
import { SourceTag, StatusTag } from "@/components/ui/RoleTags";
import { useHousehold } from "@/providers/HouseholdProvider";
import { playlistOwnerLabel } from "@/lib/playlistOwners";
import type { Playlist } from "@/types/track";

/**
 * Whose playlist this is (#1284): another profile's household playlist shows
 * its owner (a source tag: provenance), a private one says Private (a state).
 * Nothing for the viewer's own household playlists or a one-profile household.
 */
export default function PlaylistOwnerTag({
  playlist,
}: {
  playlist: Pick<Playlist, "owner_id" | "owner_name" | "visibility">;
}) {
  const { data } = useHousehold();
  const tag = playlistOwnerLabel(playlist, data?.current?.id, data?.users.length ?? 0);
  if (!tag) return null;
  return tag.kind === "private" ? (
    <StatusTag tone="neutral" size="xs" flexShrink={0} data-testid="playlist-private-tag">
      Private
    </StatusTag>
  ) : (
    <SourceTag
      stroke="solid"
      size="xs"
      flexShrink={0}
      maxW="12ch"
      title={`Owned by ${tag.label}`}
      data-testid="playlist-owner-tag"
    >
      <chakra.span truncate>{tag.label}</chakra.span>
    </SourceTag>
  );
}

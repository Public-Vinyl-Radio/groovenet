"use client";

import React from "react";
import NextLink from "next/link";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Box, Link, Text } from "@chakra-ui/react";
import type { HomeResponse } from "@/services/internalApi/home";
import { useDisplayTimeZone } from "@/providers/DisplayTimeZoneProvider";
import {
  ALL_PLAYLISTS_HREF,
  CREATE_PLAYLIST_HREF,
  createdLabel,
  draftKicker,
  playlistHref,
  tracksAndDuration,
  tracksLabel,
} from "./playlistWording";

type Playlists = HomeResponse["playlists"];
type DraftSet = NonNullable<Playlists["draft_set"]>;
type Playlist = Playlists["recent"][number];

type Props = {
  /** Null while the summary loads or after it fails. */
  playlists: Playlists | null;
  loading?: boolean;
  error?: string | null;
  /** The instant "created N days ago" counts from; defaults to now. */
  now?: Date;
};

const mono = { fontFamily: "mono", letterSpacing: "0.08em" } as const;

function DraftCard({ set }: { set: DraftSet }) {
  return (
    <Link
      asChild
      display="flex"
      flexDirection="column"
      alignItems="stretch"
      gap="4px"
      px="14px"
      py="12px"
      borderBottomWidth="outline"
      borderColor="border.ink"
      bg="accent.subtle"
      color="fg"
      textDecoration="none"
      _hover={{ textDecoration: "none", bg: "bg.muted" }}
    >
      <NextLink href={playlistHref(set.playlist_id)}>
        <Text as="span" fontSize="11px" fontWeight="semibold" color="accent.fg" {...mono}>
          {draftKicker(set.location_name)}
        </Text>
        <Text as="span" fontSize="17px" lineHeight="22px" fontWeight="semibold" truncate>
          {set.title ?? "Untitled set"}
        </Text>
        <Text as="span" fontFamily="mono" fontSize="12px" color="fg.muted">
          {tracksAndDuration(set)}
        </Text>
      </NextLink>
    </Link>
  );
}

function PlaylistRow({
  playlist,
  created,
  first,
}: {
  playlist: Playlist;
  created: string;
  first: boolean;
}) {
  return (
    <Box as="li" borderTopWidth={first ? 0 : "rule"} borderColor="border.ink">
      <Link
        asChild
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        gap="12px"
        minH="52px"
        px="14px"
        py="10px"
        color="fg"
        textDecoration="none"
        _hover={{ textDecoration: "none", bg: "bg.muted" }}
      >
        <NextLink href={playlistHref(playlist.id)}>
          <Text as="span" fontSize="15px" lineHeight="20px" fontWeight="semibold" truncate>
            {playlist.name}
          </Text>
          <Text
            as="span"
            display={{ base: "inline", md: "none" }}
            fontFamily="mono"
            fontSize="11px"
            color="fg.muted"
            flexShrink={0}
          >
            {tracksLabel(playlist.track_count)}
          </Text>
          <Text
            as="span"
            display={{ base: "none", md: "inline" }}
            fontFamily="mono"
            fontSize="12px"
            color="fg.muted"
            flexShrink={0}
          >
            {created} · {tracksAndDuration(playlist)}
          </Text>
        </NextLink>
      </Link>
    </Box>
  );
}

function Notice({ role, children }: { role?: "alert"; children: React.ReactNode }) {
  return (
    <Text
      role={role}
      px="14px"
      py={3}
      fontFamily="mono"
      fontSize="xs"
      letterSpacing="0.06em"
      color="fg.muted"
    >
      {children}
    </Text>
  );
}

/**
 * Home's Playlists & sets (#884): the most recent draft live set, highlighted,
 * then the three most recent playlists. Loads and fails on its own; the header
 * stays either way.
 */
export function PlaylistsSection({ playlists, loading, error, now }: Props) {
  const timeZone = useDisplayTimeZone();
  const at = now ?? new Date();
  const draft = playlists?.draft_set ?? null;
  const recent = playlists?.recent ?? [];

  let body: React.ReactNode;
  if (error) {
    body = <Notice role="alert">COULDN&apos;T LOAD PLAYLISTS · {error.toUpperCase()}</Notice>;
  } else if (!playlists || loading) {
    body = <Box data-testid="playlists-loading" aria-hidden="true" h="160px" bg="bg.muted" />;
  } else if (!draft && recent.length === 0) {
    body = (
      <Notice>
        NO PLAYLISTS YET.{" "}
        <Link asChild color="fg" fontWeight="semibold">
          <NextLink href={CREATE_PLAYLIST_HREF}>CREATE ONE FROM TRACKS →</NextLink>
        </Link>
      </Notice>
    );
  } else {
    body = (
      <>
        {draft && <DraftCard set={draft} />}
        {recent.length > 0 && (
          <Box as="ul" role="list" listStyleType="none" m={0} p={0}>
            {recent.map((playlist, i) => (
              <PlaylistRow
                key={playlist.id}
                playlist={playlist}
                created={createdLabel(playlist.created_at, timeZone, at)}
                first={i === 0}
              />
            ))}
          </Box>
        )}
      </>
    );
  }

  return (
    <Box
      as="section"
      aria-labelledby="home-playlists-heading"
      aria-busy={loading || (!playlists && !error) || undefined}
      mr="6px"
      borderWidth="outline"
      borderRadius="md"
      borderColor="border.ink"
      boxShadow="md"
      overflow="clip"
    >
      <SectionLabel
        variant="header"
        id="home-playlists-heading"
        link={{ href: ALL_PLAYLISTS_HREF, label: "All playlists →" }}
      >
        PLAYLISTS & SETS
      </SectionLabel>
      {body}
    </Box>
  );
}

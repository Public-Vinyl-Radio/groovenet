"use client";

import React from "react";
import { Box, HStack, VStack, Text, Spinner, Link } from "@chakra-ui/react";
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
 * Missing cells fall back to a tinted block.
 */
export function playlistCoverUrls(playlist: Playlist): string[] {
  return (playlist.cover_urls ?? []).filter((url) => url.length > 0).slice(0, 4);
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

/** Ticket thumbnail: the set flyer, portrait. */
export function SetFlyer({ url }: { url: string }) {
  return (
    <Box
      data-testid="set-flyer"
      boxSize="auto"
      w="56px"
      h="72px"
      flexShrink={0}
      borderWidth="rule"
      borderColor="border.ink"
      bg="bg.muted"
      bgImage={`url(${url})`}
      bgSize="cover"
      backgroundPosition="center"
      aria-hidden="true"
    />
  );
}

const LINK_STYLE = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minH: "44px",
  minW: "44px",
  px: 3,
  borderWidth: "rule",
  borderColor: "border.ink",
  fontFamily: "mono",
  fontSize: "xs",
  fontWeight: "semibold",
  textDecoration: "none",
  _hover: { bg: "bg.muted", textDecoration: "none" },
  _focusVisible: { outline: "2px solid", outlineColor: "accent.focusRing", outlineOffset: "2px" },
} as const;

const PERFORATION_NOTCH = {
  position: "absolute",
  top: "-8px",
  boxSize: "14px",
  borderRadius: "full",
  borderWidth: "rule",
  borderColor: "border.ink",
  bg: "bg",
} as const;

export function setLinks(set: NonNullable<Playlist["set"]>) {
  return [
    { key: "recording", label: "Recording", href: set.recording_url, primary: true },
    { key: "post", label: "Post", href: set.post_url, primary: false },
    { key: "youtube", label: "YouTube", href: set.youtube_url, primary: false },
  ].filter((link): link is typeof link & { href: string } => Boolean(link.href));
}

/** Perforated stub under a set card: venue line and the set's links. */
function SetStub({ set }: { set: NonNullable<Playlist["set"]> }) {
  const venue = [set.venue_name, set.location_city].filter(Boolean).join(" · ");
  const links = setLinks(set);
  if (!venue && links.length === 0) return null;
  return (
    <Box data-testid="set-stub" position="relative" mt={3} pt={3} borderTopWidth="rule" borderTopStyle="dashed" borderColor="border.ink">
      <Box data-testid="set-notch" {...PERFORATION_NOTCH} left="-21px" aria-hidden="true" />
      <Box data-testid="set-notch" {...PERFORATION_NOTCH} right="-21px" aria-hidden="true" />
      <VStack align="stretch" gap={2}>
        {venue && (
          <HStack gap={1} color="fg.muted" fontSize="xs" minW={0}>
            <FiMapPin aria-hidden="true" />
            <Text data-testid="set-venue" lineClamp={1}>
              {venue}
            </Text>
          </HStack>
        )}
        {links.length > 0 && (
          <HStack gap={2} wrap="wrap">
            {links.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`set-link-${link.key}`}
                {...LINK_STYLE}
                bg={link.primary ? "accent.solid" : undefined}
                color={link.primary ? "accent.contrast" : "fg"}
              >
                {link.label}
              </Link>
            ))}
          </HStack>
        )}
      </VStack>
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
      position="relative"
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
          {playlist.set?.flyer_url ? (
            <SetFlyer url={playlist.set.flyer_url} />
          ) : (
            <CoverMosaic urls={playlistCoverUrls(playlist)} />
          )}
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
                <Text
                  data-testid="live-set-stamp"
                  flexShrink={0}
                  px={1.5}
                  borderWidth="rule"
                  borderColor="border.ink"
                  fontFamily="mono"
                  fontSize="2xs"
                  fontWeight="bold"
                  letterSpacing="0.08em"
                  whiteSpace="nowrap"
                  transform="rotate(-3deg)"
                >
                  LIVE SET
                </Text>
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
      {playlist.set && <SetStub set={playlist.set} />}
    </Box>
  );
}

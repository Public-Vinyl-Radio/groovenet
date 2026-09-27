"use client";

import React from "react";
import NextLink from "next/link";
import { Badge, Box, Button, Flex, HStack, Image, Link, Stack, Text } from "@chakra-ui/react";
import { FiChevronDown, FiChevronUp, FiDisc, FiTrash2 } from "react-icons/fi";
import { Tooltip } from "@/components/ui/tooltip";
import {
  describeProvenance,
  describeSpinAlbum,
  formatTrackLine,
  summarizeSpin,
  type SpinListItem,
} from "./spinSummary";

type Props = {
  item: SpinListItem;
  onDelete: (spinId: number) => void;
  deletePending: boolean;
  /** Show the album's art, artist and title — for lists that span albums. */
  showAlbum?: boolean;
  /** Show only the time of day — for lists already grouped by day. */
  timeOnly?: boolean;
};

function formatPlayedAt(dateString: string, timeOnly: boolean): string {
  const date = new Date(dateString);
  return timeOnly
    ? date.toLocaleTimeString([], { timeStyle: "short" })
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function AlbumArt({ src, alt }: { src: string | null; alt: string }) {
  // Discogs art links expire; a broken one gets the same disc as a missing one.
  const [failed, setFailed] = React.useState(false);
  return (
    <Box
      boxSize="48px"
      flexShrink={0}
      borderRadius="md"
      overflow="hidden"
      bg="bg.muted"
      display="flex"
      alignItems="center"
      justifyContent="center"
      color="fg.subtle"
    >
      {src && !failed ? (
        <Image
          src={src}
          alt={alt}
          width="100%"
          height="100%"
          objectFit="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <FiDisc size={20} />
      )}
    </Box>
  );
}

export default function SpinRow({
  item,
  onDelete,
  deletePending,
  showAlbum = false,
  timeOnly = false,
}: Props) {
  const [expanded, setExpanded] = React.useState(false);
  const summary = summarizeSpin(item);
  const provenance = describeProvenance(item);
  const album = showAlbum ? describeSpinAlbum(item) : null;
  const albumHref = `/albums/${encodeURIComponent(item.session.release_id)}?friend_id=${item.session.friend_id}`;

  return (
    <Flex
      align="start"
      gap={3}
      px={3}
      py={2}
      borderBottomWidth="1px"
      _last={{ borderBottomWidth: 0 }}
      minW={0}
    >
      {album && <AlbumArt src={album.thumbnail} alt={album.title ?? "Album art"} />}
      <Stack gap={0.5} flex="1" minW={0}>
        <Text fontSize="sm" fontWeight="medium" lineClamp={1}>
          {summary.headline}
        </Text>
        {album && (
          <Text fontSize="xs" color="fg.muted" lineClamp={1}>
            {album.artist && `${album.artist} · `}
            <Link as={NextLink} href={albumHref}>
              {album.title ?? item.session.release_id}
            </Link>
          </Text>
        )}
        <HStack gap={1.5} wrap="wrap" align="center">
          <Tooltip content={provenance.description} showArrow>
            <Badge
              size="xs"
              variant="subtle"
              colorPalette={provenance.label === "Auto" ? "purple" : "gray"}
            >
              {provenance.label}
            </Badge>
          </Tooltip>
          {item.session.context_type && (
            <Badge size="xs" variant="outline">{item.session.context_type}</Badge>
          )}
          <Text fontSize="xs" color="fg.muted">
            {formatPlayedAt(item.session.played_at, timeOnly)}
          </Text>
          {summary.hasMoreTracks && (
            <Button
              size="2xs"
              variant="plain"
              color="fg.muted"
              px={0}
              h="auto"
              onClick={() => setExpanded((current) => !current)}
              aria-expanded={expanded}
            >
              {expanded ? "Hide" : "Show"} {summary.tracks.length} track
              {summary.tracks.length === 1 ? "" : "s"}
              {expanded ? <FiChevronUp /> : <FiChevronDown />}
            </Button>
          )}
        </HStack>
        {item.session.note && (
          <Text fontSize="xs" color="fg.muted" whiteSpace="pre-wrap">
            {item.session.note}
          </Text>
        )}
        {expanded && (
          <Box as="ol" listStyleType="none" mt={1} pl={2} borderLeftWidth="2px">
            {summary.tracks.map((track) => (
              <Text as="li" key={track.key} fontSize="xs" lineClamp={1}>
                {formatTrackLine(track)}
              </Text>
            ))}
          </Box>
        )}
      </Stack>
      <Button
        size="xs"
        variant="ghost"
        colorPalette="red"
        loading={deletePending}
        onClick={() => onDelete(item.session.id)}
        aria-label="Delete spin"
        minW="28px"
        h="28px"
        p={0}
        flexShrink={0}
      >
        <FiTrash2 />
      </Button>
    </Flex>
  );
}

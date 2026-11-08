"use client";

import React from "react";
import { Box, Button, Flex, IconButton, Text } from "@chakra-ui/react";
import { FiCheck, FiPlus } from "react-icons/fi";
import TrackIdentity from "@/components/TrackIdentity";
import { ArtworkPlay, KeyChip } from "@/components/TrackResult";
import TrackActionsMenu from "@/components/TrackActionsMenu";
import { TrackRowContext } from "@/components/trackCardContext";
import { CategoryTag, StatusTag } from "@/components/ui/RoleTags";
import { BpmCell } from "@/components/RelatedTrackRows";
import { camelotOf, describeMix } from "@/lib/mixCompat";
import {
  suggestionReason,
  suggestionReasonLabel,
  type ReasonCandidate,
  type ReasonSeed,
} from "@/lib/suggestionReason";
import type { Track } from "@/types/track";

export type SuggestionRowProps = {
  /** The track the suggestion follows; BPM, key and the reason are read against it. */
  seed: Track & ReasonSeed;
  track: Track & ReasonCandidate;
  /** One-tap insert after the seed (the playlist panel): renders "+". */
  onAdd?: (track: Track) => void;
  /** The standard track kebab (the track page, where no playlist is in context). */
  menu?: boolean;
  /** The kebab's Add to Playlist finished, into this playlist. */
  onAddedToPlaylist?: (playlistId: number) => void;
  /** Already added: the row shows ✓ ADDED and stays where it is. */
  added?: boolean;
  /** The phone sheet's form: no album in the byline, 44px cover. */
  compact?: boolean;
};

// Cover, text column and row padding: what a fold indents by to sit under the title.
const COVER = { base: "44px", md: "48px" } as const;
const GAP = "10px";
const PAD_X = "10px";

/** One suggested track, from the track row's parts: play-cover, identity, mix facts, one reason, actions. */
export default function SuggestionRow({
  seed,
  track,
  onAdd,
  menu = false,
  onAddedToPlaylist,
  added = false,
  compact = false,
}: SuggestionRowProps) {
  const mix = describeMix(seed, track);
  const reason = suggestionReason(seed, track);
  const camelot = camelotOf(track.key);
  return (
    <Flex
      as="li"
      listStyleType="none"
      alignItems="center"
      gap={GAP}
      py="8px"
      px={PAD_X}
      bg={added ? "status.success.subtle" : undefined}
      borderBottomWidth="rule"
      borderColor="border"
      _last={{ borderBottomWidth: 0 }}
      data-added={added || undefined}
    >
      <ArtworkPlay track={track} size={compact ? "44px" : COVER} iconSize={5} />
      <Flex direction="column" gap="2px" flex={1} minW={0}>
        {/* The phone sheet is dense: the title is the way to the track, artist stays text. */}
        <TrackIdentity track={track} hideAlbum={compact} links={compact ? "title" : "all"} />
        <Flex flexWrap="wrap" alignItems="center" gap={1.5} mt="2px">
          <BpmCell track={track} delta={mix.bpmDelta} />
          {camelot && (
            <Flex alignItems="center" gap={1} flexShrink={0}>
              <KeyChip
                keyName={track.key}
                camelot={camelot}
                keyConfidence={track.key_confidence}
                showName={false}
              />
              {mix.keyRelation && (
                <StatusTag
                  size="sm"
                  tone={mix.keyRelation === "clash" ? "missing" : "success"}
                  whiteSpace="nowrap"
                >
                  {mix.keyRelation === "clash" ? "Key clash" : "Key fits"}
                </StatusTag>
              )}
            </Flex>
          )}
          {reason && <CategoryTag size="sm">{suggestionReasonLabel(reason)}</CategoryTag>}
        </Flex>
      </Flex>
      {added && (
        <StatusTag size="sm" tone="success" whiteSpace="nowrap" role="status" flexShrink={0}>
          <FiCheck aria-hidden /> ADDED
        </StatusTag>
      )}
      {onAdd && !added && (
        <IconButton
          variant="outline"
          minW="44px"
          h="44px"
          flexShrink={0}
          aria-label={`Add ${track.title} after ${seed.title}`}
          onClick={() => onAdd(track)}
        >
          <FiPlus />
        </IconButton>
      )}
      {menu && (
        <Box flexShrink={0}>
          <TrackRowContext.Provider value={true}>
            <TrackActionsMenu track={track} prominent onAddedToPlaylist={onAddedToPlaylist} />
          </TrackRowContext.Provider>
        </Box>
      )}
    </Flex>
  );
}

export type SuggestionFoldRowProps = {
  /** How many suggestions are folded away. */
  count: number;
  /** The release they share: its album title. */
  source: string;
  onExpand: () => void;
  /** Matches the compact rows' 44px cover, so the label stays under the titles. */
  compact?: boolean;
};

/** "+N more from <album>": a release's folded tail, directly under its last visible row. */
export function SuggestionFoldRow({
  count,
  source,
  onExpand,
  compact = false,
}: SuggestionFoldRowProps) {
  const label = `+${count} more from ${source}`;
  return (
    <Box
      as="li"
      listStyleType="none"
      borderBottomWidth="rule"
      borderColor="border"
      _last={{ borderBottomWidth: 0 }}
      // Indent to the text column: row padding + cover + gap.
      pl={
        compact
          ? `calc(${PAD_X} + 44px + ${GAP} - var(--chakra-spacing-2))`
          : {
              base: `calc(${PAD_X} + ${COVER.base} + ${GAP} - var(--chakra-spacing-2))`,
              md: `calc(${PAD_X} + ${COVER.md} + ${GAP} - var(--chakra-spacing-2))`,
            }
      }
      pr={PAD_X}
    >
      <Button
        variant="ghost"
        size="xs"
        minH="44px"
        maxW="full"
        px={2}
        color="fg.muted"
        justifyContent="flex-start"
        aria-label={label}
        title={source}
        onClick={onExpand}
      >
        <Text as="span" truncate minW={0}>
          {label}
        </Text>
      </Button>
    </Box>
  );
}

/** The suggestion list: one outlined block, ruled rows, one shadow. */
export function SuggestionList({ children }: { children: React.ReactNode }) {
  return (
    <Box
      as="ul"
      m={0}
      p={0}
      borderWidth="outline"
      borderColor="border.ink"
      borderRadius="md"
      boxShadow="md"
      bg="bg.panel"
      overflow="hidden"
    >
      {children}
    </Box>
  );
}

"use client";

import React from "react";
import { Box, Button, Flex, IconButton, Text } from "@chakra-ui/react";
import { FiCheck, FiPlay, FiPlus } from "react-icons/fi";
import Cover from "@/components/Cover";
import { artworkOf } from "@/components/player/trackMeta";
import { CategoryTag, StatusTag } from "@/components/ui/RoleTags";
import { BpmCell } from "@/components/RelatedTrackRows";
import { camelotDotColor, camelotOf, describeMix } from "@/lib/mixCompat";
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
  /** What adding does is up to the surface. */
  onAdd: (track: Track) => void;
  onPreview?: (track: Track) => void;
  /** Already added: the row shows ✓ ADDED and stays where it is. */
  added?: boolean;
};

function KeyFit({ seed, track }: { seed: Track; track: Track }) {
  const camelot = camelotOf(track.key);
  const { keyRelation } = describeMix(seed, track);
  if (!camelot) return null;
  return (
    <Flex alignItems="center" gap={1} flexShrink={0}>
      <Box
        aria-hidden
        w="8px"
        h="8px"
        borderRadius="full"
        flexShrink={0}
        style={{ background: camelotDotColor(camelot) }}
      />
      <Text as="span" fontFamily="mono" fontSize="12px">
        {camelot}
      </Text>
      {keyRelation && (
        <StatusTag
          size="sm"
          tone={keyRelation === "clash" ? "missing" : "success"}
          whiteSpace="nowrap"
        >
          {keyRelation === "clash" ? "Key clash" : "Key fits"}
        </StatusTag>
      )}
    </Flex>
  );
}

/** One suggested track: cover, title, mix facts against the seed, one reason, add/preview. */
export default function SuggestionRow({
  seed,
  track,
  onAdd,
  onPreview,
  added = false,
}: SuggestionRowProps) {
  const mix = describeMix(seed, track);
  const reason = suggestionReason(seed, track);
  const byline = [track.artist, track.album].filter(Boolean).join(" · ");
  return (
    <Flex
      as="li"
      listStyleType="none"
      alignItems="center"
      gap="10px"
      py="8px"
      px="10px"
      borderWidth="1px"
      borderColor={added ? "status.success.border" : "border"}
      bg={added ? "status.success.subtle" : undefined}
      borderRadius="md"
      data-added={added || undefined}
    >
      <Box display={{ base: "none", sm: "block" }}>
        <Cover src={artworkOf(track)} alt="" size="48px" />
      </Box>
      <Box display={{ base: "block", sm: "none" }}>
        <Cover src={artworkOf(track)} alt="" size="44px" />
      </Box>
      <Flex direction="column" gap="2px" flex={1} minW={0}>
        <Text fontWeight="semibold" fontSize="15px" lineHeight="20px" truncate>
          {track.title}
        </Text>
        <Text fontSize="12px" lineHeight="16px" color="fg.muted" truncate>
          {byline}
        </Text>
        <Flex flexWrap="wrap" alignItems="center" gap={1.5} mt="2px">
          <BpmCell track={track} delta={mix.bpmDelta} />
          <KeyFit seed={seed} track={track} />
          {reason && <CategoryTag size="sm">{suggestionReasonLabel(reason)}</CategoryTag>}
        </Flex>
      </Flex>
      {onPreview && (
        <IconButton
          variant="ghost"
          minW="44px"
          h="44px"
          aria-label={`Preview ${track.title}`}
          onClick={() => onPreview(track)}
        >
          <FiPlay />
        </IconButton>
      )}
      {added ? (
        <StatusTag size="sm" tone="success" whiteSpace="nowrap" role="status">
          <FiCheck aria-hidden /> ADDED
        </StatusTag>
      ) : (
        <IconButton
          variant="outline"
          minW="44px"
          h="44px"
          aria-label={`Add ${track.title} after ${seed.title}`}
          onClick={() => onAdd(track)}
        >
          <FiPlus />
        </IconButton>
      )}
    </Flex>
  );
}

export type SuggestionFoldRowProps = {
  /** How many suggestions are folded away. */
  count: number;
  /** The group they share, e.g. an album title. */
  source: string;
  onExpand: () => void;
};

/** "+N more from <album>": the folded tail of a group. */
export function SuggestionFoldRow({ count, source, onExpand }: SuggestionFoldRowProps) {
  return (
    <Box as="li" listStyleType="none">
      <Button variant="ghost" size="sm" minH="44px" w="full" onClick={onExpand}>
        +{count} more from {source}
      </Button>
    </Box>
  );
}

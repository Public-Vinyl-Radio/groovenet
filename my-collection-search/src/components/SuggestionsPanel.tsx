"use client";

import React, { useEffect, useRef, useState } from "react";
import { Box, Button, Flex, IconButton, SegmentGroup, Text } from "@chakra-ui/react";
import { FiX } from "react-icons/fi";
import SuggestionRow, { SuggestionFoldRow } from "@/components/SuggestionRow";
import SuggestionScopeToggle from "@/components/SuggestionScopeToggle";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { useRecommendationsQuery, type RecommendedTrack } from "@/hooks/useRecommendations";
import { useSuggestionScope } from "@/hooks/useSuggestionScope";
import { camelotOf } from "@/lib/mixCompat";
import { rankSuggestions } from "@/lib/rankSuggestions";
import type { Track } from "@/types/track";

export type SuggestionSeedRef = { track_id: string; friend_id: number };

export interface SuggestionsPanelProps {
  /** The playlist as it is now, in order. */
  playlist: Track[];
  /** The track suggestions follow; null suggests for the whole playlist. */
  seed: SuggestionSeedRef | null;
  onSeedChange: (seed: SuggestionSeedRef | null) => void;
  /** Insert the track at this index of the playlist. */
  onAdd: (track: Track, index: number) => void;
  onClose: () => void;
}

const PAGE = 20;
const SEGMENTS = [
  { value: "track", label: "After a track" },
  { value: "playlist", label: "Whole playlist" },
];

const keyOf = (t: Pick<Track, "track_id" | "friend_id">) => `${t.track_id}:${t.friend_id}`;

/** Suggestions docked beside the playlist: stays open while you add and edit. */
export default function SuggestionsPanel({
  playlist,
  seed,
  onSeedChange,
  onAdd,
  onClose,
}: SuggestionsPanelProps) {
  const { scope, libraryFriendId, ready, setScope } = useSuggestionScope();
  const [compatibleKey, setCompatibleKey] = useState(true);
  const [bpmWithinSixPercent, setBpmWithinSixPercent] = useState(true);
  const [visible, setVisible] = useState(PAGE);
  const [expanded, setExpanded] = useState<string[]>([]);

  const seedTrack = seed ? playlist.find((t) => keyOf(t) === keyOf(seed)) : undefined;
  const seedKey = seedTrack ? keyOf(seedTrack) : "playlist";

  // Adds belong to the seed they were made against; a new seed starts clean.
  const [addedState, setAddedState] = useState<{ key: string; tracks: Track[] }>({
    key: seedKey,
    tracks: [],
  });
  const added = addedState.key === seedKey ? addedState.tracks : [];
  const addedKeys = new Set(added.map(keyOf));

  // Rank against the playlist as it was before these adds, so added rows stay put.
  const base = playlist.filter((t) => !addedKeys.has(keyOf(t)));
  const rankSeed = seedTrack ?? base.at(-1);

  const { data: recs = [], isLoading } = useRecommendationsQuery(
    seedTrack ? [seedTrack] : base,
    100,
    { scope, libraryFriendId, enabled: ready },
  );
  const ranked = rankSeed
    ? rankSuggestions(recs, {
        seed: rankSeed,
        playlist: base,
        seedMode: seedTrack ? "track" : "playlist",
        filters: { compatibleKey, bpmWithinSixPercent },
      })
    : null;

  const foldRows = (ranked?.folds ?? []).filter((g) => expanded.includes(g.release));
  const rows: RecommendedTrack[] = [
    ...(ranked?.tracks ?? []),
    ...foldRows.flatMap((g) => g.tracks),
  ];
  const shown = rows.slice(0, visible);

  const sentinel = useRef<HTMLDivElement>(null);
  const more = shown.length < rows.length;
  useEffect(() => {
    const node = sentinel.current;
    if (!more || !node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible((n) => n + PAGE);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [more, shown.length]);

  const handleAdd = (track: Track) => {
    const index = seedTrack
      ? playlist.findIndex((t) => keyOf(t) === keyOf(seedTrack)) + 1 + added.length
      : playlist.length;
    setAddedState({ key: seedKey, tracks: [...added, track] });
    onAdd(track, index);
  };

  const setMode = (mode: string) => {
    if (mode === "playlist") onSeedChange(null);
    else {
      const last = playlist.at(-1);
      if (last && last.friend_id != null)
        onSeedChange({ track_id: last.track_id, friend_id: last.friend_id });
    }
  };

  const camelot = rankSeed ? camelotOf(rankSeed.key) : null;
  const facts = rankSeed
    ? [rankSeed.bpm ? `${rankSeed.bpm} BPM` : null, camelot].filter(Boolean).join(" · ")
    : "";

  return (
    <Box
      as="aside"
      aria-label="Suggestions"
      data-testid="suggestions-panel"
      flex={{ xl: "0 0 clamp(360px, 30%, 460px)" }}
      position={{ xl: "sticky" }}
      top={{ xl: 4 }}
      alignSelf="flex-start"
      maxH={{ xl: "calc(100vh - 32px)" }}
      overflowY="auto"
      borderWidth="outline"
      borderColor="border.ink"
      boxShadow="md"
      bg="bg.panel"
      w={{ base: "100%", xl: "auto" }}
    >
      <Flex align="center" justify="space-between" px={3} py={2} borderBottomWidth="rule">
        <SectionLabel variant="overline">Suggestions</SectionLabel>
        <IconButton
          aria-label="Close suggestions"
          variant="ghost"
          size="xs"
          minW="44px"
          h="44px"
          onClick={onClose}
        >
          <FiX />
        </IconButton>
      </Flex>
      <Flex direction="column" gap={3} p={3}>
        <SegmentGroup.Root
          size="sm"
          value={seedTrack ? "track" : "playlist"}
          aria-label="Suggest for"
          onValueChange={(details) => setMode(details.value as string)}
        >
          <SegmentGroup.Indicator />
          <SegmentGroup.Items items={SEGMENTS} />
        </SegmentGroup.Root>
        {rankSeed && (
          <Text fontSize="12px" color="fg.muted">
            {facts ? `${facts}. ` : ""}
            {seedTrack
              ? `Adds go after “${seedTrack.title}”.`
              : "Adds go to the end of the playlist."}
          </Text>
        )}
        <Flex gap={2} wrap="wrap" align="center">
          <Button
            size="xs"
            aria-pressed={compatibleKey}
            variant={compatibleKey ? "solid" : "outline"}
            colorPalette="neutral"
            onClick={() => setCompatibleKey((v) => !v)}
          >
            Compatible key
          </Button>
          <Button
            size="xs"
            aria-pressed={bpmWithinSixPercent}
            variant={bpmWithinSixPercent ? "solid" : "outline"}
            colorPalette="neutral"
            onClick={() => setBpmWithinSixPercent((v) => !v)}
          >
            BPM ±6%
          </Button>
          <SuggestionScopeToggle value={scope} onChange={setScope} />
        </Flex>
        {ranked && (
          <Text fontSize="12px" color="fg.muted" role="status">
            {ranked.tracks.length} suggestions
            {ranked.hiddenByFilters > 0 ? ` · ${ranked.hiddenByFilters} hidden by filters` : ""}
          </Text>
        )}
        {ready && !isLoading && rankSeed && shown.length === 0 && (
          <Text color="fg.muted" fontSize="sm">
            {scope === "library"
              ? "No suggestions in this library. Try All libraries."
              : "No suggestions found."}
          </Text>
        )}
        <Flex as="ul" direction="column" gap={2} m={0} p={0}>
          {shown.map((rec) => (
            <SuggestionRow
              key={keyOf(rec)}
              seed={rankSeed as Track}
              track={rec}
              added={addedKeys.has(keyOf(rec))}
              onAdd={handleAdd}
            />
          ))}
          {(ranked?.folds ?? [])
            .filter((g) => !expanded.includes(g.release))
            .map((g) => (
              <SuggestionFoldRow
                key={g.release}
                count={g.tracks.length}
                source={g.release}
                onExpand={() => setExpanded((list) => [...list, g.release])}
              />
            ))}
        </Flex>
        {more && <div ref={sentinel} data-testid="suggestions-sentinel" />}
      </Flex>
    </Box>
  );
}

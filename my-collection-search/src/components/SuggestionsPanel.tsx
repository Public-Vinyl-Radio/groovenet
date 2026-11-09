"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Drawer,
  Flex,
  IconButton,
  SegmentGroup,
  Text,
  useBreakpointValue,
} from "@chakra-ui/react";
import { FiX } from "react-icons/fi";
import SuggestionRow, { SuggestionFoldRow, SuggestionList } from "@/components/SuggestionRow";
import RetroDialog from "@/components/ui/RetroDialog";
import SuggestionScopeToggle from "@/components/SuggestionScopeToggle";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { useRecommendationsQuery } from "@/hooks/useRecommendations";
import { useSuggestionScope } from "@/hooks/useSuggestionScope";
import { camelotOf } from "@/lib/mixCompat";
import { layoutSuggestions, rankSuggestions } from "@/lib/rankSuggestions";
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
  // Phones get a bottom sheet, tablets and small desktops a modal, wide screens the docked panel.
  const form = useBreakpointValue({ base: "sheet", md: "modal", xl: "panel" }) ?? "panel";
  const isSheet = form === "sheet";
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

  const layout = ranked ? layoutSuggestions(ranked, { expanded, limit: visible }) : null;

  const sentinel = useRef<HTMLDivElement>(null);
  const more = (layout?.remaining ?? 0) > 0;
  const shownCount = layout?.shown ?? 0;
  useEffect(() => {
    const node = sentinel.current;
    if (!more || !node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible((n) => n + PAGE);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [more, shownCount]);

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

  const status = ranked && (
    <Text fontSize="12px" color="fg.muted" role="status">
      {ranked.tracks.length} suggestions
      {ranked.hiddenByFilters > 0 ? ` · ${ranked.hiddenByFilters} hidden by filters` : ""}
    </Text>
  );
  const empty = ready && !isLoading && rankSeed && shownCount === 0 && (
    <Text color="fg.muted" fontSize="sm">
      {scope === "library"
        ? "No suggestions in this library. Try All libraries."
        : "No suggestions found."}
    </Text>
  );
  const list = (
    <>
      {layout && layout.items.length > 0 && (
        <SuggestionList>
          {layout.items.map((item) =>
            item.kind === "fold" ? (
              <SuggestionFoldRow
                key={`fold:${item.fold.key}`}
                count={item.fold.tracks.length}
                source={item.fold.release}
                compact={isSheet}
                onExpand={() => setExpanded((keys) => [...keys, item.fold.key])}
              />
            ) : (
              <SuggestionRow
                key={keyOf(item.track)}
                seed={rankSeed as Track}
                track={item.track}
                added={addedKeys.has(keyOf(item.track))}
                compact={isSheet}
                onAdd={handleAdd}
                menu
              />
            ),
          )}
        </SuggestionList>
      )}
      {more && <div ref={sentinel} data-testid="suggestions-sentinel" />}
    </>
  );
  const seedLine = rankSeed && (
    <Text fontSize="12px" color="fg.muted">
      {facts ? `${facts}. ` : ""}
      {seedTrack ? `Adds go after “${seedTrack.title}”.` : "Adds go to the end of the playlist."}
    </Text>
  );

  if (form !== "panel") {
    const shared = {
      onClose,
      seedLine,
      chips: (
        <>
          <Chip pressed={!seedTrack} onClick={() => setMode(seedTrack ? "playlist" : "track")}>
            Whole playlist
          </Chip>
          <Chip pressed={compatibleKey} onClick={() => setCompatibleKey((v) => !v)}>
            Compatible key
          </Chip>
          <Chip pressed={bpmWithinSixPercent} onClick={() => setBpmWithinSixPercent((v) => !v)}>
            BPM ±6%
          </Chip>
          {SCOPES.map((s) => (
            <Chip key={s.value} pressed={scope === s.value} onClick={() => setScope(s.value)}>
              {s.label}
            </Chip>
          ))}
        </>
      ),
      footer: `${added.length} added after ${seedTrack ? seedTrack.title : "the playlist"}`,
      children: (
        <>
          {status}
          {empty}
          {list}
        </>
      ),
    };
    return isSheet ? <SuggestionsSheet {...shared} /> : <SuggestionsModal {...shared} />;
  }

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
        {seedLine}
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
        {status}
        {empty}
        {list}
      </Flex>
    </Box>
  );
}

const SCOPES = [
  { value: "library", label: "This library" },
  { value: "all", label: "All libraries" },
] as const;

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      size="sm"
      flexShrink={0}
      minH="44px"
      aria-pressed={pressed}
      variant={pressed ? "solid" : "outline"}
      colorPalette="neutral"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** "N added · Done": the same footer for the sheet and the modal. */
function SuggestionsFooter({ footer, onClose }: { footer: string; onClose: () => void }) {
  return (
    <>
      <Text fontSize="sm" role="status" data-testid="suggestions-count">
        {footer}
      </Text>
      <Button minH="44px" colorPalette="neutral" onClick={onClose}>
        Done
      </Button>
    </>
  );
}

type SuggestionsFormProps = {
  onClose: () => void;
  seedLine: React.ReactNode;
  chips: React.ReactNode;
  footer: string;
  children: React.ReactNode;
};

/** The tablet and small-desktop form: a modal; one tap adds and it stays open. */
function SuggestionsModal({ onClose, seedLine, chips, footer, children }: SuggestionsFormProps) {
  return (
    <RetroDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Suggestions"
      maxW="2xl"
      footer={
        <Flex align="center" justify="space-between" gap={3} px={3} py={2}>
          <SuggestionsFooter footer={footer} onClose={onClose} />
        </Flex>
      }
    >
      <Flex
        direction="column"
        data-testid="suggestions-modal"
        h="min(80dvh, 760px)"
        // The list scrolls inside the modal; the seed line and filters stay put.
      >
        <Flex direction="column" gap={2} p={3} borderBottomWidth="rule" flexShrink={0}>
          {seedLine}
          <Flex gap={2} wrap="wrap" role="group" aria-label="Filters">
            {chips}
          </Flex>
        </Flex>
        <Flex
          direction="column"
          gap={3}
          p={3}
          flex={1}
          minH={0}
          overflowY="auto"
          data-testid="suggestions-scroll"
        >
          {children}
        </Flex>
      </Flex>
    </RetroDialog>
  );
}

/** Drag the handle down this far (px) to dismiss. */
const DISMISS_DRAG = 96;

/** The phone form: about 75% of the screen, over the playlist, one tap to add and it stays open. */
function SuggestionsSheet({ onClose, seedLine, chips, footer, children }: SuggestionsFormProps) {
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    startY.current = e.clientY;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startY.current !== null) setDrag(Math.max(0, e.clientY - startY.current));
  };
  const onPointerUp = () => {
    if (startY.current === null) return;
    startY.current = null;
    if (drag >= DISMISS_DRAG) onClose();
    setDrag(0);
  };

  return (
    <Drawer.Root
      open
      onOpenChange={({ open }) => !open && onClose()}
      placement="bottom"
      closeOnInteractOutside
    >
      <Drawer.Positioner>
        <Drawer.Content
          aria-label="Suggestions"
          data-testid="suggestions-sheet"
          display="flex"
          flexDirection="column"
          h="75dvh"
          maxH="75dvh"
          bg="bg.panel"
          borderTopRadius="lg"
          overflow="hidden"
          style={{ transform: drag ? `translateY(${drag}px)` : undefined }}
        >
          <Box
            data-testid="suggestions-sheet-handle"
            aria-hidden
            display="flex"
            justifyContent="center"
            pt={2}
            pb={1}
            style={{ touchAction: "none", cursor: "grab" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <Box w="40px" h="4px" borderRadius="full" bg="border.emphasized" />
          </Box>
          <Flex direction="column" gap={2} px={3} pb={2} borderBottomWidth="rule" flexShrink={0}>
            <Flex align="center" justify="space-between">
              <Drawer.Title m={0}>
                <SectionLabel variant="overline">Suggestions</SectionLabel>
              </Drawer.Title>
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
            {seedLine}
            <Flex gap={2} overflowX="auto" role="group" aria-label="Filters">
              {chips}
            </Flex>
          </Flex>
          <Flex
            direction="column"
            gap={3}
            p={3}
            flex={1}
            minH={0}
            overflowY="auto"
            data-testid="suggestions-scroll"
          >
            {children}
          </Flex>
          <Flex
            align="center"
            justify="space-between"
            gap={3}
            px={3}
            py={2}
            borderTopWidth="rule"
            flexShrink={0}
            // Clear of the home indicator; the sheet sits above the player bar and nav.
            pb="calc(var(--chakra-spacing-2) + var(--safe-bottom, 0px))"
          >
            <SuggestionsFooter footer={footer} onClose={onClose} />
          </Flex>
        </Drawer.Content>
      </Drawer.Positioner>
    </Drawer.Root>
  );
}

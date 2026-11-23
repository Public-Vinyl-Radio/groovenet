"use client";

import React, { useEffect, useRef, useState, type RefObject } from "react";
import { Box, Button, Drawer, Flex, IconButton, Text } from "@chakra-ui/react";
import { FiX } from "react-icons/fi";
import SuggestionRow, { SuggestionFoldRow, SuggestionList } from "@/components/SuggestionRow";
import RetroDialog from "@/components/ui/RetroDialog";
import SuggestionSettingsDialog, {
  SuggestionSettingsButton,
  suggestionSettingsSummary,
} from "@/components/SuggestionSettingsDialog";
import { useRankingProfile } from "@/hooks/useRankingProfiles";
import { suggestionFilterLabels } from "@/lib/ranking/configs";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { useRecommendationsQuery } from "@/hooks/useRecommendations";
import { useSuggestionScope } from "@/hooks/useSuggestionScope";
import { SUGGESTIONS_PANEL_MIN_WIDTH, useSuggestionsForm } from "@/hooks/useSuggestionsForm";
import {
  trackSuggestionAction,
  trackSuggestionsExpanded,
  useSuggestionsShown,
} from "@/lib/analytics/suggestions";
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
  /**
   * The block that holds the list and this panel. Its width decides the form (#1233); without
   * one the window's width stands in.
   */
  containerRef?: RefObject<HTMLElement | null>;
}

const PAGE = 20;

const keyOf = (t: Pick<Track, "track_id" | "friend_id">) => `${t.track_id}:${t.friend_id}`;

type AddedState = {
  key: string;
  tracks: Track[];
  /** The latest add and the track it went after, for the confirmation. */
  last: { title: string; after: string } | null;
};

/**
 * Suggestions for a playlist: docked beside the list when there is room, a modal when there is
 * not, a bottom sheet on phones. It stays open while you add and edit.
 */
export default function SuggestionsPanel({
  playlist,
  seed,
  onSeedChange,
  onAdd,
  onClose,
  containerRef,
}: SuggestionsPanelProps) {
  const ownRef = useRef<HTMLElement | null>(null);
  const form = useSuggestionsForm(containerRef ?? ownRef);
  const isSheet = form === "sheet";
  const { scope, libraryFriendId, ready, setScope } = useSuggestionScope();
  const [compatibleKey, setCompatibleKey] = useState(true);
  const [bpmWithinSixPercent, setBpmWithinSixPercent] = useState(true);
  const [visible, setVisible] = useState(PAGE);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const seedTrack = seed ? playlist.find((t) => keyOf(t) === keyOf(seed)) : undefined;
  const seedKey = seedTrack ? keyOf(seedTrack) : "playlist";

  // Adds belong to the seed they were made against; a new seed starts clean.
  const [addedState, setAddedState] = useState<AddedState>({
    key: seedKey,
    tracks: [],
    last: null,
  });
  const added = addedState.key === seedKey ? addedState.tracks : [];
  const lastAdd = addedState.key === seedKey ? addedState.last : null;
  const addedKeys = new Set(added.map(keyOf));

  // Rank against the playlist as it was before these adds, so added rows stay put.
  const base = playlist.filter((t) => !addedKeys.has(keyOf(t)));
  const rankSeed = seedTrack ?? base.at(-1);

  const { data: recs = [], isLoading } = useRecommendationsQuery(
    seedTrack ? [seedTrack] : base,
    100,
    { scope, libraryFriendId, enabled: ready },
  );
  const ranking = useRankingProfile("suggestions");
  const labels = suggestionFilterLabels(ranking.config);
  const ranked = rankSeed
    ? rankSuggestions(recs, {
        seed: rankSeed,
        playlist: base,
        seedMode: seedTrack ? "track" : "playlist",
        config: ranking.config,
        filters: { compatibleKey, bpmWithinSixPercent },
      })
    : null;

  const layout = ranked ? layoutSuggestions(ranked, { expanded, limit: visible }) : null;

  const context = {
    surface: "suggestions_panel",
    seedTrackId: seedTrack?.track_id ?? null,
  } as const;
  const sentinel = useRef<HTMLDivElement>(null);
  const remaining = layout?.remaining ?? 0;
  const more = remaining > 0;
  const shownCount = layout?.shown ?? 0;
  // A whole-playlist list is a new load whenever the playlist it follows changes.
  const listSeeds = seedTrack ? seedKey : base.map(keyOf).join(",");
  useSuggestionsShown(context, {
    loaded: ready && !isLoading && ranked !== null,
    listKey: `${listSeeds}|${scope}`,
    scope,
    compatibleKey,
    bpmWithinSixPercent,
    shownCount,
    hiddenByFilters: ranked?.hiddenByFilters ?? 0,
  });
  const { surface, seedTrackId } = context;
  useEffect(() => {
    const node = sentinel.current;
    if (!more || !node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      setVisible((n) => n + PAGE);
      trackSuggestionsExpanded(
        { surface, seedTrackId },
        "show_more",
        shownCount + Math.min(PAGE, remaining),
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
    // `form`: the sentinel mounts once the form is known and moves when the form changes.
  }, [form, more, shownCount, remaining, surface, seedTrackId]);

  const handleAdd = (track: Track) => {
    const index = seedTrack
      ? playlist.findIndex((t) => keyOf(t) === keyOf(seedTrack)) + 1 + added.length
      : playlist.length;
    // An add needs a playlist to rank against, so the slot before `index` is always a track.
    const after = playlist[index - 1].title;
    setAddedState({ key: seedKey, tracks: [...added, track], last: { title: track.title, after } });
    onAdd(track, index);
  };

  const camelot = rankSeed ? camelotOf(rankSeed.key) : null;
  const facts = rankSeed
    ? [rankSeed.bpm ? `${rankSeed.bpm} BPM` : null, camelot].filter(Boolean).join(" · ")
    : "";
  const touch = form !== "panel";

  // What the suggestions follow and where an add goes: the one line that names the target (#1233).
  const seedPosition = seedTrack ? playlist.findIndex((t) => keyOf(t) === keyOf(seedTrack)) + 1 : 0;
  const targetLine = (
    <Flex align="center" gap={1} minH="24px" data-testid="suggestions-target">
      <Text fontSize="12px" lineHeight="16px" flex={1} minW={0} overflowWrap="anywhere">
        {seedTrack ? (
          <>
            Suggesting after:{" "}
            <Text as="span" fontWeight="semibold" color="fg">
              “{seedTrack.title}” ({seedPosition})
            </Text>{" "}
            · adds after it
          </>
        ) : (
          <>
            Suggesting for:{" "}
            <Text as="span" fontWeight="semibold" color="fg">
              whole playlist
            </Text>{" "}
            · adds to the end
          </>
        )}
      </Text>
      {seedTrack && (
        <IconButton
          aria-label="Suggest for the whole playlist"
          title="Suggest for the whole playlist"
          variant="ghost"
          size="xs"
          flexShrink={0}
          minW={{ base: "44px", md: "32px" }}
          h={{ base: "44px", md: "32px" }}
          onClick={() => onSeedChange(null)}
        >
          <FiX />
        </IconButton>
      )}
    </Flex>
  );

  // One summary line: the count and the seed's facts, then the settings that are in the dialog,
  // so a choice made there is never hidden.
  const summaryParts = ranked
    ? [
        `${ranked.tracks.length} ${ranked.tracks.length === 1 ? "suggestion" : "suggestions"}`,
        facts,
        ranked.hiddenByFilters > 0 ? `${ranked.hiddenByFilters} hidden by filters` : "",
        suggestionSettingsSummary({ rankingName: ranking.profile.name, scope }),
      ].filter(Boolean)
    : [];
  const summary = ranked && (
    <Text
      fontSize="12px"
      lineHeight="16px"
      color="fg.muted"
      role="status"
      data-testid="suggestions-summary"
    >
      {summaryParts.join(" · ")}
    </Text>
  );
  const filters = (labels.compatibleKey || labels.bpmWithinSixPercent) && (
    <Flex gap={2} wrap="wrap" align="center" role="group" aria-label="Filters">
      {labels.compatibleKey && (
        <FilterButton
          touch={touch}
          pressed={compatibleKey}
          onClick={() => setCompatibleKey((v) => !v)}
        >
          {labels.compatibleKey}
        </FilterButton>
      )}
      {labels.bpmWithinSixPercent && (
        <FilterButton
          touch={touch}
          pressed={bpmWithinSixPercent}
          onClick={() => setBpmWithinSixPercent((v) => !v)}
        >
          {labels.bpmWithinSixPercent}
        </FilterButton>
      )}
    </Flex>
  );
  const empty = ready && !isLoading && rankSeed && shownCount === 0 && (
    <Text color="fg.muted" fontSize="sm">
      {scope === "library"
        ? "No suggestions in this library. Try All libraries in the settings."
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
                onExpand={() => {
                  setExpanded((keys) => [...keys, item.fold.key]);
                  trackSuggestionsExpanded(context, "fold", shownCount + item.fold.tracks.length);
                }}
              />
            ) : (
              <SuggestionRow
                key={keyOf(item.track)}
                seed={rankSeed as Track}
                track={item.track}
                added={addedKeys.has(keyOf(item.track))}
                compact={isSheet}
                onAdd={handleAdd}
                onAction={(action) =>
                  trackSuggestionAction(context, { seed: rankSeed as Track, item, action })
                }
                menu
              />
            ),
          )}
        </SuggestionList>
      )}
      {more && <div ref={sentinel} data-testid="suggestions-sentinel" />}
    </>
  );
  const settingsDialog = (
    <SuggestionSettingsDialog
      open={settingsOpen}
      onOpenChange={setSettingsOpen}
      id="playlist-suggestions"
      ranking={{
        value: ranking.profile.id,
        options: ranking.options,
        onChange: ranking.choose,
      }}
      scope={{ value: scope, onChange: setScope }}
    />
  );

  // Until the form is measured (before the first paint) there is nothing to show.
  if (form === null) return null;

  if (form !== "panel") {
    const shared = {
      onClose,
      onOpenSettings: () => setSettingsOpen(true),
      lead: (
        <>
          {targetLine}
          {summary}
          {filters}
        </>
      ),
      footer: lastAdd
        ? `Added “${lastAdd.title}” after “${lastAdd.after}” · ${added.length} added`
        : "Nothing added yet",
      children: (
        <>
          {empty}
          {list}
        </>
      ),
    };
    return (
      <>
        {isSheet ? <SuggestionsSheet {...shared} /> : <SuggestionsModal {...shared} />}
        {settingsDialog}
      </>
    );
  }

  return (
    <>
      <Box
        as="aside"
        aria-label="Suggestions"
        data-testid="suggestions-panel"
        flex={`0 0 clamp(${SUGGESTIONS_PANEL_MIN_WIDTH}px, 30%, 460px)`}
        position="sticky"
        top={4}
        alignSelf="flex-start"
        maxH="calc(100vh - 32px)"
        overflowY="auto"
        borderWidth="outline"
        borderColor="border.ink"
        boxShadow="md"
        bg="bg.panel"
      >
        <Flex align="center" justify="space-between" gap={1} px={3} py={2} borderBottomWidth="rule">
          <SectionLabel variant="overline">Suggestions</SectionLabel>
          <Flex align="center">
            <SuggestionSettingsButton onClick={() => setSettingsOpen(true)} />
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
        </Flex>
        <Flex direction="column" gap={3} p={3}>
          {targetLine}
          {summary}
          {filters}
          {empty}
          {list}
        </Flex>
      </Box>
      {settingsDialog}
    </>
  );
}

function FilterButton({
  pressed,
  touch,
  onClick,
  children,
}: {
  pressed: boolean;
  /** 44px tall on the sheet and the modal; compact in the docked panel. */
  touch: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      size={touch ? "sm" : "xs"}
      flexShrink={0}
      minH={touch ? "44px" : undefined}
      aria-pressed={pressed}
      variant={pressed ? "solid" : "outline"}
      colorPalette="neutral"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** The confirmation and "Done": the same footer for the sheet and the modal. */
function SuggestionsFooter({ footer, onClose }: { footer: string; onClose: () => void }) {
  return (
    <>
      <Text
        fontSize="sm"
        role="status"
        data-testid="suggestions-count"
        minW={0}
        truncate
        title={footer}
      >
        {footer}
      </Text>
      <Button minH="44px" flexShrink={0} colorPalette="neutral" onClick={onClose}>
        Done
      </Button>
    </>
  );
}

type SuggestionsFormProps = {
  onClose: () => void;
  onOpenSettings: () => void;
  /** The target line, the summary line and the filters. */
  lead: React.ReactNode;
  footer: string;
  children: React.ReactNode;
};

/** The tablet and small-desktop form: a modal; one tap adds and it stays open. */
function SuggestionsModal({
  onClose,
  onOpenSettings,
  lead,
  footer,
  children,
}: SuggestionsFormProps) {
  return (
    <RetroDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Suggestions"
      headerActions={<SuggestionSettingsButton onInk onClick={onOpenSettings} />}
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
        // The list scrolls inside the modal; the target, summary and filters stay put.
      >
        <Flex direction="column" gap={2} p={3} borderBottomWidth="rule" flexShrink={0}>
          {lead}
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
function SuggestionsSheet({
  onClose,
  onOpenSettings,
  lead,
  footer,
  children,
}: SuggestionsFormProps) {
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
              <Flex align="center">
                <SuggestionSettingsButton onClick={onOpenSettings} />
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
            </Flex>
            {lead}
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

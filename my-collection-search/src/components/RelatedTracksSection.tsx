"use client";

import { useState } from "react";
import { Box, Button, Flex, Spinner, Text, useBreakpointValue } from "@chakra-ui/react";
import { SectionHeading } from "@/components/ui/SectionHeading";
import SuggestionRow, { SuggestionFoldRow, SuggestionList } from "@/components/SuggestionRow";
import SuggestionScopeToggle from "@/components/SuggestionScopeToggle";
import { useRecommendationsQuery } from "@/hooks/useRecommendations";
import { useSuggestionScope } from "@/hooks/useSuggestionScope";
import {
  trackSuggestionAction,
  trackSuggestionsExpanded,
  useSuggestionsShown,
} from "@/lib/analytics/suggestions";
import { layoutSuggestions, rankSuggestions } from "@/lib/rankSuggestions";
import type { Track } from "@/types/track";

const keyOf = (track: Pick<Track, "track_id" | "friend_id">) =>
  `${track.track_id}:${track.friend_id}`;
const PAGE_SIZE = 20;

export default function RelatedTracksSection({ track }: { track: Track }) {
  const isMobile = useBreakpointValue({ base: true, md: false }) ?? true;
  const [extra, setExtra] = useState(0);
  const [compatibleKey, setCompatibleKey] = useState(true);
  const [bpmWithinSixPercent, setBpmWithinSixPercent] = useState(true);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  const { scope, libraryFriendId, ready, setScope } = useSuggestionScope();
  const {
    data = [],
    isLoading,
    error,
  } = useRecommendationsQuery([track], 100, {
    scope,
    libraryFriendId,
    enabled: ready,
  });
  const ranked = rankSuggestions(data, {
    seed: track,
    filters: { compatibleKey, bpmWithinSixPercent },
  });
  const layout = layoutSuggestions(ranked, {
    expanded,
    limit: (isMobile ? 5 : PAGE_SIZE) + extra,
  });
  const { remaining } = layout;
  const context = { surface: "track_page", seedTrackId: track.track_id } as const;
  useSuggestionsShown(context, {
    loaded: ready && !isLoading && !error,
    listKey: `${keyOf(track)}|${scope}`,
    scope,
    compatibleKey,
    bpmWithinSixPercent,
    shownCount: layout.shown,
    hiddenByFilters: ranked.hiddenByFilters,
  });

  return (
    <Box as="section" aria-labelledby="suggestions-heading" mt={6}>
      <SectionHeading id="suggestions-heading">Suggestions</SectionHeading>
      <Text color="fg.muted" fontSize="sm" mb={3}>
        Tracks that could follow this one
      </Text>
      <Flex gap={2} wrap="wrap" align="center" mb={3}>
        <Button
          size="xs"
          aria-pressed={compatibleKey}
          variant={compatibleKey ? "solid" : "outline"}
          colorPalette="neutral"
          onClick={() => setCompatibleKey((value) => !value)}
        >
          Compatible key
        </Button>
        <Button
          size="xs"
          aria-pressed={bpmWithinSixPercent}
          variant={bpmWithinSixPercent ? "solid" : "outline"}
          colorPalette="neutral"
          onClick={() => setBpmWithinSixPercent((value) => !value)}
        >
          BPM ±6%
        </Button>
        <SuggestionScopeToggle value={scope} onChange={setScope} />
      </Flex>
      {!ready || isLoading ? (
        <Flex align="center" gap={3} py={4}>
          <Spinner size="sm" />
          <Text fontSize="sm">Loading suggestions...</Text>
        </Flex>
      ) : error ? (
        <Text color="fg.error" fontSize="sm">
          Could not load suggestions.
        </Text>
      ) : (
        <>
          <Text color="fg.muted" fontSize="12px" role="status" mb={2}>
            {layout.shown} of {layout.total}
            {ranked.hiddenByFilters > 0 ? ` · ${ranked.hiddenByFilters} hidden by filters` : ""}
          </Text>
          {layout.shown === 0 && (
            <Text color="fg.muted" fontSize="sm">
              {scope === "library"
                ? "No suggestions in this library. Try All libraries."
                : "No suggestions found."}
            </Text>
          )}
          {layout.items.length > 0 && (
            <SuggestionList>
              {layout.items.map((item) =>
                item.kind === "fold" ? (
                  <SuggestionFoldRow
                    key={`fold:${item.fold.key}`}
                    count={item.fold.tracks.length}
                    source={item.fold.release}
                    onExpand={() => {
                      setExpanded((keys) => [...keys, item.fold.key]);
                      trackSuggestionsExpanded(
                        context,
                        "fold",
                        layout.shown + item.fold.tracks.length,
                      );
                    }}
                  />
                ) : (
                  <SuggestionRow
                    key={keyOf(item.track)}
                    seed={track}
                    track={item.track}
                    added={added.includes(keyOf(item.track))}
                    menu
                    onAddedToPlaylist={() => setAdded((keys) => [...keys, keyOf(item.track)])}
                    onAction={(action) =>
                      trackSuggestionAction(context, { seed: track, item, action })
                    }
                  />
                ),
              )}
            </SuggestionList>
          )}
          {remaining > 0 && (
            <Button
              mt={4}
              w={{ base: "full", md: "auto" }}
              minH="44px"
              onClick={() => {
                setExtra((n) => n + PAGE_SIZE);
                trackSuggestionsExpanded(
                  context,
                  "show_more",
                  layout.shown + Math.min(PAGE_SIZE, remaining),
                );
              }}
            >
              Show {Math.min(PAGE_SIZE, remaining)} more
            </Button>
          )}
        </>
      )}
    </Box>
  );
}

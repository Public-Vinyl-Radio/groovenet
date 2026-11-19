"use client";

import { useState } from "react";
import { Box, Button, Flex, Spinner, Text, useBreakpointValue } from "@chakra-ui/react";
import { SectionHeading } from "@/components/ui/SectionHeading";
import SuggestionRow, { SuggestionFoldRow, SuggestionList } from "@/components/SuggestionRow";
import RankingProfilePicker from "@/components/RankingProfilePicker";
import SuggestionScopeToggle from "@/components/SuggestionScopeToggle";
import SuggestionSettingsDialog, {
  SuggestionSettingsButton,
  suggestionSettingsSummary,
} from "@/components/SuggestionSettingsDialog";
import { useRankingProfile } from "@/hooks/useRankingProfiles";
import { suggestionFilterLabels } from "@/lib/ranking/configs";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const ranking = useRankingProfile("related");
  const labels = suggestionFilterLabels(ranking.config);
  const ranked = rankSuggestions(data, {
    seed: track,
    surface: "related",
    config: ranking.config,
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
      {/* Phones keep Ranking and Libraries in a dialog off the heading row (#1231). */}
      <Flex align="center" justify="space-between" gap={2} mb={{ base: 1, md: 3 }}>
        <SectionHeading id="suggestions-heading">Suggestions</SectionHeading>
        {isMobile && <SuggestionSettingsButton onClick={() => setSettingsOpen(true)} />}
      </Flex>
      {(!isMobile || labels.compatibleKey || labels.bpmWithinSixPercent) && (
        <Flex gap={2} wrap="wrap" align="center" mb={3}>
          {labels.compatibleKey && (
            <Button
              size="xs"
              aria-pressed={compatibleKey}
              variant={compatibleKey ? "solid" : "outline"}
              colorPalette="neutral"
              onClick={() => setCompatibleKey((value) => !value)}
            >
              {labels.compatibleKey}
            </Button>
          )}
          {labels.bpmWithinSixPercent && (
            <Button
              size="xs"
              aria-pressed={bpmWithinSixPercent}
              variant={bpmWithinSixPercent ? "solid" : "outline"}
              colorPalette="neutral"
              onClick={() => setBpmWithinSixPercent((value) => !value)}
            >
              {labels.bpmWithinSixPercent}
            </Button>
          )}
          {!isMobile && (
            <RankingProfilePicker
              id="related"
              value={ranking.profile.id}
              options={ranking.options}
              onChange={ranking.choose}
            />
          )}
        </Flex>
      )}
      {/* The scope toggle sits at the right end of the summary line (#1214); on phones
          the line names both settings instead, so a choice in the dialog stays visible. */}
      <Flex align="center" gap={2} mb={2} minH="24px">
        {ready && !isLoading && !error && (
          <Text color="fg.muted" fontSize="12px" role="status" data-testid="suggestions-summary">
            {[
              `${layout.shown} of ${layout.total}`,
              ranked.hiddenByFilters > 0 && `${ranked.hiddenByFilters} hidden by filters`,
              isMobile && suggestionSettingsSummary({ rankingName: ranking.profile.name, scope }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        )}
        {!isMobile && <SuggestionScopeToggle value={scope} onChange={setScope} />}
      </Flex>
      {isMobile && (
        <SuggestionSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          id="related"
          ranking={{
            value: ranking.profile.id,
            options: ranking.options,
            onChange: ranking.choose,
          }}
          scope={{ value: scope, onChange: setScope }}
        />
      )}
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

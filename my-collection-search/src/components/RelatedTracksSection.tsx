"use client";

import { SectionHeading } from "@/components/ui/SectionHeading";
import { useMemo, useState } from "react";
import { Box, Button, Flex, Spinner, Text, useBreakpointValue } from "@chakra-ui/react";
import { LuChevronDown } from "react-icons/lu";
import { useQuery } from "@tanstack/react-query";
import type { Track } from "@/types/track";
import { RelatedTrackList, RelatedTrackTable } from "@/components/RelatedTrackRows";
import TrackActionsMenu from "@/components/TrackActionsMenu";
import { analytics } from "@/lib/analytics/client";
import { useRecommendationsQuery } from "@/hooks/useRecommendations";
import { useSimilarTracks } from "@/hooks/useSimilarTracks";
import { useSimilarVibeTracks } from "@/hooks/useSimilarVibeTracks";
import { useSuggestionScope } from "@/hooks/useSuggestionScope";
import SuggestionScopeToggle from "@/components/SuggestionScopeToggle";
import { fetchTracksByIds, type TrackBatchRef } from "@/services/internalApi/tracks";
import { blendSuggestionSources, rankSuggestions } from "@/lib/rankSuggestions";

type Props = {
  track: Track;
};

type SourceType = "ai" | "similar" | "vibe";
type MergedTrack = Track & { _sources: SourceType[]; _score: number; distance?: number };

function keyOf(track: Pick<Track, "track_id" | "friend_id">): string {
  return `${track.track_id}:${track.friend_id}`;
}

/** Rows added by each "Show more". */
const PAGE_SIZE = 20;

export default function RelatedTracksSection({ track }: Props) {
  // Phones start shorter: each row is taller than a table row.
  const isMobile = useBreakpointValue({ base: true, md: false }) ?? true;
  const initialCount = isMobile ? 5 : PAGE_SIZE;
  const [extra, setExtra] = useState(0);

  const suggestionScope = useSuggestionScope();
  const { scope, libraryFriendId, ready } = suggestionScope;

  const recQuery = useRecommendationsQuery([track], 60, { scope, libraryFriendId, enabled: ready });
  const similarQuery = useSimilarTracks({
    track_id: track.track_id,
    friend_id: track.friend_id,
    limit: 60,
    scope,
    library_friend_id: libraryFriendId,
    enabled: ready,
  });
  const vibeQuery = useSimilarVibeTracks({
    track_id: track.track_id,
    friend_id: track.friend_id,
    limit: 60,
    scope,
    library_friend_id: libraryFriendId,
    enabled: ready,
  });

  const ranked = useMemo(() => {
    const recs = recQuery.data ?? [];
    const similar = similarQuery.data?.tracks ?? [];
    const vibes = vibeQuery.data?.tracks ?? [];
    const blend = blendSuggestionSources<Track & { distance?: number }>([
      {
        name: "ai",
        tracks: recs,
        score: (_item, idx, count) => 0.8 * (1 - idx / Math.max(count, 1)),
      },
      {
        name: "similar",
        tracks: similar,
        score: (item, idx, count) =>
          Math.max(0, 1 - (item.distance ?? 1)) * 0.75 + (1 - idx / Math.max(count, 1)) * 0.25,
      },
      {
        name: "vibe",
        tracks: vibes,
        score: (item, idx, count) =>
          Math.max(0, 1 - (item.distance ?? 1)) * 0.75 + (1 - idx / Math.max(count, 1)) * 0.25,
      },
    ]);
    const result = rankSuggestions(blend, {
      seed: track,
      filters: { compatibleKey: true, bpmWithinSixPercent: true },
    });
    return {
      ...result,
      tracks: result.tracks.map((item) => ({
        ...item,
        _sources: ((item as Track & { _sources?: SourceType[] })._sources ?? []) as SourceType[],
        _score: (item as Track & { _score?: number })._score ?? 0,
      })),
    };
  }, [track, recQuery.data, similarQuery.data, vibeQuery.data]);
  const merged = ranked.tracks;

  const hydrateRefs = useMemo<TrackBatchRef[]>(
    () =>
      merged.map((t) => ({
        track_id: t.track_id,
        friend_id: t.friend_id,
      })),
    [merged],
  );

  const hydratedQuery = useQuery({
    queryKey: ["related-tracks-hydrated", hydrateRefs],
    queryFn: async () => {
      if (hydrateRefs.length === 0) return [] as Track[];
      return await fetchTracksByIds(hydrateRefs);
    },
    enabled: hydrateRefs.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const hydratedByKey = useMemo(() => {
    const map = new Map<string, Track>();
    for (const t of hydratedQuery.data ?? []) {
      map.set(keyOf(t), t);
    }
    return map;
  }, [hydratedQuery.data]);

  const resolved = useMemo<MergedTrack[]>(
    () =>
      merged.map((item) => {
        const hydrated = hydratedByKey.get(keyOf(item));
        if (!hydrated) return item;
        return {
          ...item,
          ...hydrated,
          _sources: item._sources,
          _score: item._score,
        };
      }),
    [merged, hydratedByKey],
  );

  const shownCount = initialCount + extra;
  const displayTracks = resolved.slice(0, shownCount);
  const remaining = resolved.length - displayTracks.length;
  // Disabled queries don't count as loading, so cover the wait for the saved scope too.
  const isLoading = !ready || recQuery.isLoading || similarQuery.isLoading || vibeQuery.isLoading;
  const hasError = recQuery.error || similarQuery.error || vibeQuery.error;

  const renderActions = (item: Track, index: number) => (
    <TrackActionsMenu
      track={item}
      onAction={(action) =>
        analytics.track("recommendation_acted_on", {
          track_id: item.track_id,
          action,
          rank: index + 1,
          sources: (item as MergedTrack)._sources,
        })
      }
    />
  );

  const rowProps = {
    base: track,
    tracks: displayTracks,
    // Only meaningful cross-library ("All libraries"): every row is the
    // browsed library's own otherwise, so the name is just repeated noise.
    showUsername: scope === "all",
    renderActions,
  };

  return (
    <Box as="section" aria-labelledby="related-tracks-heading" mt={6}>
      <Flex align="flex-end" justify="space-between" wrap="wrap" mb={3} gap={3}>
        <Box minW={0}>
          <Flex align="baseline" gap={2.5}>
            <SectionHeading id="related-tracks-heading">Related tracks</SectionHeading>
            {!isLoading && !hasError && merged.length > 0 && (
              <Text
                fontFamily="label"
                fontSize="11px"
                letterSpacing="0.08em"
                textTransform="uppercase"
                color="fg.muted"
              >
                {displayTracks.length} of {merged.length}
              </Text>
            )}
          </Flex>
        </Box>
        <Box flexShrink={0} w={{ base: "full", md: "auto" }} css={{ "& > div": { width: "100%" } }}>
          <SuggestionScopeToggle value={scope} onChange={suggestionScope.setScope} />
        </Box>
      </Flex>

      {isLoading ? (
        <Flex align="center" gap={3} py={4}>
          <Spinner size="sm" />
          <Text fontSize="sm">Loading related tracks...</Text>
        </Flex>
      ) : hasError ? (
        <Text color="fg.error" fontSize="sm">
          Could not load related tracks.
        </Text>
      ) : displayTracks.length === 0 ? (
        <>
          {ranked.hiddenByFilters > 0 && (
            <Text color="fg.muted" fontSize="sm" mb={2}>
              {ranked.hiddenByFilters} hidden by filters
            </Text>
          )}
          <Text color="fg.muted" fontSize="sm">
            {scope === "library"
              ? "No related tracks in this library. Try All libraries."
              : "No related tracks found."}
          </Text>
        </>
      ) : (
        <>
          {ranked.hiddenByFilters > 0 && (
            <Text color="fg.muted" fontSize="sm" mb={2}>
              {ranked.hiddenByFilters} hidden by filters
            </Text>
          )}
          {isMobile ? <RelatedTrackList {...rowProps} /> : <RelatedTrackTable {...rowProps} />}
          {ranked.folds.map((group) => (
            <details key={group.release}>
              <summary>
                +{group.tracks.length} more from {group.release}
              </summary>
              {group.tracks.map((item) => (
                <Text
                  key={`${item.track_id}:${item.friend_id}`}
                  color="fg.muted"
                  fontSize="sm"
                  pl={4}
                  py={1}
                >
                  {item.title} — {item.artist}
                </Text>
              ))}
            </details>
          ))}

          {remaining > 0 && (
            <Flex justify="center" mt={4}>
              <Button
                variant="outline"
                w={{ base: "full", md: "auto" }}
                minH={{ base: "44px", md: undefined }}
                onClick={() => setExtra((n) => n + PAGE_SIZE)}
              >
                <LuChevronDown />
                Show {Math.min(PAGE_SIZE, remaining)} more
              </Button>
            </Flex>
          )}
        </>
      )}
    </Box>
  );
}

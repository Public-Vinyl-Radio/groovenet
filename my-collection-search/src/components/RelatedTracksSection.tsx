"use client";

import { useMemo, useState } from "react";
import { Box, Button, Flex, Heading, Spinner, Text, useBreakpointValue } from "@chakra-ui/react";
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

type Props = {
  track: Track;
};

type SourceType = "ai" | "similar" | "vibe";

type MergedTrack = Track & {
  _sources: SourceType[];
  _score: number;
};

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

  const merged = useMemo<MergedTrack[]>(() => {
    const baseKey = keyOf(track);
    const map = new Map<string, MergedTrack>();

    const add = (item: Track, source: SourceType, score: number) => {
      const k = keyOf(item);
      if (k === baseKey) return;
      const existing = map.get(k);
      if (!existing) {
        map.set(k, {
          ...item,
          _sources: [source],
          _score: score,
        });
        return;
      }
      if (!existing._sources.includes(source)) {
        existing._sources.push(source);
      }
      existing._score += score;
    };

    const recs = recQuery.data ?? [];
    recs.forEach((item, idx) => {
      const rankScore = 1 - idx / Math.max(recs.length, 1);
      add(item, "ai", 0.8 * rankScore);
    });

    const similar = similarQuery.data?.tracks ?? [];
    similar.forEach((item: Track & { distance?: number }, idx: number) => {
      const distanceScore = Math.max(0, 1 - (item.distance ?? 1));
      const rankScore = 1 - idx / Math.max(similar.length, 1);
      add(item, "similar", distanceScore * 0.75 + rankScore * 0.25);
    });

    const vibes = vibeQuery.data?.tracks ?? [];
    vibes.forEach((item: Track & { distance?: number }, idx: number) => {
      const distanceScore = Math.max(0, 1 - (item.distance ?? 1));
      const rankScore = 1 - idx / Math.max(vibes.length, 1);
      add(item, "vibe", distanceScore * 0.75 + rankScore * 0.25);
    });

    return [...map.values()].sort((a, b) => b._score - a._score);
  }, [track, recQuery.data, similarQuery.data, vibeQuery.data]);

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
            <Heading as="h2" id="related-tracks-heading" size="lg">
              Related tracks
            </Heading>
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
        <Text color="fg.muted" fontSize="sm">
          {scope === "library"
            ? "No related tracks in this library. Try All libraries."
            : "No related tracks found."}
        </Text>
      ) : (
        <>
          {isMobile ? <RelatedTrackList {...rowProps} /> : <RelatedTrackTable {...rowProps} />}

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

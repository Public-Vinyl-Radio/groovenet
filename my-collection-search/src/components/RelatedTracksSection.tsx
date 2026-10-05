"use client";

import { useMemo, useState } from "react";
import { Badge, Box, Button, Flex, Heading, Spinner, Text, useBreakpointValue } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import type { Track } from "@/types/track";
import TrackResult from "@/components/TrackResult";
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

function normalizeArtwork(track: Track): Track {
  return {
    ...track,
    album_thumbnail:
      track.album_thumbnail ||
      track.audio_file_album_art_url ||
      "/images/placeholder-artwork.png",
  };
}

export default function RelatedTracksSection({ track }: Props) {
  const [expanded, setExpanded] = useState(false);
  const initialCount = useBreakpointValue({ base: 3, md: 20 }) ?? 3;

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
          ...normalizeArtwork(item),
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
    [merged]
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
          ...normalizeArtwork(hydrated),
          _sources: item._sources,
          _score: item._score,
        };
      }),
    [merged, hydratedByKey]
  );

  const displayTracks = expanded ? resolved.slice(0, 60) : resolved.slice(0, initialCount);
  // Disabled queries don't count as loading, so cover the wait for the saved scope too.
  const isLoading = !ready || recQuery.isLoading || similarQuery.isLoading || vibeQuery.isLoading;
  const hasError = recQuery.error || similarQuery.error || vibeQuery.error;

  return (
    <Box mt={4}>
      <Flex align="center" justify="space-between" mb={3} gap={2}>
        <Box>
          <Heading size="sm">Related Tracks</Heading>
          <Text fontSize="xs" color="fg.muted" display={{ base: "none", md: "block" }} mt={0.5}>
            Combined from AI recommendations, similar tracks, and similar vibes
          </Text>
        </Box>
        <Flex align="center" gap={3} flexShrink={0}>
          {!isLoading && !hasError && merged.length > 0 && (
            <Text fontSize="xs" color="fg.muted">
              {displayTracks.length} of {merged.length}
            </Text>
          )}
          <SuggestionScopeToggle value={scope} onChange={suggestionScope.setScope} />
        </Flex>
      </Flex>

      {isLoading ? (
        <Flex align="center" gap={3} py={4}>
          <Spinner size="sm" />
          <Text fontSize="sm">Loading related tracks...</Text>
        </Flex>
      ) : hasError ? (
        <Text color="red.500" fontSize="sm">Could not load related tracks.</Text>
      ) : displayTracks.length === 0 ? (
        <Text color="fg.muted" fontSize="sm">
          {scope === "library"
            ? "No related tracks in this library. Try All libraries."
            : "No related tracks found."}
        </Text>
      ) : (
        <>
          {displayTracks.map((item, index) => (
            <TrackResult
              key={`${item.track_id}-${item.friend_id}`}
              track={item}
              playlistMode={true}
              showUsername={true}
              showRating={true}
              buttons={
                <TrackActionsMenu
                  track={item}
                  onAction={(action) =>
                    analytics.track("recommendation_acted_on", {
                      track_id: item.track_id,
                      action,
                      rank: index + 1,
                      sources: item._sources,
                    })
                  }
                />
              }
              footer={
                <Flex gap={1} align="center">
                  {item._sources.includes("ai") && (
                    <Badge colorPalette="purple" size="sm">AI</Badge>
                  )}
                  {item._sources.includes("similar") && (
                    <Badge colorPalette="blue" size="sm">Similar</Badge>
                  )}
                  {item._sources.includes("vibe") && (
                    <Badge colorPalette="cyan" size="sm">Vibe</Badge>
                  )}
                </Flex>
              }
            />
          ))}

          {merged.length > initialCount && (
            <Button
              size="sm"
              variant="outline"
              mt={2}
              w="full"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? `Show fewer` : `Show all ${merged.length}`}
            </Button>
          )}
        </>
      )}
    </Box>
  );
}

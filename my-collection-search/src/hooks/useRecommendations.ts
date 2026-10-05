"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Track } from "@/types/track";
import { useUsername } from "@/providers/UsernameProvider";
import { fetchRecommendationCandidates } from "@/services/internalApi/recommendations";
import { fetchTracksByIds } from "@/services/internalApi/tracks";
import type { RecommendationScope } from "@/types/recommendations";

export type TrackWithEmbedding = Track;

export type RecommendedTrack = Track & {
  _simIdentity: number | null;
  _simAudio: number | null;
};

type Seed = { track_id: string; friend_id: number };

/** Which library candidates may come from. Omitted scope: the library's saved setting. */
export type RecommendationScopeOptions = {
  scope?: RecommendationScope;
  libraryFriendId?: number;
};

/**
 * A seed is looked up in its own library: a playlist can hold tracks from
 * several. The selected library only fills in for a track that has none.
 */
export function toSeeds(playlist: TrackWithEmbedding[], fallbackFriendId?: number): Seed[] {
  const seeds = playlist
    .map((track) => ({
      track_id: track.track_id,
      friend_id: track.friend_id ?? fallbackFriendId,
    }))
    .filter(
      (track): track is Seed =>
        typeof track.track_id === "string" && typeof track.friend_id === "number"
    );
  return Array.from(new Map(seeds.map((seed) => [`${seed.track_id}:${seed.friend_id}`, seed])).values());
}

async function fetchRecommendationsFromApi(
  seeds: Seed[],
  limit: number,
  scopeOptions: RecommendationScopeOptions = {}
): Promise<RecommendedTrack[]> {
  const payload = await fetchRecommendationCandidates({
    tracks: seeds,
    limit_identity: limit,
    limit_audio: limit,
    ...(scopeOptions.scope ? { scope: scopeOptions.scope } : {}),
    ...(scopeOptions.libraryFriendId !== undefined
      ? { library_friend_id: scopeOptions.libraryFriendId }
      : {}),
  });
  const candidates = payload.candidates ?? [];
  if (candidates.length === 0) return [];

  // Hydrate full track data (fixes album art and all missing fields)
  const refs = candidates.map((c) => ({ track_id: c.trackId, friend_id: c.friendId }));
  const hydrated = await fetchTracksByIds(refs);

  const hydratedMap = new Map(
    hydrated.map((t) => [`${t.track_id}:${t.friend_id}`, t])
  );

  return candidates
    .map((candidate): RecommendedTrack | null => {
      const full = hydratedMap.get(`${candidate.trackId}:${candidate.friendId}`);
      if (!full) return null;
      return {
        ...full,
        _simIdentity: candidate.simIdentity ?? null,
        _simAudio: candidate.simAudio ?? null,
      };
    })
    .filter((t): t is RecommendedTrack => t !== null);
}

export function useRecommendations() {
  const { friend: selectedFriend } = useUsername();

  const getRecommendations = useCallback(
    async (k: number = 25, playlist: TrackWithEmbedding[] = []): Promise<RecommendedTrack[]> => {
      const seeds = toSeeds(playlist, selectedFriend?.id);
      if (seeds.length === 0) return [];
      try {
        // No explicit scope: the selected library's saved setting applies.
        return await fetchRecommendationsFromApi(seeds, k, { libraryFriendId: selectedFriend?.id });
      } catch (err) {
        console.error("Error fetching recommendations:", err);
        return [];
      }
    },
    [selectedFriend]
  );

  return getRecommendations;
}

export function useRecommendationsQuery(
  playlist: TrackWithEmbedding[] = [],
  limit: number = 50,
  scopeOptions: RecommendationScopeOptions & { enabled?: boolean } = {}
) {
  const { friend: selectedFriend } = useUsername();
  const dedupedSeeds = toSeeds(playlist, selectedFriend?.id);
  const seedKey = dedupedSeeds.map((seed) => `${seed.track_id}:${seed.friend_id}`).sort();
  const { scope, libraryFriendId = selectedFriend?.id, enabled = true } = scopeOptions;

  return useQuery({
    queryKey: ["recommendations", { seeds: seedKey, limit, scope, libraryFriendId }],
    queryFn: async (): Promise<RecommendedTrack[]> => {
      if (dedupedSeeds.length === 0) return [];
      try {
        return await fetchRecommendationsFromApi(dedupedSeeds, limit, { scope, libraryFriendId });
      } catch (err) {
        console.error("Error fetching recommendations:", err);
        return [];
      }
    },
    enabled: enabled && dedupedSeeds.length > 0,
    staleTime: 1000 * 60 * 5,
  });
}

export default useRecommendations;

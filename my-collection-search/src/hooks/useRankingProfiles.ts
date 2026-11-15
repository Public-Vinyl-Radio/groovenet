"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  RankingProfileDraftInput,
  RankingProfilesResponse,
  RankingSurface,
} from "@groovenet/contracts";
import { queryKeys } from "@/lib/queryKeys";
import { resolveProfile, PRESET_LIST, DEFAULT_ACTIVE_PROFILES } from "@/lib/ranking/profiles";
import { useUsername } from "@/providers/UsernameProvider";
import {
  copyRankingProfile,
  createRankingProfile,
  deleteRankingProfile,
  fetchRankingProfiles,
  setActiveRankingProfile,
  updateRankingProfile,
} from "@/services/internalApi/ranking";

/** Until the library's profiles load (or with no library), the presets with Default active. */
const PLACEHOLDER = (friendId: number): RankingProfilesResponse => ({
  friend_id: friendId,
  profiles: PRESET_LIST,
  active: DEFAULT_ACTIVE_PROFILES,
});

export function useRankingProfilesQuery() {
  const { friend } = useUsername();
  const friendId = friend?.id ?? 0;
  const query = useQuery({
    queryKey: queryKeys.rankingProfiles(friendId),
    queryFn: () => fetchRankingProfiles(friendId),
    enabled: friendId > 0,
    staleTime: 5 * 60 * 1000,
  });
  return { ...query, friendId, data: query.data ?? PLACEHOLDER(friendId) };
}

/**
 * The profile a surface ranks with, and the profiles it can switch to. Never
 * waits: before the list loads, or if it fails, it ranks with Default, so the
 * panels' filters stay instant (#1191).
 */
export function useRankingProfile(surface: RankingSurface) {
  const { data, friendId } = useRankingProfilesQuery();
  const choose = useSetActiveRankingProfile();
  const resolved = resolveProfile(data.active[surface], data.profiles, surface);
  return {
    ...resolved,
    friendId,
    options: data.profiles.filter((p) => p.surfaces.includes(surface) && !p.invalid),
    choose: (profileId: string) =>
      friendId > 0 &&
      choose.mutate({ friend_id: friendId, profile_id: profileId, surfaces: [surface] }),
  };
}

export function useSetActiveRankingProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setActiveRankingProfile,
    // Optimistic: the list re-ranks the moment a profile is picked.
    onMutate: async (body) => {
      const key = queryKeys.rankingProfiles(body.friend_id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<RankingProfilesResponse>(key);
      if (previous) {
        const active = { ...previous.active };
        for (const surface of body.surfaces ?? []) active[surface] = body.profile_id;
        queryClient.setQueryData(key, { ...previous, active });
      }
      return { previous, key };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous);
    },
    onSuccess: (result) => {
      const key = queryKeys.rankingProfiles(result.friend_id);
      const current = queryClient.getQueryData<RankingProfilesResponse>(key);
      if (current) queryClient.setQueryData(key, { ...current, active: result.active });
    },
  });
}

/** Create, copy, save and delete, each refreshing the library's list. */
export function useRankingProfileMutations(friendId: number) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.rankingProfiles(friendId) });
  return {
    copy: useMutation({
      mutationFn: (id: string) => copyRankingProfile(id, friendId),
      onSuccess: refresh,
    }),
    create: useMutation({
      mutationFn: (profile: RankingProfileDraftInput) => createRankingProfile(friendId, profile),
      onSuccess: refresh,
    }),
    save: useMutation({
      mutationFn: ({ id, profile }: { id: string; profile: RankingProfileDraftInput }) =>
        updateRankingProfile(id, profile),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: deleteRankingProfile, onSuccess: refresh }),
  };
}

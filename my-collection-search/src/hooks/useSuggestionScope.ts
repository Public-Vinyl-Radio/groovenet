"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useUsername } from "@/providers/UsernameProvider";
import {
  fetchRecommendationSettings,
  updateRecommendationSettings,
  type RecommendationSettingsResponse,
} from "@/services/internalApi/settings";
import { DEFAULT_RECOMMENDATION_SCOPE, type RecommendationScope } from "@/types/recommendations";

/** The selected library's saved suggestion scope. */
export function useRecommendationSettingsQuery(friendId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.recommendationSettings(friendId ?? 0),
    queryFn: () => fetchRecommendationSettings(friendId as number),
    enabled: typeof friendId === "number" && friendId > 0,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateRecommendationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { friend_id: number; scope: RecommendationScope }) =>
      updateRecommendationSettings(body),
    onSuccess: (saved: RecommendationSettingsResponse) => {
      queryClient.setQueryData(queryKeys.recommendationSettings(saved.friend_id), saved);
    },
  });
}

/**
 * Where a suggestions view looks: the library's saved setting, unless this
 * view has been flipped with its toggle. The flip is per view and is dropped
 * when the selected library changes, so it never outlives the library it was
 * made for. `ready` is false until the setting has loaded, so a view doesn't
 * fetch once with the default and again with the real scope.
 */
export function useSuggestionScope() {
  const { friend } = useUsername();
  const libraryFriendId = friend?.id;
  const settings = useRecommendationSettingsQuery(libraryFriendId);
  const [override, setOverride] = useState<{ friendId: number | undefined; scope: RecommendationScope } | null>(null);

  const savedScope = settings.data?.scope ?? DEFAULT_RECOMMENDATION_SCOPE;
  const activeOverride = override && override.friendId === libraryFriendId ? override.scope : null;

  return {
    scope: activeOverride ?? savedScope,
    savedScope,
    libraryFriendId,
    setScope: (scope: RecommendationScope) => setOverride({ friendId: libraryFriendId, scope }),
    ready: libraryFriendId === undefined || !settings.isPending,
  };
}

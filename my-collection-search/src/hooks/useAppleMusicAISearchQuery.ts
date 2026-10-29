"use client";

import { useQuery } from "@tanstack/react-query";

import {
  fetchAppleMusicAISearch,
  type AppleMusicAISearchArgs,
  type AppleMusicAISearchResponse,
} from "@/services/aiService";
import { queryKeys } from "@/lib/queryKeys";

export function useAppleMusicAISearchQuery(args: AppleMusicAISearchArgs, enabled: boolean) {
  return useQuery<AppleMusicAISearchResponse, Error>({
    queryKey: queryKeys.appleAISearchKey(args),
    queryFn: async () => fetchAppleMusicAISearch(args),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import {
  fetchEmbeddingQueueStatus,
  retryFailedEmbeddingJobs,
} from "@/services/internalApi/embeddingQueue";

export function useEmbeddingQueueQuery(options?: {
  enabled?: boolean;
  refetchInterval?: number | false;
}) {
  return useQuery({
    queryKey: queryKeys.embeddingQueue(),
    queryFn: fetchEmbeddingQueueStatus,
    refetchInterval: options?.refetchInterval ?? 15000,
    enabled: options?.enabled ?? true,
  });
}

export function useRetryFailedEmbeddingJobsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: retryFailedEmbeddingJobs,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.embeddingQueue() });
    },
  });
}

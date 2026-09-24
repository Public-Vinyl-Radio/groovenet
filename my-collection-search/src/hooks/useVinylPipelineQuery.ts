"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import {
  getIngestPipelineStats,
  getIngestRetentionStatus,
  listRecentDetections,
  type DetectionsRecentParams,
  type IngestPipelineStatsParams,
} from "@/services/internalApi/vinylPipeline";

/**
 * Is the vinyl pipeline working — index, queue, match rate, spin backlog (#299).
 *
 * Polls slower than the detections timeline: these numbers summarise a
 * window rather than the moment, so there is little to gain from refreshing
 * them every few seconds.
 */
export function useIngestStatsQuery(
  params: IngestPipelineStatsParams,
  options?: { enabled?: boolean; refetchInterval?: number | false }
) {
  return useQuery({
    queryKey: queryKeys.ingestStats(params),
    queryFn: () => getIngestPipelineStats(params),
    refetchInterval: options?.refetchInterval ?? 15000,
    enabled: options?.enabled ?? true,
  });
}

/**
 * Recent matcher windows — the thing you watch while a record plays (#299).
 *
 * Polls faster than the summary stats by default: this is the live timeline.
 */
export function useRecentDetectionsQuery(
  params: DetectionsRecentParams,
  options?: { enabled?: boolean; refetchInterval?: number | false }
) {
  return useQuery({
    queryKey: queryKeys.recentDetections(params),
    queryFn: () => listRecentDetections(params),
    refetchInterval: options?.refetchInterval ?? 5000,
    enabled: options?.enabled ?? true,
  });
}

/** Ingest volume usage — files on disk, oldest sweepable, last sweep (#269). */
export function useIngestRetentionQuery(options?: {
  enabled?: boolean;
  refetchInterval?: number | false;
}) {
  return useQuery({
    queryKey: queryKeys.ingestRetention(),
    queryFn: () => getIngestRetentionStatus(),
    refetchInterval: options?.refetchInterval ?? 15000,
    enabled: options?.enabled ?? true,
  });
}

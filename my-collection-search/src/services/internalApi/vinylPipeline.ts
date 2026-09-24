import { z } from "zod";
import {
  detectionsRecentResponseSchema,
  ingestPipelineStatsSchema,
  ingestRecentResponseSchema,
  ingestRetentionStatusSchema,
} from "@/api-contract/schemas";
import { http } from "@/services/http";

export type IngestRecentParams = {
  source_id?: string;
  session_id?: string;
  status?: "received" | "processing" | "processed" | "failed";
  limit?: number;
  offset?: number;
};
export type IngestRecentResponse = z.infer<typeof ingestRecentResponseSchema>;

export type IngestPipelineStatsParams = {
  minutes?: number;
  source_id?: string;
};
export type IngestPipelineStats = z.infer<typeof ingestPipelineStatsSchema>;

export type DetectionsRecentParams = {
  source_id?: string;
  session_id?: string;
  matched?: boolean;
  since?: string;
  limit?: number;
  offset?: number;
};
export type DetectionsRecentResponse = z.infer<typeof detectionsRecentResponseSchema>;

export type IngestRetentionStatus = z.infer<typeof ingestRetentionStatusSchema>;

/** Recent audio chunks and what became of them — is the listener reaching us at all? (#299) */
export async function listRecentIngests(
  params: IngestRecentParams = {}
): Promise<IngestRecentResponse> {
  const searchParams = new URLSearchParams();
  if (params.source_id) searchParams.append("source_id", params.source_id);
  if (params.session_id) searchParams.append("session_id", params.session_id);
  if (params.status) searchParams.append("status", params.status);
  if (typeof params.limit === "number") searchParams.append("limit", String(params.limit));
  if (typeof params.offset === "number") searchParams.append("offset", String(params.offset));

  return await http<IngestRecentResponse>(
    `/api/audio/ingest/recent?${searchParams.toString()}`,
    { method: "GET", cache: "no-store" }
  );
}

/** Whether the pipeline is working at all — index, queue, match rate, spin backlog (#299, #304). */
export async function getIngestPipelineStats(
  params: IngestPipelineStatsParams = {}
): Promise<IngestPipelineStats> {
  const searchParams = new URLSearchParams();
  if (typeof params.minutes === "number") searchParams.append("minutes", String(params.minutes));
  if (params.source_id) searchParams.append("source_id", params.source_id);

  return await http<IngestPipelineStats>(
    `/api/audio/ingest/stats?${searchParams.toString()}`,
    { method: "GET", cache: "no-store" }
  );
}

/** Recent matcher windows, including no-match ones — the thing you watch while a record plays (#299). */
export async function listRecentDetections(
  params: DetectionsRecentParams = {}
): Promise<DetectionsRecentResponse> {
  const searchParams = new URLSearchParams();
  if (params.source_id) searchParams.append("source_id", params.source_id);
  if (params.session_id) searchParams.append("session_id", params.session_id);
  if (params.matched !== undefined) searchParams.append("matched", String(params.matched));
  if (params.since) searchParams.append("since", params.since);
  if (typeof params.limit === "number") searchParams.append("limit", String(params.limit));
  if (typeof params.offset === "number") searchParams.append("offset", String(params.offset));

  return await http<DetectionsRecentResponse>(
    `/api/detections/recent?${searchParams.toString()}`,
    { method: "GET", cache: "no-store" }
  );
}

/** Ingest volume usage and what the next sweep would delete (#269). */
export async function getIngestRetentionStatus(): Promise<IngestRetentionStatus> {
  return await http<IngestRetentionStatus>("/api/audio/ingest/retention", {
    method: "GET",
    cache: "no-store",
  });
}

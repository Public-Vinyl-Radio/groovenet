import { z } from "zod";
import {
  spinCreateBodySchema,
  spinCreateResponseSchema,
  spinDeleteResponseSchema,
  spinListQuerySchema,
  spinListResponseSchema,
  spinRecapResponseSchema,
  spinTrackStatsResponseSchema,
  spinTopTracksQuerySchema,
  spinTopTracksResponseSchema,
  spinUpdateBodySchema,
  spinUpdateResponseSchema,
} from "@/api-contract/schemas";
import { http } from "@/services/http";

export type SpinCreateParams = z.infer<typeof spinCreateBodySchema>;
export type SpinCreateResponse = z.infer<typeof spinCreateResponseSchema>;
export type SpinListParams = z.infer<typeof spinListQuerySchema>;
export type SpinListResponse = z.infer<typeof spinListResponseSchema>;
export type SpinTopTracksParams = z.infer<typeof spinTopTracksQuerySchema>;
export type SpinTopTracksResponse = z.infer<typeof spinTopTracksResponseSchema>;
export type SpinDeleteResponse = z.infer<typeof spinDeleteResponseSchema>;
export type SpinUpdateParams = z.infer<typeof spinUpdateBodySchema>;
export type SpinUpdateResponse = z.infer<typeof spinUpdateResponseSchema>;
export type SpinRecapParams = { friend_id: number; month: string };
export type SpinRecapResponse = z.infer<typeof spinRecapResponseSchema>;
export type SpinTrackStatsParams = { friend_id: number; track_id: string };
export type SpinTrackStatsResponse = z.infer<typeof spinTrackStatsResponseSchema>;

export async function listSpins(params: SpinListParams): Promise<SpinListResponse> {
  const searchParams = new URLSearchParams();
  searchParams.append("friend_id", String(params.friend_id));
  if (params.release_id) searchParams.append("release_id", params.release_id);
  if (params.track_id) searchParams.append("track_id", params.track_id);
  if (params.from) searchParams.append("from", params.from);
  if (params.to) searchParams.append("to", params.to);
  if (typeof params.limit === "number") searchParams.append("limit", String(params.limit));
  if (typeof params.offset === "number") searchParams.append("offset", String(params.offset));
  if (params.medium) searchParams.append("medium", params.medium);
  if (params.cursor) searchParams.append("cursor", params.cursor);

  return await http<SpinListResponse>(`/api/spins?${searchParams.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function createSpin(params: SpinCreateParams): Promise<SpinCreateResponse> {
  return await http<SpinCreateResponse>("/api/spins", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

export async function listTopSpinTracks(
  params: SpinTopTracksParams,
): Promise<SpinTopTracksResponse> {
  const searchParams = new URLSearchParams();
  searchParams.append("friend_id", String(params.friend_id));
  if (params.release_id) searchParams.append("release_id", params.release_id);
  if (typeof params.limit === "number") searchParams.append("limit", String(params.limit));
  if (typeof params.offset === "number") searchParams.append("offset", String(params.offset));

  return await http<SpinTopTracksResponse>(`/api/spins/top-tracks?${searchParams.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
}

/** The monthly listening recap; `month` is "YYYY-MM" in the configured zone. */
export async function getSpinRecap(params: SpinRecapParams): Promise<SpinRecapResponse> {
  const searchParams = new URLSearchParams({
    friend_id: String(params.friend_id),
    month: params.month,
  });
  return await http<SpinRecapResponse>(`/api/spins/recap?${searchParams.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
}

/** How often one track has been spun, across both media. */
export async function getSpinTrackStats(
  params: SpinTrackStatsParams,
): Promise<SpinTrackStatsResponse> {
  const searchParams = new URLSearchParams({
    friend_id: String(params.friend_id),
    track_id: params.track_id,
  });
  return await http<SpinTrackStatsResponse>(`/api/spins/track-stats?${searchParams.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function updateSpin(
  id: number,
  params: SpinUpdateParams,
): Promise<SpinUpdateResponse> {
  return await http<SpinUpdateResponse>(`/api/spins/${encodeURIComponent(String(id))}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

export async function deleteSpin(id: number, friendId: number): Promise<SpinDeleteResponse> {
  return await http<SpinDeleteResponse>(
    `/api/spins/${encodeURIComponent(String(id))}?friend_id=${friendId}`,
    {
      method: "DELETE",
    },
  );
}

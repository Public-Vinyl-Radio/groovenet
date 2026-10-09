import { z } from "zod";
import {
  albumAppleMusicArtPreviewSchema,
  albumArtworkApplyBodySchema,
  albumArtworkBackfillBodySchema,
  albumArtworkBackfillResponseSchema,
  albumArtworkReviewResponseSchema,
  albumArtworkStateSchema,
} from "@/api-contract/schemas";
import { http } from "@/services/http";

export type AlbumArtworkState = z.infer<typeof albumArtworkStateSchema>;
export type AlbumAppleMusicArtPreview = z.infer<typeof albumAppleMusicArtPreviewSchema>;
export type AlbumArtworkApplySource = z.input<typeof albumArtworkApplyBodySchema>["source"];
export type AlbumArtworkBackfillParams = z.input<typeof albumArtworkBackfillBodySchema>;
export type AlbumArtworkBackfillResponse = z.infer<typeof albumArtworkBackfillResponseSchema>;
export type AlbumArtworkReviewResponse = z.infer<typeof albumArtworkReviewResponseSchema>;
export type AlbumArtworkReviewItem = AlbumArtworkReviewResponse["albums"][number];

function artworkPath(releaseId: string, friendId: number, suffix = ""): string {
  return `/api/albums/${encodeURIComponent(releaseId)}/artwork${suffix}?friend_id=${friendId}`;
}

export async function fetchAlbumArtwork(
  releaseId: string,
  friendId: number
): Promise<AlbumArtworkState> {
  return await http<AlbumArtworkState>(artworkPath(releaseId, friendId), {
    method: "GET",
    cache: "no-store",
  });
}

export async function previewAppleMusicArtwork(
  releaseId: string,
  friendId: number
): Promise<AlbumAppleMusicArtPreview> {
  return await http<AlbumAppleMusicArtPreview>(artworkPath(releaseId, friendId, "/preview"), {
    method: "POST",
  });
}

export async function applyAlbumArtwork(
  releaseId: string,
  friendId: number,
  source: AlbumArtworkApplySource
): Promise<AlbumArtworkState> {
  return await http<AlbumArtworkState>(artworkPath(releaseId, friendId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  });
}

export async function uploadAlbumArtwork(
  releaseId: string,
  friendId: number,
  file: File
): Promise<AlbumArtworkState> {
  const formData = new FormData();
  formData.append("cover_art", file);
  return await http<AlbumArtworkState>(artworkPath(releaseId, friendId, "/upload"), {
    method: "POST",
    body: formData,
  });
}

export async function queueAlbumArtworkBackfill(
  params: AlbumArtworkBackfillParams = {}
): Promise<AlbumArtworkBackfillResponse> {
  return await http<AlbumArtworkBackfillResponse>("/api/albums/artwork/backfill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

export async function fetchAlbumArtworkReview(
  friendId?: number
): Promise<AlbumArtworkReviewResponse> {
  const query = friendId ? `?friend_id=${friendId}` : "";
  return await http<AlbumArtworkReviewResponse>(`/api/albums/artwork/review${query}`, {
    method: "GET",
    cache: "no-store",
  });
}

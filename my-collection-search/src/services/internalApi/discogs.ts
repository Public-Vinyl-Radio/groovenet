import { z } from "zod";
import { discogsLookupQuerySchema, discogsLookupResponseSchema } from "@/api-contract/schemas";
import type { DiscogsLookupRelease, DiscogsLookupVideo } from "@/types/discogs";
import { http, streamLines } from "../http";

export type SyncResult = {
  message?: string;
  newReleases: string[];
  alreadyHave: string[];
  total?: number;
  totalCollection?: number;
  newCount?: number;
  errors?: { releaseId: string; error: string }[];
};
export type VerificationResult = {
  username: string;
  totalReleaseIds: number;
  missingFiles: string[];
  validFiles: string[];
};

export type ManifestVerificationResponse = {
  message: string;
  results: VerificationResult[];
  summary: {
    totalManifests: number;
    totalMissingFiles: number;
    totalValidFiles: number;
  };
};

export type ManifestCleanupResponse = {
  message: string;
  results: {
    username: string;
    before: number;
    after: number;
    removed: string[];
  }[];
  summary: {
    totalManifests: number;
    totalRemoved: number;
    totalKept: number;
  };
};

export type DeleteReleasesResponse = {
  message: string;
  deletedFiles: string[];
  failedDeletes: string[];
  deletedTrackIds: string[];
  deletedFromDb: number;
};

export type DiscogsLookupQuery = z.input<typeof discogsLookupQuerySchema>;
export type DiscogsLookupResponse = z.infer<typeof discogsLookupResponseSchema>;

export function verifyManifests() {
  return http<ManifestVerificationResponse>("/api/discogs/verify-manifests", {
    method: "GET",
  });
}

export function cleanupManifests() {
  return http<ManifestCleanupResponse>("/api/discogs/verify-manifests", {
    method: "POST",
  });
}

export function deleteReleases(username: string, releaseIds: string[]) {
  return http<DeleteReleasesResponse>("/api/discogs/delete-releases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, releaseIds }),
  });
}

export async function syncDiscogsStream(
  username: string | undefined,
  onLine: (line: string) => void,
) {
  const url = username ? `/api/discogs?username=${encodeURIComponent(username)}` : "/api/discogs";
  await streamLines(url, { method: "GET" }, onLine);
}

export async function lookupDiscogsRelease(
  query: DiscogsLookupQuery,
): Promise<DiscogsLookupResponse> {
  const params = new URLSearchParams();
  params.set("track_id", query.track_id);
  if (query.username) params.set("username", query.username);
  if (typeof query.friend_id === "number") {
    params.set("friend_id", String(query.friend_id));
  }
  return await http<DiscogsLookupResponse>(
    `/api/providers/discogs/release-lookup?${params.toString()}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );
}

export async function lookupDiscogsVideos(trackId: string): Promise<DiscogsLookupResponse | null> {
  try {
    return await lookupDiscogsRelease({ track_id: trackId });
  } catch (error) {
    console.error("Discogs lookup error:", error);
    return null;
  }
}

export function extractDiscogsVideos(result: DiscogsLookupResponse | null): DiscogsLookupVideo[] {
  if (!result?.release) return [];

  const rel = result.release as DiscogsLookupRelease;
  const vids: DiscogsLookupVideo[] = (rel.videos ?? rel.video ?? []) as DiscogsLookupVideo[];

  return vids || [];
}

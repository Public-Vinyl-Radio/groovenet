import type {
  RankingActiveResponse,
  RankingActiveUpdate,
  RankingConfig,
  RankingProfile,
  RankingProfileDeleteResponse,
  RankingProfileDraftInput,
  RankingProfilesResponse,
} from "@groovenet/contracts";
import { http } from "@/services/http";
import {
  fetchRecommendationCandidates,
  type RecommendationCandidatesResponse,
} from "./recommendations";

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const profileUrl = (id: string) => `/api/ranking/profiles/${encodeURIComponent(id)}`;

export function fetchRankingProfiles(friendId: number): Promise<RankingProfilesResponse> {
  return http(`/api/ranking/profiles?friend_id=${friendId}`, { cache: "no-store" });
}

export function createRankingProfile(
  friendId: number,
  profile: RankingProfileDraftInput,
): Promise<RankingProfile> {
  return http("/api/ranking/profiles", json("POST", { friend_id: friendId, profile }));
}

export function copyRankingProfile(id: string, friendId: number): Promise<RankingProfile> {
  return http(`${profileUrl(id)}/copy`, json("POST", { friend_id: friendId }));
}

export function updateRankingProfile(
  id: string,
  profile: RankingProfileDraftInput,
): Promise<RankingProfile> {
  return http(profileUrl(id), json("PUT", { profile }));
}

export function deleteRankingProfile(id: string): Promise<RankingProfileDeleteResponse> {
  return http(profileUrl(id), { method: "DELETE" });
}

export function setActiveRankingProfile(body: RankingActiveUpdate): Promise<RankingActiveResponse> {
  return http("/api/ranking/active", json("PUT", body));
}

/** One seed's candidates scored with a whole (possibly unsaved) config, for the editor's preview. */
export function fetchRankingPreview(
  seed: { track_id: string; friend_id: number },
  config: RankingConfig,
  limit = 30,
): Promise<RecommendationCandidatesResponse> {
  return fetchRecommendationCandidates({
    tracks: [seed],
    limit_identity: limit,
    limit_audio: limit,
    breakdown: true,
    ranking_config: config,
  });
}

import { http } from "./http";
import type { YoutubeVideo } from "@/types/track";
import type { AppleMusicResult } from "@/types/apple";

export type YouTubeMusicSearchArgs = {
  title?: string;
  artist?: string;
};

export type YouTubeMusicSearchResponse = {
  results: YoutubeVideo[];
  [k: string]: unknown;
};

export async function fetchYouTubeMusicSearch(
  args: YouTubeMusicSearchArgs,
): Promise<YouTubeMusicSearchResponse> {
  return await http<YouTubeMusicSearchResponse>("/api/providers/youtube/music-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
}

export type AppleMusicAISearchArgs = {
  title?: string;
  artist?: string;
  album?: string;
  isrc?: string;
};

export type AppleMusicAISearchResponse = {
  results: AppleMusicResult[];
  [k: string]: unknown;
};

export async function fetchAppleMusicAISearch(
  args: AppleMusicAISearchArgs,
): Promise<AppleMusicAISearchResponse> {
  return await http<AppleMusicAISearchResponse>("/api/providers/apple-music/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
}

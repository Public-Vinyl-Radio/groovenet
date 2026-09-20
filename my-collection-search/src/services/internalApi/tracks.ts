import { z } from "zod";
import {
  similarVibeQuerySchema,
  similarIdentityQuerySchema,
  trackPlaylistCountsBodySchema,
  trackPlaylistCountsResponseSchema,
  trackSearchGetQuerySchema,
  trackSearchGetResponseSchema,
  recommendationsResponseSchema,
  audioVibeEmbeddingDataSchema,
  audioVibeEmbeddingPreviewResponseSchema,
  embeddingAudioVibePreviewApiResponseSchema,
  embeddingIdentityPreviewApiResponseSchema,
  embeddingPreviewResponseSchema,
  identityEmbeddingDataSchema,
  identityEmbeddingPreviewResponseSchema,
  trackAudioMetadataResponseSchema,
  trackEmbeddingPreviewResponseSchema,
  trackEssentiaResponseSchema,
  trackExtractEmbeddedCoverResponseSchema,
  trackPlaylistsResponseSchema,
  trackPlaylistMembershipSchema,
} from "@/api-contract/schemas";
import { http } from "@/services/http";
import type { Track } from "@/types/track";
import type { TrackEditFormProps } from "@/components/track-edit/types";

export type TrackPlaylistMembership = z.infer<typeof trackPlaylistMembershipSchema>;
type TrackPlaylistsApiResponse = z.infer<typeof trackPlaylistsResponseSchema>;
export type TrackAudioMetadataResponse = z.infer<typeof trackAudioMetadataResponseSchema>;
export type TrackExtractEmbeddedCoverResponse = z.infer<
  typeof trackExtractEmbeddedCoverResponseSchema
>;
export type TrackEssentiaResponse = z.infer<typeof trackEssentiaResponseSchema>;
export type TrackEmbeddingPreviewResponse = z.infer<
  typeof trackEmbeddingPreviewResponseSchema
>;
type EmbeddingPreviewResponse = z.infer<typeof embeddingPreviewResponseSchema>;

export type IdentityEmbeddingData = z.infer<typeof identityEmbeddingDataSchema>;
export type IdentityEmbeddingPreviewResponse = z.infer<
  typeof identityEmbeddingPreviewResponseSchema
>;
export type AudioVibeEmbeddingData = z.infer<typeof audioVibeEmbeddingDataSchema>;
export type AudioVibeEmbeddingPreviewResponse = z.infer<
  typeof audioVibeEmbeddingPreviewResponseSchema
>;

export type TrackBatchRef = {
  friend_id: number;
  track_id: string;
};
export type FetchTracksByIdsOptions = {
  includeVectors?: boolean;
};
export type TrackPlaylistCountRef = z.input<typeof trackPlaylistCountsBodySchema>["track_refs"][number];
export type TrackPlaylistCountsResponse = z.infer<
  typeof trackPlaylistCountsResponseSchema
>;
export type SimilarTracksOptions = z.input<typeof similarIdentityQuerySchema>;
export type SimilarTrack = Track & {
  distance: number;
  identity_text: string;
  /** Always set by the mapper below, from metadata.tags. */
  local_tags: string;
};
export type SimilarTracksResponse = {
  source_track_id: string;
  source_friend_id: number;
  filters: {
    era?: string;
    country?: string;
    tags?: string[];
  };
  count: number;
  tracks: SimilarTrack[];
};
export type SimilarVibeTracksOptions = z.input<typeof similarVibeQuerySchema>;
export type SimilarVibeTrack = Track & {
  distance: number;
  identity_text: string;
};
export type SimilarVibeTracksResponse = {
  source_track_id: string;
  source_friend_id: number;
  count: number;
  tracks: SimilarVibeTrack[];
};
type RecommendationCandidate =
  z.infer<typeof recommendationsResponseSchema>["candidates"][number];

export type TrackSearchQuery = z.input<typeof trackSearchGetQuerySchema>;
type TrackSearchApiResponse = z.infer<typeof trackSearchGetResponseSchema>;
export type TrackSearchResponse = Omit<TrackSearchApiResponse, "hits"> & {
  hits: Track[];
};
export type AnalyzeArgs = {
  track_id: string;
  friend_id: number;
  apple_music_url?: string | null;
  youtube_url?: string | null;
  soundcloud_url?: string | null;
};
export type AnalyzeResponse = {
  rhythm?: { bpm?: number; danceability?: number };
  tonal?: { key_edma?: { key?: string; scale?: string } };
  metadata?: { audio_properties?: { length: number } };
  [k: string]: unknown;
};
export type AsyncAnalyzeResponse = {
  success: boolean;
  jobId: string;
  message: string;
};
export type UploadTrackAudioArgs = {
  file: File;
  track_id: string;
};
export type UploadTrackAudioResponse = {
  analysis: AnalyzeResponse;
  [k: string]: unknown;
};
export type TrackMetadataArgs = { prompt: string; friend_id?: number };
export type TrackMetadataResponse = { genre?: string; notes?: string } & Record<
  string,
  unknown
>;

export async function fetchTracksByIds(
  tracks: TrackBatchRef[],
  options: FetchTracksByIdsOptions = {}
): Promise<Track[]> {
  if (!tracks || tracks.length === 0) return [];
  return await http<Track[]>("/api/tracks/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tracks,
      ...(options.includeVectors ? { include_vectors: true } : {}),
    }),
  });
}

export async function saveTrack(data: TrackEditFormProps): Promise<Track> {
  return await http<Track>("/api/tracks", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function analyzeTrackAsync(
  args: AnalyzeArgs & { title?: string; artist?: string }
): Promise<AsyncAnalyzeResponse> {
  return await http<AsyncAnalyzeResponse>("/api/tracks/analyze-async", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
}

export async function fixTrackDuration(args: {
  track_id: string;
  friend_id: number;
  local_audio_url?: string | null;
}): Promise<{ success: boolean; jobId: string }> {
  return await http<{ success: boolean; jobId: string }>("/api/tracks/fix-duration", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
}

export async function uploadTrackAudio(
  args: UploadTrackAudioArgs
): Promise<UploadTrackAudioResponse> {
  const formData = new FormData();
  formData.append("file", args.file);
  formData.append("track_id", args.track_id);
  return await http<UploadTrackAudioResponse>("/api/tracks/upload", {
    method: "POST",
    body: formData,
  });
}

export async function fetchTrackMetadata(
  args: TrackMetadataArgs
): Promise<TrackMetadataResponse> {
  return await http<TrackMetadataResponse>("/api/providers/openai/track-metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
}

export async function fetchTrackById(params: {
  track_id: string;
  friend_id: number;
}): Promise<Track> {
  const url = `/api/tracks/${encodeURIComponent(
    params.track_id
  )}?friend_id=${encodeURIComponent(params.friend_id)}`;
  return await http<Track>(url, { method: "GET", cache: "no-store" });
}

export async function softDeleteTrack(params: {
  track_id: string;
  friend_id: number;
}): Promise<{ success: boolean; track_id: string; friend_id: number }> {
  return await http(
    `/api/tracks/${encodeURIComponent(params.track_id)}?friend_id=${params.friend_id}`,
    { method: "DELETE" }
  );
}

export async function fetchTrackPlaylists(
  trackId: string,
  friendId: number
): Promise<TrackPlaylistMembership[]> {
  const data = await http<TrackPlaylistsApiResponse>(
    `/api/tracks/${encodeURIComponent(trackId)}/playlists?friend_id=${friendId}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  return Array.isArray(data.playlists) ? data.playlists : [];
}

export async function fetchTrackAudioMetadata(
  trackId: string,
  friendId: number
): Promise<TrackAudioMetadataResponse> {
  return await http<TrackAudioMetadataResponse>(
    `/api/tracks/${encodeURIComponent(trackId)}/audio-metadata?friend_id=${friendId}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );
}

export async function extractEmbeddedCover(
  trackId: string,
  friendId: number
): Promise<string> {
  const data = await http<TrackExtractEmbeddedCoverResponse>(
    `/api/tracks/${encodeURIComponent(trackId)}/audio-metadata`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friend_id: friendId }),
    }
  );

  return String(data.audio_file_album_art_url || "");
}

export async function fetchTrackEssentiaData(
  trackId: string,
  friendId: number
): Promise<TrackEssentiaResponse> {
  return await http<TrackEssentiaResponse>(
    `/api/tracks/${encodeURIComponent(trackId)}/essentia?friend_id=${friendId}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );
}

export async function fetchTrackEmbeddingPreview(
  trackId: string,
  friendId: number
): Promise<TrackEmbeddingPreviewResponse> {
  return await http<TrackEmbeddingPreviewResponse>(
    `/api/tracks/${encodeURIComponent(trackId)}/embedding-preview?friend_id=${friendId}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );
}

export async function fetchIdentityEmbeddingPreview(
  trackId: string,
  friendId: number
): Promise<IdentityEmbeddingPreviewResponse> {
  const preview = await http<EmbeddingPreviewResponse>(
    `/api/tracks/${encodeURIComponent(trackId)}/embedding-preview?friend_id=${friendId}&type=identity`,
    {
      method: "GET",
      cache: "no-store",
    }
  );
  const parsed = embeddingIdentityPreviewApiResponseSchema.parse(preview);
  return identityEmbeddingPreviewResponseSchema.parse({
    identityText: parsed.text,
    identityData: parsed.data,
  });
}

export async function fetchAudioVibeEmbeddingPreview(
  trackId: string,
  friendId: number
): Promise<AudioVibeEmbeddingPreviewResponse> {
  const preview = await http<EmbeddingPreviewResponse>(
    `/api/tracks/${encodeURIComponent(trackId)}/embedding-preview?friend_id=${friendId}&type=audio_vibe`,
    {
      method: "GET",
      cache: "no-store",
    }
  );
  const parsed = embeddingAudioVibePreviewApiResponseSchema.parse(preview);
  return audioVibeEmbeddingPreviewResponseSchema.parse({
    vibeText: parsed.text,
    vibeData: parsed.data,
  });
}

export async function fetchSimilarVibeTracks(
  options: SimilarVibeTracksOptions
): Promise<SimilarVibeTracksResponse> {
  const friendId = Number(options.friend_id);
  const params = new URLSearchParams({
    track_id: options.track_id,
    friend_id: String(friendId),
    mode: "audio",
  });
  if (typeof options.limit === "number") {
    params.set("limit_audio", String(options.limit));
  }
  if (typeof options.ivfflat_probes === "number") {
    params.set("ivfflat_probes", String(options.ivfflat_probes));
  }

  const data = await http<z.infer<typeof recommendationsResponseSchema>>(
    `/api/recommendations/candidates?${params.toString()}`,
    { method: "GET", cache: "no-store" }
  );

  const tracks: SimilarVibeTrack[] = data.candidates
    .filter(
      (candidate): candidate is RecommendationCandidate & { simAudio: number } =>
        candidate.simAudio !== null
    )
    .sort((a, b) => b.simAudio - a.simAudio)
    .map((candidate) => ({
      track_id: candidate.trackId,
      friend_id: candidate.friendId,
      title: candidate.metadata.title,
      artist: candidate.metadata.artist,
      album: candidate.metadata.album,
      year: candidate.metadata.year,
      genres: candidate.metadata.genres,
      styles: candidate.metadata.styles,
      local_tags: candidate.metadata.tags.join(", "),
      bpm: candidate.metadata.bpm,
      key: candidate.metadata.key,
      danceability: candidate.metadata.danceability,
      mood_happy: candidate.metadata.moodHappy,
      mood_sad: candidate.metadata.moodSad,
      mood_relaxed: candidate.metadata.moodRelaxed,
      mood_aggressive: candidate.metadata.moodAggressive,
      star_rating: candidate.metadata.starRating,
      distance: 1 - candidate.simAudio,
      identity_text: "",
    })) as SimilarVibeTrack[];

  return {
    source_track_id: options.track_id,
    source_friend_id: friendId,
    count: tracks.length,
    tracks,
  };
}

export async function fetchSimilarTracks(
  options: SimilarTracksOptions
): Promise<SimilarTracksResponse> {
  const friendId = Number(options.friend_id);
  const params = new URLSearchParams({
    track_id: options.track_id,
    friend_id: String(friendId),
    mode: "identity",
  });
  if (typeof options.limit === "number") {
    params.set("limit_identity", String(options.limit));
  }
  if (typeof options.ivfflat_probes === "number") {
    params.set("ivfflat_probes", String(options.ivfflat_probes));
  }
  const data = await http<z.infer<typeof recommendationsResponseSchema>>(
    `/api/recommendations/candidates?${params.toString()}`,
    { method: "GET", cache: "no-store" }
  );

  let tracks: SimilarTrack[] = data.candidates
    .filter(
      (candidate): candidate is RecommendationCandidate & { simIdentity: number } =>
        candidate.simIdentity !== null
    )
    .sort((a, b) => b.simIdentity - a.simIdentity)
    .map((candidate) => ({
      track_id: candidate.trackId,
      friend_id: candidate.friendId,
      title: candidate.metadata.title,
      artist: candidate.metadata.artist,
      album: candidate.metadata.album,
      year: candidate.metadata.year,
      genres: candidate.metadata.genres,
      styles: candidate.metadata.styles,
      local_tags: candidate.metadata.tags.join(", "),
      bpm: candidate.metadata.bpm,
      key: candidate.metadata.key,
      danceability: candidate.metadata.danceability,
      star_rating: candidate.metadata.starRating,
      distance: 1 - candidate.simIdentity,
      identity_text: "",
    })) as SimilarTrack[];

  if (options.era) {
    const eraFilter = options.era.trim().toLowerCase();
    tracks = tracks.filter((track) => String(track.year ?? "").toLowerCase().includes(eraFilter));
  }
  if (options.tags) {
    const requiredTags = options.tags
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
    if (requiredTags.length > 0) {
      tracks = tracks.filter((track) => {
        const trackTags = track.local_tags
          .split(",")
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean);
        return requiredTags.every((tag) => trackTags.includes(tag));
      });
    }
  }

  return {
    source_track_id: options.track_id,
    source_friend_id: friendId,
    filters: {
      era: options.era,
      country: options.country,
      tags: options.tags?.split(",").map((tag) => tag.trim()).filter(Boolean),
    },
    count: tracks.length,
    tracks,
  };
}

export async function searchTracks(
  query: TrackSearchQuery
): Promise<TrackSearchResponse> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (typeof query.limit === "number") params.set("limit", String(query.limit));
  if (typeof query.offset === "number") params.set("offset", String(query.offset));
  if (query.filter) params.set("filter", query.filter);

  const search = params.toString();
  const path = search ? `/api/tracks/search?${search}` : "/api/tracks/search";
  return await http<TrackSearchResponse>(path, {
    method: "GET",
    cache: "no-store",
  });
}

export async function fetchPlaylistCounts(
  track_refs: TrackPlaylistCountRef[]
): Promise<TrackPlaylistCountsResponse> {
  if (!track_refs || track_refs.length === 0) return {};
  const body: z.input<typeof trackPlaylistCountsBodySchema> = { track_refs };
  return await http<TrackPlaylistCountsResponse>("/api/tracks/playlist_counts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

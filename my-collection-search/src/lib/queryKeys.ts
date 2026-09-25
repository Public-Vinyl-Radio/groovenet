// Centralized TanStack Query keys

import { AppleMusicAISearchArgs } from "@/services/aiService";

export const queryKeys = {
  defaultLibrary: () => ["settings", "default-library"] as const,
  version: () => ["system", "version"] as const,
  status: () => ["system", "status"] as const,
  updateCheck: () => ["system", "update-check"] as const,
  playlists: () => ["playlists"] as const,
  friends: () => ["friends"] as const,
  backups: () => ["backups"] as const,
  spins: (args: {
    friend_id: number;
    release_id?: string;
    track_id?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) => ["spins", args] as const,
  spinsRoot: () => ["spins"] as const,
  spinTopTracks: (args: {
    friend_id: number;
    release_id?: string;
    limit?: number;
    offset?: number;
  }) => ["spins", "top-tracks", args] as const,
  spinTopTracksRoot: () => ["spins", "top-tracks"] as const,
  ingestStats: (args: { minutes?: number; source_id?: string }) =>
    ["vinyl", "stats", args] as const,
  recentDetections: (args: {
    source_id?: string;
    session_id?: string;
    matched?: boolean;
    since?: string;
    limit?: number;
    offset?: number;
  }) => ["vinyl", "detections", args] as const,
  ingestRetention: () => ["vinyl", "retention"] as const,
  albumPlayableStructure: (releaseId: string, friendId: number) =>
    ["album", releaseId, friendId, "playable-structure"] as const,
  playlistTrackIds: (playlistId: number | string) =>
    ["playlist", Number(playlistId), "track-ids"] as const,
  playlistTracks: (
    input:
      | readonly { track_id: string; friend_id: number; position?: number }[]
      | { tracks?: readonly { track_id: string; friend_id: number; position?: number }[] }
      | null
      | undefined
  ) => {
    type TrackRef = { track_id: string; friend_id: number; position?: number };
    const isTrackRef = (v: unknown): v is TrackRef =>
      !!v &&
      typeof v === "object" &&
      typeof (v as { track_id?: unknown }).track_id === "string" &&
      typeof (v as { friend_id?: unknown }).friend_id === "number";

    let arr: readonly TrackRef[] = [] as const;
    if (Array.isArray(input)) {
      arr = input.every(isTrackRef) ? input : ([] as const);
    } else if (input && typeof input === "object") {
      const maybeTracks = (input as { tracks?: unknown }).tracks;
      if (Array.isArray(maybeTracks) && maybeTracks.every(isTrackRef)) {
        arr = maybeTracks;
      }
    }

    // Sort the array to make the query key order-independent
    // This prevents refetches when tracks are reordered
    const sortedArr = [...arr].sort((a, b) => {
      const keyA = `${a.track_id}-${a.friend_id}`;
      const keyB = `${b.track_id}-${b.friend_id}`;
      return keyA.localeCompare(keyB);
    });

    return [
      "playlist-tracks",
      ...sortedArr.map((t) => `${t.track_id}-${t.friend_id ?? 0}`),
    ] as const;
  },
  tracks: (args: {
    q?: string;
    filter?: unknown;
    limit?: number;
    mode?: string;
    page?: number;
  }) => ["tracks", args] as const,
  trackById: (track_id: string, friend_id: number) =>
    ["track", "by-id", track_id, friend_id] as const,
  trackPlaylists: (track_id: string, friend_id: number) =>
    ["track", "playlists", track_id, friend_id] as const,
  trackAudioMetadata: (track_id: string, friend_id: number) =>
    ["track", "audio-metadata", track_id, friend_id] as const,
  trackEssentia: (track_id: string, friend_id: number) =>
    ["track", "essentia", track_id, friend_id] as const,
  trackEmbeddingPreview: (track_id: string, friend_id: number) =>
    ["track", "embedding-preview", track_id, friend_id] as const,
  trackIdentityEmbeddingPreview: (track_id: string, friend_id: number) =>
    ["track", "identity-embedding-preview", track_id, friend_id] as const,
  trackAudioVibeEmbeddingPreview: (track_id: string, friend_id: number) =>
    ["track", "audio-vibe-embedding-preview", track_id, friend_id] as const,
  // Root key helpers for prefix matching (invalidate/setQueriesData with exact:false)
  tracksRoot: () => ["tracks"] as const,
  playlistCounts: (ids: readonly string[]) => ["playlistCounts", ids] as const,
  // Mutation keys (optional centralization)
  tracksStatus: () => ["tracks", "status"] as const,
  appleAISearchKey(args: AppleMusicAISearchArgs) {
    return [
      "ai",
      "apple-music-search",
      args.title ?? "",
      args.artist ?? "",
    ] as const;
  },
};

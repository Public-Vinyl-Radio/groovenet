import { http } from "@/services/http";
import type { Track } from "@/types/track";
import type {
  LiveSet,
  LiveSetUpdate,
  Playlist,
  PlaylistCreate,
  PlaylistDetail,
  PlaylistGeneticResponse,
  PlaylistOptimizerMode,
  PlaylistTrackInput,
  PlaylistUpdate,
  RankingApplied,
} from "@groovenet/contracts";

export type PlaylistTrackPayload = PlaylistTrackInput;
export type PlaylistTrackIdsResponse = PlaylistDetail;
export type CreatePlaylistTracks = string[] | PlaylistTrackPayload[];
export type { PlaylistOptimizerMode };
export type { LiveSetMediaType } from "@groovenet/contracts";
export type LiveSetDetail = LiveSet;

export async function importPlaylist(
  name: string,
  tracks: CreatePlaylistTracks,
  friendId?: number,
): Promise<Playlist> {
  const normalizedTracks = tracks.map((track) =>
    typeof track === "string" ? { track_id: track } : track,
  );
  const body: PlaylistCreate = {
    name,
    tracks: normalizedTracks,
    default_friend_id: friendId,
  };

  return await http<Playlist>("/api/playlists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchPlaylists(): Promise<Playlist[]> {
  return await http<Playlist[]>("/api/playlists", {
    method: "GET",
    cache: "no-store",
  });
}

export async function fetchPlaylistTrackIds(id: number): Promise<PlaylistTrackIdsResponse> {
  return await http<PlaylistTrackIdsResponse>(
    `/api/playlists/${encodeURIComponent(String(id))}/tracks`,
    {
      method: "GET",
      cache: "no-store",
    },
  );
}

export async function createSetForPlaylist(playlistId: number): Promise<{ id: number }> {
  return await http<{ id: number }>(
    `/api/playlists/${encodeURIComponent(String(playlistId))}/set`,
    { method: "POST" },
  );
}

export async function fetchLiveSet(playlistId: number): Promise<LiveSetDetail> {
  return http<LiveSetDetail>(`/api/playlists/${encodeURIComponent(String(playlistId))}/set`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function updateLiveSet(playlistId: number, body: LiveSetUpdate): Promise<void> {
  await http(`/api/playlists/${encodeURIComponent(String(playlistId))}/set`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteLiveSet(playlistId: number): Promise<void> {
  await http(`/api/playlists/${encodeURIComponent(String(playlistId))}/set`, { method: "DELETE" });
}

export type OptimizedPlaylist = {
  tracks: Track[];
  /** The ranking profile that ordered it (#1193); absent from an older server. */
  ranking: RankingApplied | null;
};

/**
 * Order a playlist on the server. `ranking` names the profile to order by (a
 * preset or stored id); omitted, the server uses the library's active
 * `playlists` profile. `friendId` names that library.
 */
export async function optimizePlaylist(
  playlist: Track[],
  mode: PlaylistOptimizerMode = "genetic",
  options: { ranking?: string; friendId?: number } = {},
): Promise<OptimizedPlaylist> {
  try {
    const data = await http<PlaylistGeneticResponse>("/api/playlists/genetic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playlist,
        mode,
        ...(options.friendId !== undefined ? { friend_id: options.friendId } : {}),
        ...(options.ranking !== undefined ? { ranking: options.ranking } : {}),
      }),
    });

    const tracks = Array.isArray(data.result)
      ? (data.result as Track[])
      : (Object.values(data.result || {}) as Track[]);
    return { tracks, ranking: data.ranking ?? null };
  } catch (error) {
    const err = error as Error & {
      data?: {
        error?: string;
        invalid?: Array<{ track_id?: string; reason?: string }>;
      };
    };
    const invalid = err.data?.invalid;
    if (Array.isArray(invalid)) {
      throw new Error(
        JSON.stringify({
          error: err.data?.error || err.message || "Invalid tracks for genetic playlist",
          invalid,
        }),
      );
    }
    throw error;
  }
}

export async function generateOptimizedPlaylist(
  playlist: Track[],
  mode: PlaylistOptimizerMode = "genetic",
): Promise<Track[]> {
  return (await optimizePlaylist(playlist, mode)).tracks;
}

export async function generateGeneticPlaylist(playlist: Track[]): Promise<Track[]> {
  return generateOptimizedPlaylist(playlist, "genetic");
}

export async function updatePlaylist(
  id: number,
  data: { name?: string; tracks?: CreatePlaylistTracks },
): Promise<Playlist> {
  const body: PlaylistUpdate = { id, ...data };
  return await http<Playlist>("/api/playlists", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deletePlaylist(playlistId: number): Promise<void> {
  await http<{ success: boolean }>(`/api/playlists?id=${encodeURIComponent(String(playlistId))}`, {
    method: "DELETE",
  });
}

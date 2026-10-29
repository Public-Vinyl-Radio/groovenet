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

export async function generateOptimizedPlaylist(
  playlist: Track[],
  mode: PlaylistOptimizerMode = "genetic",
): Promise<Track[]> {
  try {
    const data = await http<PlaylistGeneticResponse>("/api/playlists/genetic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlist, mode }),
    });

    return Array.isArray(data.result)
      ? (data.result as Track[])
      : (Object.values(data.result || {}) as Track[]);
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

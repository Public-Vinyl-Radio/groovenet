import {
  playlistRepository,
  type PlaylistHeader,
  type PlaylistTrackRow,
  type PlaylistVisibility,
} from "@/server/repositories/playlistRepository";
import type { PlaylistTrackInput } from "@/api-contract/schemas";
import { withDbTransaction } from "@/lib/serverDb";

export function normalizePlaylistCreatedAt<T extends { created_at?: unknown }>(
  playlist: T,
): T & { created_at: string } {
  const raw = playlist.created_at;
  const createdAt =
    raw instanceof Date
      ? raw.toISOString()
      : typeof raw === "string"
        ? raw
        : new Date(raw as string | number).toISOString();
  return {
    ...playlist,
    created_at: createdAt,
  };
}

/** Thrown when someone other than the owner changes a playlist's visibility (#1284). */
export class PlaylistForbiddenError extends Error {
  constructor() {
    super("Only the playlist's owner can change its visibility");
    this.name = "PlaylistForbiddenError";
  }
}

/**
 * Every method takes the viewer's profile id (#1284): a private playlist of
 * someone else's is "not found", exactly like a missing id.
 */
export class PlaylistManagementService {
  async getPlaylistTrackDetails(
    playlistId: number,
    viewerId: string,
  ): Promise<
    | { notFound: true }
    | {
        notFound: false;
        detail: {
          playlist_id: number;
          playlist_name?: string | null;
          owner_id: string;
          owner_name: string | null;
          visibility: PlaylistVisibility;
          tracks: Array<{ track_id: string; friend_id: number; position: number }>;
        };
      }
  > {
    const playlist = await playlistRepository.findPlaylistHeaderById(playlistId, viewerId);
    if (!playlist) return { notFound: true };

    const tracks = await playlistRepository.listTrackRefsForPlaylist(playlistId);
    return {
      notFound: false,
      detail: {
        playlist_id: playlistId,
        playlist_name: playlist.name,
        owner_id: playlist.owner_id,
        owner_name: playlist.owner_name,
        visibility: playlist.visibility,
        tracks,
      },
    };
  }

  async getAllPlaylistsWithTracks(viewerId: string): Promise<
    Array<{
      id: number;
      name: string;
      created_at: string;
      tracks: PlaylistTrackRow[];
      cover_urls: string[];
      set?: import("@/types/track").LiveSetSummary;
    }>
  > {
    const playlists = await playlistRepository.listPlaylists(viewerId);
    if (playlists.length === 0) return [];

    const playlistIds = playlists.map((p) => p.id);
    const playlistTracks = await playlistRepository.listPlaylistTracksByPlaylistIds(playlistIds);
    const durations = await playlistRepository.listPlaylistDurationsByPlaylistIds(playlistIds);
    const liveSets = await playlistRepository.listLiveSetSummariesByPlaylistIds(playlistIds);
    const covers = await playlistRepository.listCoverUrlsByPlaylistIds(playlistIds);
    const tracksByPlaylist: Record<number, PlaylistTrackRow[]> = {};

    playlistTracks.forEach((row) => {
      if (!tracksByPlaylist[row.playlist_id]) tracksByPlaylist[row.playlist_id] = [];
      tracksByPlaylist[row.playlist_id].push(row);
    });

    return playlists.map((playlist) =>
      normalizePlaylistCreatedAt({
        ...playlist,
        tracks: tracksByPlaylist[playlist.id] || [],
        total_duration_seconds: durations[playlist.id] || 0,
        cover_urls: covers[playlist.id] || [],
        ...(liveSets[playlist.id] ? { set: liveSets[playlist.id] } : {}),
      }),
    );
  }

  /** The new playlist is owned by `ownerId`, the requesting profile. */
  async createPlaylistWithTracks(data: {
    name: string;
    tracks: PlaylistTrackInput[];
    ownerId: string;
    visibility?: PlaylistVisibility;
  }): Promise<{
    id: number;
    name: string;
    created_at: string;
    tracks: Array<{ track_id: string; friend_id?: number; position?: number | null }>;
  }> {
    const tracks = data.tracks || [];

    const resolvedTracks = await Promise.all(
      tracks.map(async (track, i) => {
        const friendId = await this.resolveFriendIdForTrack(
          track.track_id,
          track.username ?? undefined,
        );
        return {
          ...track,
          friend_id: friendId,
          position: i,
        };
      }),
    );

    const playlist = await withDbTransaction(async (client) => {
      const created = await playlistRepository.createPlaylistWithClient(
        client,
        data.name,
        data.ownerId,
        data.visibility,
      );
      if (resolvedTracks.length > 0) {
        await playlistRepository.upsertTracksWithMetadata(resolvedTracks, client);
        await playlistRepository.insertPlaylistTracks(
          client,
          created.id,
          resolvedTracks.map((track) => ({
            track_id: track.track_id,
            friend_id: track.friend_id!,
            position: track.position ?? 0,
          })),
          true,
        );
      }
      return created;
    });

    return {
      ...playlist,
      tracks: resolvedTracks.map((track) => ({
        track_id: track.track_id,
        friend_id: track.friend_id,
        position: track.position,
      })),
    };
  }

  /**
   * Anyone who can see a playlist may rename it or change its tracks, as
   * before profiles; only its owner may change `visibility`, which throws
   * `PlaylistForbiddenError` for anyone else.
   */
  async updatePlaylist(
    data: {
      id: number;
      name?: string;
      tracks?: Array<string | PlaylistTrackInput>;
      default_friend_id?: number;
      visibility?: PlaylistVisibility;
    },
    viewerId: string,
  ): Promise<
    | { notFound: true }
    | {
        notFound: false;
        playlist: {
          id: number;
          name: string;
          created_at: string;
          tracks: Array<{ track_id: string; friend_id: number; position: number }>;
        };
      }
  > {
    const notFound = await withDbTransaction(async (client) => {
      const exists: PlaylistHeader | null =
        await playlistRepository.findPlaylistHeaderByIdWithClient(client, data.id, viewerId);
      if (!exists) {
        return true;
      }

      if (data.visibility !== undefined && data.visibility !== exists.visibility) {
        if (exists.owner_id !== viewerId) throw new PlaylistForbiddenError();
        await playlistRepository.updatePlaylistVisibility(client, data.id, data.visibility);
      }

      if (data.name !== undefined) {
        await playlistRepository.updatePlaylistName(client, data.id, data.name);
      }

      if (data.tracks !== undefined) {
        await playlistRepository.deletePlaylistTracks(client, data.id);
        if (data.tracks.length > 0) {
          const resolvedTracks = await Promise.all(
            data.tracks.map(async (track, i) => {
              const trackId = typeof track === "string" ? track : track.track_id;
              const username =
                typeof track === "object" ? (track.username ?? undefined) : undefined;

              const rawFriendId = typeof track === "object" ? track.friend_id : undefined;
              let friendId =
                typeof rawFriendId === "number" && Number.isFinite(rawFriendId)
                  ? rawFriendId
                  : undefined;

              if (!friendId && data.default_friend_id) {
                friendId = data.default_friend_id;
              }

              if (!friendId) {
                friendId = await this.resolveFriendIdForTrack(trackId, username);
              }

              return {
                ...(typeof track === "object" ? track : { track_id: trackId }),
                track_id: trackId,
                friend_id: friendId,
                position: i,
              };
            }),
          );

          await playlistRepository.upsertTracksWithMetadata(resolvedTracks, client);
          await playlistRepository.insertPlaylistTracks(
            client,
            data.id,
            resolvedTracks.map((track) => ({
              track_id: track.track_id,
              friend_id: track.friend_id!,
              position: track.position ?? 0,
            })),
          );
        }
      }
      return false;
    });
    if (notFound) return { notFound: true };

    const playlist = await playlistRepository.findPlaylistById(data.id, viewerId);
    const tracks = await playlistRepository.listTrackRefsForPlaylist(data.id);

    if (!playlist) return { notFound: true };
    return {
      notFound: false,
      playlist: normalizePlaylistCreatedAt({
        ...playlist,
        tracks,
      }),
    };
  }

  private async resolveFriendIdForTrack(trackId: string, username?: string): Promise<number> {
    if (username) {
      const id = await playlistRepository.findFriendIdByUsername(username);
      if (id) return id;
    }
    const ownerId = await playlistRepository.findAnyFriendIdForTrack(trackId);
    if (ownerId) return ownerId;
    return playlistRepository.getDefaultFriendId();
  }
}

export const playlistManagementService = new PlaylistManagementService();

import type { PoolClient } from "pg";
import type { LiveSetSummary, Playlist } from "@/types/track";
import { dbPool, dbQuery } from "@/lib/serverDb";
import type { PlaylistTrackInput } from "@/api-contract/schemas";

export type Queryable = Pick<PoolClient, "query">;

export type PlaylistTrackRow = {
  playlist_id: number;
  track_id: string;
  friend_id: number;
  position: number;
};

function normalizeStringArray(arr?: unknown): string[] | null {
  if (!arr) return null;
  if (Array.isArray(arr)) return arr.map(String);
  return null;
}

export class PlaylistRepository {
  async listPlaylistDurationsByPlaylistIds(playlistIds: number[]): Promise<Record<number, number>> {
    if (playlistIds.length === 0) return {};
    const result = await dbQuery<{ playlist_id: number; total_duration_seconds: string | number }>(
      `SELECT pt.playlist_id, COALESCE(SUM(t.duration_seconds), 0) AS total_duration_seconds
       FROM playlist_tracks pt
       LEFT JOIN tracks t ON t.track_id = pt.track_id AND t.friend_id = pt.friend_id
       WHERE pt.playlist_id = ANY($1)
       GROUP BY pt.playlist_id`,
      [playlistIds]
    );
    return Object.fromEntries(result.rows.map((row) => [row.playlist_id, Number(row.total_duration_seconds)]));
  }
  async createLiveSetForPlaylist(playlistId: number): Promise<{ id: number }> {
    const result = await dbQuery<{ id: number }>(
      `INSERT INTO live_sets (playlist_id)
       VALUES ($1)
       ON CONFLICT (playlist_id) DO UPDATE SET updated_at = live_sets.updated_at
       RETURNING id`,
      [playlistId]
    );
    return result.rows[0];
  }

  async listLiveSetSummariesByPlaylistIds(
    playlistIds: number[]
  ): Promise<Record<number, LiveSetSummary>> {
    if (playlistIds.length === 0) return {};
    const result = await dbQuery<LiveSetSummary & { playlist_id: number }>(
      `SELECT
        s.playlist_id, s.id, s.title, s.status, s.cover_image_url,
        latest.performed_at AS last_performed_at,
        latest.venue_name, latest.location_city,
        COALESCE(collaborators.collaborators, '[]'::json) AS collaborators
      FROM live_sets s
      LEFT JOIN LATERAL (
        SELECT performed_at, venue_name, location_city
        FROM live_set_performances
        WHERE live_set_id = s.id
        ORDER BY performed_at DESC
        LIMIT 1
      ) latest ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('friend_id', c.friend_id, 'username', f.username, 'role', c.role) ORDER BY f.username) AS collaborators
        FROM live_set_collaborators c
        JOIN friends f ON f.id = c.friend_id
        WHERE c.live_set_id = s.id
      ) collaborators ON true
      WHERE s.playlist_id = ANY($1)`,
      [playlistIds]
    );
    return Object.fromEntries(
      result.rows.map(({ playlist_id, ...set }) => [playlist_id, set])
    );
  }
  async getDefaultFriendId(): Promise<number> {
    const result = await dbQuery("SELECT id FROM friends ORDER BY id LIMIT 1");
    if (result.rows.length === 0) {
      throw new Error("No friends found");
    }
    return result.rows[0].id;
  }

  async findFriendIdByUsername(username: string): Promise<number | null> {
    const result = await dbQuery("SELECT id FROM friends WHERE username = $1", [
      username,
    ]);
    return result.rows[0]?.id ?? null;
  }

  async findAnyFriendIdForTrack(trackId: string): Promise<number | null> {
    const result = await dbQuery(
      "SELECT friend_id FROM tracks WHERE track_id = $1 LIMIT 1",
      [trackId]
    );
    return result.rows[0]?.friend_id ?? null;
  }

  async findFriendUsernameById(friendId: number): Promise<string | null> {
    const result = await dbQuery("SELECT username FROM friends WHERE id = $1", [
      friendId,
    ]);
    return result.rows[0]?.username ?? null;
  }

  async listPlaylists(): Promise<Playlist[]> {
    const res = await dbQuery("SELECT * FROM playlists ORDER BY created_at DESC");
    return res.rows as Playlist[];
  }

  async listPlaylistTracksByPlaylistIds(
    playlistIds: number[]
  ): Promise<PlaylistTrackRow[]> {
    if (playlistIds.length === 0) return [];
    const res = await dbQuery(
      "SELECT playlist_id, track_id, friend_id, position FROM playlist_tracks WHERE playlist_id = ANY($1) ORDER BY position ASC",
      [playlistIds]
    );
    return res.rows as PlaylistTrackRow[];
  }

  async createPlaylist(name: string): Promise<Playlist> {
    const res = await dbQuery("INSERT INTO playlists (name) VALUES ($1) RETURNING *", [
      name,
    ]);
    return res.rows[0] as Playlist;
  }

  async createPlaylistWithClient(client: Queryable, name: string): Promise<Playlist> {
    const res = await client.query<Playlist>(
      "INSERT INTO playlists (name) VALUES ($1) RETURNING *",
      [name]
    );
    return res.rows[0] as Playlist;
  }

  async findPlaylistById(id: number): Promise<Playlist | null> {
    const res = await dbQuery("SELECT * FROM playlists WHERE id = $1", [id]);
    return (res.rows[0] as Playlist | undefined) ?? null;
  }

  async findPlaylistHeaderById(id: number): Promise<{ id: number; name: string } | null> {
    const res = await dbQuery<{ id: number; name: string }>(
      "SELECT id, name FROM playlists WHERE id = $1",
      [id]
    );
    return res.rows[0] ?? null;
  }

  async findPlaylistHeaderByIdWithClient(
    client: Queryable,
    id: number
  ): Promise<{ id: number; name: string } | null> {
    const res = await client.query<{ id: number; name: string }>(
      "SELECT id, name FROM playlists WHERE id = $1",
      [id]
    );
    return res.rows[0] ?? null;
  }

  async updatePlaylistName(client: Queryable, id: number, name: string): Promise<void> {
    await client.query("UPDATE playlists SET name = $1 WHERE id = $2", [name, id]);
  }

  async deletePlaylistTracks(client: Queryable, playlistId: number): Promise<void> {
    await client.query("DELETE FROM playlist_tracks WHERE playlist_id = $1", [playlistId]);
  }

  async insertPlaylistTracks(
    client: Queryable,
    playlistId: number,
    tracks: Array<{ track_id: string; friend_id: number; position: number }>,
    onConflictDoNothing = false
  ): Promise<void> {
    if (tracks.length === 0) return;
    const values = tracks
      .map((_, i) => `($1, $${i * 3 + 2}, $${i * 3 + 3}, $${i * 3 + 4})`)
      .join(",");
    const sql = `INSERT INTO playlist_tracks (playlist_id, track_id, friend_id, position) VALUES ${values}${
      onConflictDoNothing ? " ON CONFLICT DO NOTHING" : ""
    }`;
    const params: (string | number)[] = [playlistId];
    tracks.forEach((track) => {
      params.push(track.track_id, track.friend_id, track.position);
    });
    await client.query(sql, params);
  }

  async deletePlaylistById(id: number): Promise<Playlist | null> {
    const res = await dbQuery("DELETE FROM playlists WHERE id = $1 RETURNING *", [id]);
    return (res.rows[0] as Playlist | undefined) ?? null;
  }

  async listTrackRefsForPlaylist(
    playlistId: number
  ): Promise<Array<{ track_id: string; friend_id: number; position: number }>> {
    const res = await dbQuery(
      "SELECT track_id, friend_id, position FROM playlist_tracks WHERE playlist_id = $1 ORDER BY position ASC",
      [playlistId]
    );
    return res.rows as Array<{ track_id: string; friend_id: number; position: number }>;
  }

  async connect(): Promise<PoolClient> {
    return dbPool.connect();
  }

  async upsertTracksWithMetadata(
    tracks: PlaylistTrackInput[],
    db: Queryable
  ): Promise<void> {
    if (!tracks.length) return;

    const columns = [
      "title",
      "artist",
      "album",
      "year",
      "styles",
      "genres",
      "duration",
      "discogs_url",
      "apple_music_url",
      "youtube_url",
      "soundcloud_url",
      "album_thumbnail",
      "local_tags",
      "bpm",
      "key",
      "danceability",
      "duration_seconds",
      "notes",
      "local_audio_url",
      "star_rating",
      "release_id",
      "mood_happy",
      "mood_sad",
      "mood_relaxed",
      "mood_aggressive",
      "username",
    ] as const;

    for (const rawTrack of tracks) {
      if (!rawTrack.track_id || !rawTrack.friend_id) continue;
      const title =
        typeof rawTrack.title === "string" && rawTrack.title.trim().length > 0
          ? rawTrack.title.trim()
          : null;
      const artist =
        typeof rawTrack.artist === "string" && rawTrack.artist.trim().length > 0
          ? rawTrack.artist.trim()
          : null;

      const bpmNumber =
        typeof rawTrack.bpm === "number"
          ? rawTrack.bpm
          : typeof rawTrack.bpm === "string"
          ? Number(rawTrack.bpm)
          : null;
      const durationSecondsNumber =
        typeof rawTrack.duration_seconds === "number"
          ? rawTrack.duration_seconds
          : typeof rawTrack.duration_seconds === "string"
          ? Number(rawTrack.duration_seconds)
          : null;
      const starRatingNumber =
        typeof rawTrack.star_rating === "number"
          ? rawTrack.star_rating
          : typeof rawTrack.star_rating === "string"
          ? Number(rawTrack.star_rating)
          : null;

      const updateValues: Record<(typeof columns)[number], unknown> = {
        title,
        artist,
        album: rawTrack.album ?? null,
        year:
          typeof rawTrack.year === "number" || typeof rawTrack.year === "string"
            ? rawTrack.year
            : null,
        styles: normalizeStringArray(rawTrack.styles),
        genres: normalizeStringArray(rawTrack.genres),
        duration: rawTrack.duration ?? null,
        discogs_url: rawTrack.discogs_url ?? null,
        apple_music_url: rawTrack.apple_music_url ?? null,
        youtube_url: rawTrack.youtube_url ?? null,
        soundcloud_url: rawTrack.soundcloud_url ?? null,
        album_thumbnail: rawTrack.album_thumbnail ?? null,
        local_tags: rawTrack.local_tags ?? null,
        bpm: Number.isFinite(bpmNumber) ? bpmNumber : null,
        key: rawTrack.key ?? null,
        danceability: rawTrack.danceability ?? null,
        duration_seconds: Number.isFinite(durationSecondsNumber)
          ? durationSecondsNumber
          : null,
        notes: rawTrack.notes ?? null,
        local_audio_url: rawTrack.local_audio_url ?? null,
        star_rating: Number.isFinite(starRatingNumber) ? starRatingNumber : null,
        release_id: rawTrack.release_id ?? null,
        mood_happy: rawTrack.mood_happy ?? null,
        mood_sad: rawTrack.mood_sad ?? null,
        mood_relaxed: rawTrack.mood_relaxed ?? null,
        mood_aggressive: rawTrack.mood_aggressive ?? null,
        username: rawTrack.username ?? null,
      };

      const updateParams: unknown[] = [];
      const setClauses: string[] = [];
      let idx = 1;
      for (const col of columns) {
        setClauses.push(`${col} = COALESCE($${idx}, ${col})`);
        updateParams.push(updateValues[col]);
        idx += 1;
      }
      updateParams.push(rawTrack.track_id, rawTrack.friend_id);

      const updateSql = `
        UPDATE tracks
        SET ${setClauses.join(", ")}
        WHERE track_id = $${idx} AND friend_id = $${idx + 1}
        RETURNING track_id;
      `;
      const updateRes = await db.query(updateSql, updateParams);
      if ((updateRes as { rowCount?: number }).rowCount) continue;

      const insertTitle = title ?? rawTrack.track_id;
      const insertArtist = artist ?? "Unknown Artist";
      let username = rawTrack.username;
      if (!username) {
        username = await this.findFriendUsernameById(rawTrack.friend_id);
      }

      if (!username) {
        throw new Error(
          `Cannot insert track ${rawTrack.track_id}: username is required but not found for friend_id ${rawTrack.friend_id}`
        );
      }

      const insertValues = { ...updateValues, title: insertTitle, artist: insertArtist, username };
      const insertColumns = ["track_id", "friend_id", ...columns] as const;
      const insertParams: unknown[] = [
        rawTrack.track_id,
        rawTrack.friend_id,
        ...columns.map((col) => insertValues[col]),
      ];
      const placeholders = insertColumns.map((_, i) => `$${i + 1}`).join(", ");
      const insertSql = `
        INSERT INTO tracks (${insertColumns.join(", ")})
        VALUES (${placeholders})
        ON CONFLICT (track_id) DO NOTHING;
      `;
      await db.query(insertSql, insertParams);
    }
  }
}

export const playlistRepository = new PlaylistRepository();

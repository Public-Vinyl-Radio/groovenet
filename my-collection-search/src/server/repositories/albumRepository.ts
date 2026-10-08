import type { Album, Track } from "@/types/track";
import { dbQuery } from "@/lib/serverDb";
import type { PoolClient } from "pg";
import { hasVectorsSelectSql, trackGenresSelectSql } from "@/server/repositories/trackGenreRepository";

type Queryable = Pick<PoolClient, "query">;

export type AlbumCleanupRow = {
  release_id: string;
  friend_id: number;
  title: string;
  artist: string;
  track_count?: number;
};

export type AlbumUpsertInput = Pick<
  Album,
  | "release_id"
  | "friend_id"
  | "title"
  | "artist"
  | "track_count"
  | "year"
  | "genres"
  | "styles"
  | "album_thumbnail"
  | "discogs_url"
  | "date_added"
  | "date_changed"
  | "label"
  | "catalog_number"
  | "country"
  | "format"
  | "album_notes"
  | "album_rating"
  | "purchase_price"
  | "condition"
  | "library_identifier"
>;

export class AlbumRepository {
  async getFriendUsernamesByIds(friendIds: number[]): Promise<Map<number, string>> {
    const usernameByFriendId = new Map<number, string>();
    if (friendIds.length === 0) return usernameByFriendId;

    const { rows } = await dbQuery<{ id: number; username: string }>(
      "SELECT id, username FROM friends WHERE id = ANY($1::int[])",
      [friendIds]
    );
    for (const row of rows) {
      usernameByFriendId.set(Number(row.id), String(row.username));
    }
    return usernameByFriendId;
  }

  async getFirstAudioCoverByAlbumRefs(
    refs: Array<{ release_id: string; friend_id: number }>
  ): Promise<Map<string, string>> {
    const coverByAlbumKey = new Map<string, string>();
    if (refs.length === 0) return coverByAlbumKey;

    const values: string[] = [];
    const params: Array<string | number> = [];
    refs.forEach((ref, idx) => {
      const p = idx * 2;
      values.push(`($${p + 1}::text, $${p + 2}::integer)`);
      params.push(ref.release_id, ref.friend_id);
    });

    const { rows } = await dbQuery<{
      release_id: string;
      friend_id: number;
      audio_file_album_art_url: string;
    }>(
      `
      WITH refs(release_id, friend_id) AS (
        VALUES ${values.join(", ")}
      )
      SELECT DISTINCT ON (t.release_id, t.friend_id)
        t.release_id,
        t.friend_id,
        t.audio_file_album_art_url
      FROM tracks t
      INNER JOIN refs r
        ON r.release_id = t.release_id AND r.friend_id = t.friend_id
      WHERE t.audio_file_album_art_url IS NOT NULL
        AND t.audio_file_album_art_url <> ''
      ORDER BY t.release_id, t.friend_id, t.id ASC
      `,
      params
    );

    for (const row of rows) {
      coverByAlbumKey.set(
        `${row.release_id}:${row.friend_id}`,
        row.audio_file_album_art_url
      );
    }

    return coverByAlbumKey;
  }

  async getAlbumByReleaseAndFriend(
    releaseId: string,
    friendId: number
  ): Promise<Album | null> {
    const { rows } = await dbQuery<Album>(
      "SELECT * FROM albums WHERE release_id = $1 AND friend_id = $2",
      [releaseId, friendId]
    );
    return rows[0] ?? null;
  }

  async getTracksByReleaseAndFriend(
    releaseId: string,
    friendId: number
  ): Promise<Track[]> {
    const { rows } = await dbQuery<Track>(
      `
      SELECT t.*, ${hasVectorsSelectSql("t")}, ${trackGenresSelectSql("t")}
      FROM tracks t
      WHERE t.release_id = $1 AND t.friend_id = $2
        AND t.deleted_at IS NULL
      ORDER BY t.position
      `,
      [releaseId, friendId]
    );
    return rows;
  }

  async getFriendUsernameById(friendId: number): Promise<string | null> {
    const { rows } = await dbQuery<{ username: string }>(
      "SELECT username FROM friends WHERE id = $1",
      [friendId]
    );
    return rows[0]?.username ?? null;
  }

  async ensureFriendIdByUsername(username: string): Promise<number> {
    const existing = await dbQuery<{ id: number }>(
      "SELECT id FROM friends WHERE username = $1",
      [username]
    );
    if (existing.rows.length > 0) return existing.rows[0].id;

    const inserted = await dbQuery<{ id: number }>(
      "INSERT INTO friends (username) VALUES ($1) RETURNING id",
      [username]
    );
    return inserted.rows[0].id;
  }

  async upsertAlbumRecord(
    db: Queryable,
    album: AlbumUpsertInput,
    options?: { preserveManualFields?: boolean }
  ): Promise<Album> {
    const preserveManualFields = options?.preserveManualFields ?? false;
    const manualUpdateSql = preserveManualFields
      ? `
        album_notes = albums.album_notes,
        album_rating = albums.album_rating,
        purchase_price = albums.purchase_price,
        condition = albums.condition,
        library_identifier = albums.library_identifier,
      `
      : `
        album_notes = COALESCE(EXCLUDED.album_notes, albums.album_notes),
        album_rating = COALESCE(EXCLUDED.album_rating, albums.album_rating),
        purchase_price = COALESCE(EXCLUDED.purchase_price, albums.purchase_price),
        condition = COALESCE(EXCLUDED.condition, albums.condition),
        library_identifier = COALESCE(EXCLUDED.library_identifier, albums.library_identifier),
      `;

    const result = await db.query(
      `
      INSERT INTO albums (
        release_id, friend_id, title, artist, year, genres, styles,
        album_thumbnail, discogs_url, date_added, date_changed,
        track_count, label, catalog_number, country, format,
        album_notes, album_rating, purchase_price, condition, library_identifier
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      ON CONFLICT (release_id, friend_id)
      DO UPDATE SET
        title = EXCLUDED.title,
        artist = EXCLUDED.artist,
        year = EXCLUDED.year,
        genres = EXCLUDED.genres,
        styles = EXCLUDED.styles,
        album_thumbnail = EXCLUDED.album_thumbnail,
        discogs_url = EXCLUDED.discogs_url,
        date_added = EXCLUDED.date_added,
        date_changed = EXCLUDED.date_changed,
        track_count = EXCLUDED.track_count,
        label = EXCLUDED.label,
        catalog_number = EXCLUDED.catalog_number,
        country = EXCLUDED.country,
        format = EXCLUDED.format,
        ${manualUpdateSql}
        updated_at = current_timestamp
      RETURNING *
      `,
      [
        album.release_id,
        album.friend_id,
        album.title,
        album.artist,
        album.year,
        album.genres,
        album.styles,
        album.album_thumbnail,
        album.discogs_url,
        album.date_added,
        album.date_changed,
        album.track_count,
        album.label,
        album.catalog_number,
        album.country,
        album.format,
        album.album_notes ?? null,
        album.album_rating ?? null,
        album.purchase_price ?? null,
        album.condition ?? null,
        album.library_identifier ?? null,
      ]
    );

    return result.rows[0] as Album;
  }

  async updateAlbumFields(
    client: Queryable,
    params: {
      release_id: string;
      friend_id: number;
      album_rating?: number;
      album_notes?: string;
      purchase_price?: number;
      condition?: string;
      library_identifier?: string | null;
    }
  ): Promise<Album | null> {
    const {
      release_id,
      friend_id,
      album_rating,
      album_notes,
      purchase_price,
      condition,
      library_identifier,
    } = params;

    const updates: string[] = [];
    const values: (string | number | null)[] = [release_id, friend_id];
    let paramIndex = 3;

    if (album_rating !== undefined) {
      updates.push(`album_rating = $${paramIndex}`);
      values.push(album_rating);
      paramIndex += 1;
    }
    if (album_notes !== undefined) {
      updates.push(`album_notes = $${paramIndex}`);
      values.push(album_notes);
      paramIndex += 1;
    }
    if (purchase_price !== undefined) {
      updates.push(`purchase_price = $${paramIndex}`);
      values.push(purchase_price);
      paramIndex += 1;
    }
    if (condition !== undefined) {
      updates.push(`condition = $${paramIndex}`);
      values.push(condition);
      paramIndex += 1;
    }
    if (library_identifier !== undefined) {
      updates.push(`library_identifier = $${paramIndex}`);
      values.push(library_identifier);
      paramIndex += 1;
    }

    if (updates.length === 0) return null;
    updates.push("updated_at = current_timestamp");

    const query = `
      UPDATE albums
      SET ${updates.join(", ")}
      WHERE release_id = $1 AND friend_id = $2
      RETURNING *
    `;
    const result = await client.query(query, values);
    return (result.rows[0] as Album | undefined) ?? null;
  }

  async getTracksForAlbumWithLibraryIdentifier(
    releaseId: string,
    friendId: number
  ): Promise<Track[]> {
    const { rows } = await dbQuery<Track>(
      `
      SELECT t.*, a.library_identifier, ${trackGenresSelectSql("t")}
      FROM tracks t
      LEFT JOIN albums a ON t.release_id = a.release_id AND t.friend_id = a.friend_id
      WHERE t.release_id = $1 AND t.friend_id = $2
      `,
      [releaseId, friendId]
    );
    return rows;
  }

  async insertTrack(client: Queryable, values: unknown[]): Promise<Track> {
    const result = await client.query(
      `INSERT INTO tracks (
        track_id, friend_id, username, title, artist, album, year,
        styles, genres, duration, duration_seconds, position,
        discogs_url, apple_music_url, youtube_url, soundcloud_url,
        album_thumbnail, local_tags, bpm, key, notes, star_rating, release_id,
        library_identifier
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24
      )
      RETURNING *`,
      values
    );
    return result.rows[0] as Track;
  }

  async upsertTrackByTrackIdUsername(
    client: Queryable,
    values: unknown[]
  ): Promise<Track> {
    const result = await client.query(
      `INSERT INTO tracks (
        track_id, friend_id, username, title, artist, album, year,
        styles, genres, duration, duration_seconds, position,
        discogs_url, apple_music_url, youtube_url, soundcloud_url,
        album_thumbnail, local_tags, bpm, key, notes, star_rating, release_id,
        library_identifier
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24
      )
      ON CONFLICT (track_id, username)
      DO UPDATE SET
        title = EXCLUDED.title,
        artist = EXCLUDED.artist,
        album = EXCLUDED.album,
        year = EXCLUDED.year,
        styles = EXCLUDED.styles,
        genres = EXCLUDED.genres,
        duration = EXCLUDED.duration,
        duration_seconds = EXCLUDED.duration_seconds,
        position = EXCLUDED.position,
        apple_music_url = EXCLUDED.apple_music_url,
        youtube_url = EXCLUDED.youtube_url,
        soundcloud_url = EXCLUDED.soundcloud_url,
        album_thumbnail = EXCLUDED.album_thumbnail,
        local_tags = EXCLUDED.local_tags,
        bpm = EXCLUDED.bpm,
        key = EXCLUDED.key,
        notes = EXCLUDED.notes,
        star_rating = EXCLUDED.star_rating,
        library_identifier = EXCLUDED.library_identifier
      RETURNING *`,
      values
    );
    return result.rows[0] as Track;
  }

  async getAlbumThumbnail(
    releaseId: string,
    friendId: number
  ): Promise<string | null> {
    const { rows } = await dbQuery<{ album_thumbnail: string | null }>(
      "SELECT album_thumbnail FROM albums WHERE release_id = $1 AND friend_id = $2",
      [releaseId, friendId]
    );
    return rows[0]?.album_thumbnail ?? null;
  }

  async listTrackIdsForAlbum(
    releaseId: string,
    friendId: number
  ): Promise<string[]> {
    const { rows } = await dbQuery<{ track_id: string }>(
      "SELECT track_id FROM tracks WHERE release_id = $1 AND friend_id = $2",
      [releaseId, friendId]
    );
    return rows.map((row) => row.track_id);
  }

  async deleteTracksByIds(
    client: Queryable,
    trackIds: string[],
    friendId: number
  ): Promise<void> {
    if (trackIds.length === 0) return;
    await client.query(
      "DELETE FROM tracks WHERE track_id = ANY($1) AND friend_id = $2",
      [trackIds, friendId]
    );
  }

  async getTracksForAlbumDownloadQueue(
    releaseId: string,
    friendId: number
  ): Promise<
    Array<{
      track_id: string;
      friend_id: number;
      apple_music_url: string | null;
      youtube_url: string | null;
      soundcloud_url: string | null;
      title: string | null;
      artist: string | null;
    }>
  > {
    const { rows } = await dbQuery<{
      track_id: string;
      friend_id: number;
      apple_music_url: string | null;
      youtube_url: string | null;
      soundcloud_url: string | null;
      title: string | null;
      artist: string | null;
    }>(
      `
      SELECT track_id, friend_id, apple_music_url, youtube_url, soundcloud_url, title, artist
      FROM tracks
      WHERE release_id = $1
        AND friend_id = $2
        AND (local_audio_url IS NULL OR local_audio_url = '')
        AND (
          apple_music_url IS NOT NULL OR
          youtube_url IS NOT NULL OR
          soundcloud_url IS NOT NULL
        )
      ORDER BY position
      `,
      [releaseId, friendId]
    );
    return rows;
  }

  async updateAlbumCoverForRelease(
    friendId: number,
    releaseId: string,
    publicUrl: string
  ): Promise<number> {
    const result = await dbQuery(
      `
      UPDATE tracks
      SET audio_file_album_art_url = $1
      WHERE friend_id = $2
        AND release_id::text = $3::text
      `,
      [publicUrl, friendId, releaseId]
    );
    return result.rowCount || 0;
  }

  async updateAlbumAudioFileAlbumArtUrl(
    releaseId: string,
    friendId: number,
    publicUrl: string
  ): Promise<void> {
    await dbQuery(
      `UPDATE albums SET audio_file_album_art_url = $1 WHERE release_id = $2 AND friend_id = $3`,
      [publicUrl, releaseId, friendId]
    );
  }

  async getTracksForReleaseWithAudio(
    friendId: number,
    releaseId: string
  ): Promise<
    Array<{
      track_id: string;
      friend_id: number;
      release_id: string;
      local_audio_url: string | null;
    }>
  > {
    const { rows } = await dbQuery<{
      track_id: string;
      friend_id: number;
      release_id: string;
      local_audio_url: string | null;
    }>(
      `
      SELECT track_id, friend_id, release_id, local_audio_url
      FROM tracks
      WHERE friend_id = $1
        AND release_id::text = $2::text
        AND local_audio_url IS NOT NULL
        AND local_audio_url <> ''
      ORDER BY track_id
      `,
      [friendId, releaseId]
    );
    return rows;
  }

  async listAlbumsWithTrackCountZero(): Promise<AlbumCleanupRow[]> {
    const { rows } = await dbQuery<AlbumCleanupRow>(
      `
      SELECT release_id, friend_id, title, artist, track_count
      FROM albums
      WHERE track_count = 0
      `
    );
    return rows;
  }

  async listOrphanedAlbums(): Promise<AlbumCleanupRow[]> {
    const { rows } = await dbQuery<AlbumCleanupRow>(
      `
      SELECT a.release_id, a.friend_id, a.title, a.artist, a.track_count
      FROM albums a
      LEFT JOIN tracks t ON a.release_id = t.release_id AND a.friend_id = t.friend_id
      WHERE t.track_id IS NULL
      `
    );
    return rows;
  }

  async deleteAlbumByReleaseAndFriend(
    client: Queryable,
    releaseId: string,
    friendId: number
  ): Promise<void> {
    await client.query(
      "DELETE FROM albums WHERE release_id = $1 AND friend_id = $2",
      [releaseId, friendId]
    );
  }

  async deleteAlbumsByFriendAndReleaseIds(
    friendId: number,
    releaseIds: string[]
  ): Promise<number> {
    if (releaseIds.length === 0) return 0;
    const result = await dbQuery(
      "DELETE FROM albums WHERE friend_id = $1 AND release_id = ANY($2::text[])",
      [friendId, releaseIds]
    );
    return result.rowCount ?? 0;
  }

}

export const albumRepository = new AlbumRepository();

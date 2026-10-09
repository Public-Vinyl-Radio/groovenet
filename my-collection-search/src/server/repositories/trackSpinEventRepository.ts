import { dbQuery } from "@/lib/serverDb";
import type { Queryable } from "@/server/repositories/spinSessionRepository";
import { hasVectorsSelectSql, trackGenresSelectSql } from "@/server/repositories/trackGenreRepository";
import type { TrackGenre } from "@/types/track";

export type TrackSpinEventRow = {
  id: number;
  session_id: number;
  friend_id: number;
  release_id: string;
  track_id: string;
  played_at: Date | string;
  ordinal: number;
  side_key: string | null;
  position_snapshot: string | null;
  title_snapshot: string;
  artist_snapshot: string;
  album_snapshot: string;
  created_at: Date | string;
};

export type TopTrackSpinEventRow = {
  friend_id: number;
  release_id: string;
  track_id: string;
  play_count: number;
  last_played_at: Date | string;
  title_snapshot: string;
  artist_snapshot: string;
  album_snapshot: string;
  side_key: string | null;
  position_snapshot: string | null;
  album_thumbnail?: string | null;
  audio_file_album_art_url?: string | null;
  local_audio_url?: string | null;
  bpm?: number | string | null;
  key?: string | null;
  star_rating?: number | null;
  styles?: string[];
  library_identifier?: string | null;
  hasVectors?: boolean;
  track_genres?: TrackGenre[];
};

export type CreateTrackSpinEventInput = {
  friend_id: number;
  release_id: string;
  track_id: string;
  played_at: string | Date;
  ordinal: number;
  side_key?: string | null;
  position_snapshot?: string | null;
  title_snapshot: string;
  artist_snapshot: string;
  album_snapshot: string;
};

export class TrackSpinEventRepository {
  async insertEvents(
    client: Queryable,
    sessionId: number,
    events: CreateTrackSpinEventInput[]
  ): Promise<TrackSpinEventRow[]> {
    if (events.length === 0) return [];

    const values: string[] = [];
    const params: Array<number | string | Date | null> = [sessionId];
    let paramIndex = 2;

    for (const event of events) {
      values.push(
        `($1, $${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9})`
      );
      params.push(
        event.friend_id,
        event.release_id,
        event.track_id,
        event.played_at,
        event.ordinal,
        event.side_key ?? null,
        event.position_snapshot ?? null,
        event.title_snapshot,
        event.artist_snapshot,
        event.album_snapshot
      );
      paramIndex += 10;
    }

    const { rows } = await client.query<TrackSpinEventRow>(
      `
      INSERT INTO track_spin_events (
        session_id, friend_id, release_id, track_id, played_at, ordinal, side_key,
        position_snapshot, title_snapshot, artist_snapshot, album_snapshot
      )
      VALUES ${values.join(", ")}
      RETURNING *
      `,
      params
    );

    return rows;
  }

  async deleteEventsBySessionId(client: Queryable, sessionId: number): Promise<void> {
    await client.query("DELETE FROM track_spin_events WHERE session_id = $1", [sessionId]);
  }

  /** Move a session's events with it when only its time is corrected. */
  async setPlayedAtForSession(
    client: Queryable,
    sessionId: number,
    playedAt: string | Date
  ): Promise<TrackSpinEventRow[]> {
    const { rows } = await client.query<TrackSpinEventRow>(
      `UPDATE track_spin_events SET played_at = $2 WHERE session_id = $1
       RETURNING *`,
      [sessionId, playedAt]
    );
    return rows.sort((a, b) => a.ordinal - b.ordinal);
  }

  async listEventsBySessionIds(sessionIds: number[]): Promise<TrackSpinEventRow[]> {
    if (sessionIds.length === 0) return [];

    const { rows } = await dbQuery<TrackSpinEventRow>(
      `
      SELECT *
      FROM track_spin_events
      WHERE session_id = ANY($1::int[])
      ORDER BY session_id ASC, ordinal ASC, id ASC
      `,
      [sessionIds]
    );

    return rows;
  }

  async listTopTracks(filters: {
    friend_id: number;
    release_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<TopTrackSpinEventRow[]> {
    const whereClauses = ["tse.friend_id = $1"];
    const params: Array<number | string> = [filters.friend_id];

    if (filters.release_id) {
      params.push(filters.release_id);
      whereClauses.push(`tse.release_id = $${params.length}`);
    }

    params.push(filters.limit ?? 20);
    const limitRef = `$${params.length}`;
    params.push(filters.offset ?? 0);
    const offsetRef = `$${params.length}`;

    const { rows } = await dbQuery<TopTrackSpinEventRow>(
      `
      WITH aggregated AS (
        SELECT
          tse.friend_id,
          tse.release_id,
          tse.track_id,
          COUNT(*)::int AS play_count,
          MAX(tse.played_at) AS last_played_at
        FROM track_spin_events tse
        WHERE ${whereClauses.join(" AND ")}
        GROUP BY tse.friend_id, tse.release_id, tse.track_id
      )
      SELECT
        aggregated.friend_id,
        aggregated.release_id,
        aggregated.track_id,
        aggregated.play_count,
        aggregated.last_played_at,
        latest.title_snapshot,
        latest.artist_snapshot,
        latest.album_snapshot,
        latest.side_key,
        latest.position_snapshot,
        t.album_thumbnail,
        t.audio_file_album_art_url,
        t.local_audio_url,
        t.bpm,
        t.key,
        t.star_rating,
        COALESCE(t.styles, '{}') AS styles,
        COALESCE(a.library_identifier, t.library_identifier) AS library_identifier,
        ${hasVectorsSelectSql("aggregated")},
        ${trackGenresSelectSql("aggregated")}
      FROM aggregated
      INNER JOIN LATERAL (
        SELECT
          tse.title_snapshot,
          tse.artist_snapshot,
          tse.album_snapshot,
          tse.side_key,
          tse.position_snapshot
        FROM track_spin_events tse
        WHERE tse.friend_id = aggregated.friend_id
          AND tse.release_id = aggregated.release_id
          AND tse.track_id = aggregated.track_id
        ORDER BY tse.played_at DESC, tse.id DESC
        LIMIT 1
      ) latest ON TRUE
      LEFT JOIN tracks t
        ON t.track_id = aggregated.track_id AND t.friend_id = aggregated.friend_id
      LEFT JOIN albums a
        ON a.release_id = t.release_id AND a.friend_id = t.friend_id
      ORDER BY aggregated.play_count DESC, aggregated.last_played_at DESC, aggregated.track_id ASC
      LIMIT ${limitRef}
      OFFSET ${offsetRef}
      `,
      params
    );

    return rows;
  }
}

export const trackSpinEventRepository = new TrackSpinEventRepository();

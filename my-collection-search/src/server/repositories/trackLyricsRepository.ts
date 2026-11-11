import type { TrackLyricsSource } from "@groovenet/contracts";
import { dbQuery } from "@/lib/serverDb";

export type TrackLyricsRow = {
  text: string;
  source: TrackLyricsSource;
  updated_at: Date | string;
};

/**
 * `track_lyrics` (#673, #1171): the only reads and person-made writes of the
 * side table. The embedded re-read writes it through
 * `trackRepository.saveEmbeddedTags`, which never touches a `user` row.
 */
export class TrackLyricsRepository {
  /** The username of the library holding the track, or null when there is no such track. */
  async findTrackLibrary(trackId: string, friendId: number): Promise<string | null> {
    const { rows } = await dbQuery<{ username: string }>(
      `SELECT f.username
         FROM tracks t
         JOIN friends f ON f.id = t.friend_id
        WHERE t.track_id = $1 AND t.friend_id = $2
        LIMIT 1`,
      [trackId, friendId],
    );
    return rows[0]?.username ?? null;
  }

  async find(trackId: string, friendId: number): Promise<TrackLyricsRow | null> {
    const { rows } = await dbQuery<TrackLyricsRow>(
      `SELECT lyrics AS text, source, updated_at
         FROM track_lyrics
        WHERE track_id = $1 AND friend_id = $2`,
      [trackId, friendId],
    );
    return rows[0] ?? null;
  }

  /** Write a person's lyrics. `source = 'user'` is what keeps a re-read off them. */
  async saveUserLyrics(trackId: string, friendId: number, text: string): Promise<TrackLyricsRow> {
    const { rows } = await dbQuery<TrackLyricsRow>(
      `INSERT INTO track_lyrics (track_id, friend_id, lyrics, source)
       VALUES ($1, $2, $3, 'user')
       ON CONFLICT (track_id, friend_id) DO UPDATE
         SET lyrics = EXCLUDED.lyrics, source = 'user', updated_at = now()
       RETURNING lyrics AS text, source, updated_at`,
      [trackId, friendId, text],
    );
    return rows[0];
  }

  /**
   * Drop the row whatever its source, so the next tag read can fill it from the
   * file again. Returns whether there was a row.
   */
  async delete(trackId: string, friendId: number): Promise<boolean> {
    const { rowCount } = await dbQuery(
      `DELETE FROM track_lyrics WHERE track_id = $1 AND friend_id = $2`,
      [trackId, friendId],
    );
    return (rowCount ?? 0) > 0;
  }
}

export const trackLyricsRepository = new TrackLyricsRepository();

import { dbQuery, withDbTransaction } from "@/lib/serverDb";
import type { GenreSimilarityEntry, GenreSimilaritySignals } from "@/lib/genres/genreSimilarity";

export type GenreCoOccurrenceRow = { genre_id_a: string; genre_id_b: string; shared_albums: number };
export type GenreAlbumCountRow = { genre_id: string; album_count: number };

export type GenreCoOccurrenceData = {
  pairs: GenreCoOccurrenceRow[];
  albumCounts: GenreAlbumCountRow[];
  totalAlbums: number;
};

export type GenreSimilarityRow = { related_genre_id: string; score: number; signals: GenreSimilaritySignals };

/**
 * Every album's genre set (#377): the taxonomy genres linked to any of its
 * live tracks, plus its own Discogs genres/styles mapped onto the taxonomy
 * by name or alias. One row per (album, genre) — a heavily-tagged album
 * still counts once per genre, never once per track (#448).
 */
const ALBUM_GENRE_CTE = `
  WITH genre_keys AS (
    SELECT normalized_name AS key, id AS genre_id FROM genres
    UNION
    SELECT alias_normalized, genre_id FROM genre_aliases
  ),
  album_genre AS (
    SELECT DISTINCT t.release_id, t.friend_id, tg.genre_id
    FROM tracks t
    JOIN track_genres tg ON tg.track_id = t.track_id AND tg.friend_id = t.friend_id
    WHERE t.deleted_at IS NULL AND t.release_id IS NOT NULL
    UNION
    SELECT DISTINCT a.release_id, a.friend_id, k.genre_id
    FROM albums a
    CROSS JOIN LATERAL unnest(COALESCE(a.genres, '{}') || COALESCE(a.styles, '{}')) AS d(name)
    JOIN genre_keys k ON k.key = genre_normalize(d.name)
  )
`;

export class GenreSimilarityRepository {
  /** Distinct-album co-occurrence counts, per-genre album counts, and the collection's total album count. */
  async loadCoOccurrence(): Promise<GenreCoOccurrenceData> {
    return withDbTransaction(async (client) => {
      const [pairs, albumCounts, total] = await Promise.all([
        client.query<GenreCoOccurrenceRow>(`
          ${ALBUM_GENRE_CTE}
          SELECT g1.genre_id::text AS genre_id_a, g2.genre_id::text AS genre_id_b, COUNT(*)::integer AS shared_albums
          FROM album_genre g1
          JOIN album_genre g2
            ON g1.release_id = g2.release_id AND g1.friend_id = g2.friend_id AND g1.genre_id < g2.genre_id
          GROUP BY g1.genre_id, g2.genre_id
        `),
        client.query<GenreAlbumCountRow>(`
          ${ALBUM_GENRE_CTE}
          SELECT genre_id::text AS genre_id, COUNT(*)::integer AS album_count
          FROM album_genre
          GROUP BY genre_id
        `),
        client.query<{ total: number }>(`SELECT COUNT(*)::integer AS total FROM albums`),
      ]);
      return { pairs: pairs.rows, albumCounts: albumCounts.rows, totalAlbums: total.rows[0]?.total ?? 0 };
    });
  }

  /** Recomputes the whole table in one transaction (#377): idempotent, a second run with the same inputs writes the same rows. */
  async replaceAll(entries: GenreSimilarityEntry[]): Promise<void> {
    await withDbTransaction(async (client) => {
      await client.query("DELETE FROM genre_similarity");
      if (entries.length === 0) return;
      const genreIds = entries.map((e) => e.genre_id);
      const relatedIds = entries.map((e) => e.related_genre_id);
      const scores = entries.map((e) => e.score);
      const signals = entries.map((e) => JSON.stringify(e.signals));
      await client.query(
        `
        INSERT INTO genre_similarity (genre_id, related_genre_id, score, signals)
        SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::real[], $4::jsonb[])
        `,
        [genreIds, relatedIds, scores, signals]
      );
    });
  }

  /** A genre's stored related genres, best first; empty when the table has no rows for it. */
  async topForGenre(genreId: string, limit: number): Promise<GenreSimilarityRow[]> {
    const { rows } = await dbQuery<GenreSimilarityRow>(
      `SELECT related_genre_id::text AS related_genre_id, score, signals
       FROM genre_similarity WHERE genre_id = $1::uuid ORDER BY score DESC LIMIT $2`,
      [genreId, limit]
    );
    return rows;
  }
}

export const genreSimilarityRepository = new GenreSimilarityRepository();

import { albumTaxonomySelectSql } from "@/lib/genres/albumTaxonomySql";
import { dbQuery } from "@/lib/serverDb";
import {
  hasVectorsSelectSql,
  trackGenresSelectSql,
} from "@/server/repositories/trackGenreRepository";
import type { ArtistPageResponse } from "@/api-contract/schemas";

export type ArtistPageAlbumRow = Record<string, unknown> & {
  play_count: number;
  appears_on_tracks: number;
  appears_on_positions: string[];
};
export type ArtistPageTrackRow = Record<string, unknown> & { play_count: number };
export type ArtistPageCounts = ArtistPageResponse["counts"];

/** `$1` is the artist; `$2`, when present, the friend whose collection to read. */
function scope(artistId: number, friendId: number | undefined) {
  const params: unknown[] = [artistId];
  if (friendId !== undefined) params.push(friendId);
  return { params, friend: friendId === undefined ? "" : "$2" };
}

/**
 * What a friend's collection holds by one artist (#707). The artist is
 * shared, so everything here is scoped by the albums' and tracks' owners:
 * `friendId` undefined means every collection.
 *
 * An artist is credited on an album (`album_artists`) or on individual tracks
 * (`track_artists`, the compilation case). A track counts as theirs when it
 * carries their credit, or sits on an album credited to them with no track
 * credits of its own.
 */
export class ArtistPageRepository {
  /** The artist's visible tracks as `(track_id, friend_id, release_id)`. */
  private tracksCte(friend: string) {
    return `
      my_tracks AS (
        SELECT t.track_id, t.friend_id, t.release_id
        FROM tracks t
        WHERE t.deleted_at IS NULL ${friend ? `AND t.friend_id = ${friend}` : ""}
          AND (
            EXISTS (SELECT 1 FROM track_artists ta
                    WHERE ta.track_id = t.track_id AND ta.friend_id = t.friend_id
                      AND ta.artist_id = $1)
            OR (
              NOT EXISTS (SELECT 1 FROM track_artists ta
                          WHERE ta.track_id = t.track_id AND ta.friend_id = t.friend_id)
              AND EXISTS (SELECT 1 FROM albums a JOIN album_artists aa ON aa.album_id = a.id
                          WHERE a.release_id = t.release_id AND a.friend_id = t.friend_id
                            AND aa.artist_id = $1)
            )
          )
      )`;
  }

  async counts(artistId: number, friendId: number | undefined): Promise<ArtistPageCounts> {
    const { params, friend } = scope(artistId, friendId);
    const { rows } = await dbQuery<ArtistPageCounts>(
      `
      WITH ${this.tracksCte(friend)},
      credited AS (
        SELECT a.release_id, a.friend_id, a.year FROM albums a
        JOIN album_artists aa ON aa.album_id = a.id
        WHERE aa.artist_id = $1 ${friend ? `AND a.friend_id = ${friend}` : ""}
      ),
      appears AS (
        SELECT DISTINCT a.release_id, a.friend_id, a.year
        FROM my_tracks mt JOIN albums a ON a.release_id = mt.release_id AND a.friend_id = mt.friend_id
        WHERE NOT EXISTS (SELECT 1 FROM credited c
                          WHERE c.release_id = a.release_id AND c.friend_id = a.friend_id)
      ),
      years AS (
        SELECT year::integer AS year
        FROM (SELECT year FROM credited UNION ALL SELECT year FROM appears) y
        WHERE year ~ '^[0-9]{4}$' AND year::integer > 0
      )
      SELECT
        (SELECT count(*) FROM credited)::integer AS albums,
        (SELECT count(*) FROM appears)::integer AS appears_on,
        (SELECT count(*) FROM my_tracks)::integer AS tracks,
        (SELECT count(*) FROM track_spin_events e
         JOIN my_tracks mt ON mt.track_id = e.track_id AND mt.friend_id = e.friend_id)::integer AS spins,
        (SELECT min(year) FROM years) AS year_min,
        (SELECT max(year) FROM years) AS year_max
      `,
      params,
    );
    return rows[0];
  }

  /** Credited albums first (newest first), then the albums the artist only appears on. */
  async albums(artistId: number, friendId: number | undefined): Promise<ArtistPageAlbumRow[]> {
    const { params, friend } = scope(artistId, friendId);
    const { rows } = await dbQuery<ArtistPageAlbumRow>(
      `
      WITH ${this.tracksCte(friend)},
      on_tracks AS (
        SELECT mt.release_id, mt.friend_id, count(*)::integer AS n,
          array_agg(COALESCE(t.position, '') ORDER BY t.position, t.track_id) AS positions
        FROM my_tracks mt JOIN tracks t ON t.track_id = mt.track_id AND t.friend_id = mt.friend_id
        GROUP BY mt.release_id, mt.friend_id
      )
      SELECT a.*, a.purchase_price::double precision AS purchase_price,
        ${albumTaxonomySelectSql("a")},
        COALESCE(p.play_count, 0)::integer AS play_count,
        CASE WHEN aa.artist_id IS NULL THEN COALESCE(ot.n, 0) ELSE 0 END AS appears_on_tracks,
        CASE WHEN aa.artist_id IS NULL THEN COALESCE(ot.positions, '{}') ELSE '{}' END AS appears_on_positions
      FROM albums a
      LEFT JOIN album_artists aa ON aa.album_id = a.id AND aa.artist_id = $1
      LEFT JOIN on_tracks ot ON ot.release_id = a.release_id AND ot.friend_id = a.friend_id
      LEFT JOIN (
        SELECT release_id, friend_id, count(*) AS play_count
        FROM track_spin_events GROUP BY release_id, friend_id
      ) p ON p.release_id = a.release_id AND p.friend_id = a.friend_id
      WHERE (aa.artist_id IS NOT NULL OR ot.n IS NOT NULL)
        ${friend ? `AND a.friend_id = ${friend}` : ""}
      ORDER BY (aa.artist_id IS NULL), a.year DESC NULLS LAST, a.date_added DESC NULLS LAST,
        a.release_id ASC, a.friend_id ASC
      `,
      params,
    );
    return rows;
  }

  /** Most played first; with no plays, in album order. */
  async topTracks(
    artistId: number,
    friendId: number | undefined,
    limit: number,
  ): Promise<ArtistPageTrackRow[]> {
    const { params, friend } = scope(artistId, friendId);
    params.push(limit);
    const { rows } = await dbQuery<ArtistPageTrackRow>(
      `
      WITH ${this.tracksCte(friend)}
      SELECT t.*, COALESCE(t.album, '') AS album, COALESCE(t.duration, '') AS duration,
        COALESCE(t.position, '') AS position, COALESCE(t.genres, '{}'::text[]) AS genres,
        COALESCE(t.styles, '{}'::text[]) AS styles,
        CASE WHEN t.bpm > 0 AND t.bpm < 'Infinity'::real THEN t.bpm ELSE NULL END AS bpm,
        ${hasVectorsSelectSql("t")}, ${trackGenresSelectSql("t")},
        COALESCE(p.play_count, 0)::integer AS play_count
      FROM my_tracks mt
      JOIN tracks t ON t.track_id = mt.track_id AND t.friend_id = mt.friend_id
      LEFT JOIN (
        SELECT track_id, friend_id, count(*) AS play_count
        FROM track_spin_events GROUP BY track_id, friend_id
      ) p ON p.track_id = t.track_id AND p.friend_id = t.friend_id
      ORDER BY play_count DESC, t.release_id ASC, t.position ASC NULLS LAST, t.track_id ASC
      LIMIT $${params.length}
      `,
      params,
    );
    return rows;
  }

  /** Genres on the artist's tracks, most tracks first. */
  async genres(
    artistId: number,
    friendId: number | undefined,
    limit: number,
  ): Promise<ArtistPageResponse["genres"]> {
    const { params, friend } = scope(artistId, friendId);
    params.push(limit);
    const { rows } = await dbQuery<ArtistPageResponse["genres"][number]>(
      `
      WITH ${this.tracksCte(friend)}
      SELECT g.id, g.name, g.slug, count(*)::integer AS track_count
      FROM my_tracks mt
      JOIN track_genres tg ON tg.track_id = mt.track_id AND tg.friend_id = mt.friend_id
      JOIN genres g ON g.id = tg.genre_id
      GROUP BY g.id, g.name, g.slug
      ORDER BY track_count DESC, g.name ASC
      LIMIT $${params.length}
      `,
      params,
    );
    return rows;
  }

  /**
   * Artists credited on the same album or track, by shared credits. Placeholder
   * artists never count. An album credit and a track credit are separate
   * shared credits.
   */
  async collaborators(
    artistId: number,
    friendId: number | undefined,
    limit: number,
  ): Promise<ArtistPageResponse["collaborators"]> {
    const { params, friend } = scope(artistId, friendId);
    params.push(limit);
    const { rows } = await dbQuery<ArtistPageResponse["collaborators"][number]>(
      `
      WITH shared AS (
        SELECT other.artist_id, 'a' || a.id AS credit
        FROM album_artists mine
        JOIN albums a ON a.id = mine.album_id
        JOIN album_artists other
          ON other.album_id = mine.album_id AND other.artist_id <> mine.artist_id
        WHERE mine.artist_id = $1 ${friend ? `AND a.friend_id = ${friend}` : ""}
        UNION
        SELECT other.artist_id, 't' || mine.track_id || ':' || mine.friend_id
        FROM track_artists mine
        JOIN tracks t ON t.track_id = mine.track_id AND t.friend_id = mine.friend_id
        JOIN track_artists other ON other.track_id = mine.track_id
          AND other.friend_id = mine.friend_id AND other.artist_id <> mine.artist_id
        WHERE mine.artist_id = $1 AND t.deleted_at IS NULL
          ${friend ? `AND t.friend_id = ${friend}` : ""}
      )
      SELECT ar.id, ar.name, ar.slug, count(*)::integer AS shared_credits
      FROM shared s JOIN artists ar ON ar.id = s.artist_id
      WHERE NOT ar.is_placeholder
      GROUP BY ar.id, ar.name, ar.slug
      ORDER BY shared_credits DESC, ar.sort_name ASC
      LIMIT $${params.length}
      `,
      params,
    );
    return rows;
  }
}

export const artistPageRepository = new ArtistPageRepository();

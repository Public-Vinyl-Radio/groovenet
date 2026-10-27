import { albumTaxonomySelectSql } from "@/lib/genres/albumTaxonomySql";
import { effectiveAlbumTaxonomySql } from "@/lib/genres/albumTaxonomySql";
import { dbQuery } from "@/lib/serverDb";
import {
  albumGenreFilterClause,
  discogsGenreMatchSql,
  trackGenreFilterClause,
  type GenreFilter,
} from "@/lib/trackFilterSpec";
import { hasVectorsSelectSql, trackGenresSelectSql } from "@/server/repositories/trackGenreRepository";
import { VINYL_SESSIONS_SQL } from "@/server/repositories/trackSpinEventRepository";
import type { GenrePageResponse } from "@/api-contract/schemas";

export type GenrePageCounts = {
  /** Live tracks linked to this genre itself. */
  tracks: number;
  /** Albums whose effective genres or styles name this genre, or an alias of it. */
  albums: number;
  /** Albums the genre filter returns, subgenres included. */
  albums_total: number;
};

export type GenrePageTrackRow = Record<string, unknown> & { play_count: number };
export type GenrePageAlbumRow = Record<string, unknown> & { play_count: number };

/** Builds `$n` placeholders over one shared parameter list. */
function binder(params: unknown[]) {
  return (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
}

/** The genre page's reads (#376), each optionally scoped to one friend's collection. */
export class GenrePageRepository {
  /** Full-set aggregates, using search's EXISTS filter to count each track once.
   * date_added is the imported collection timestamp (not created_at). The DB
   * stores it without a timezone; boundaries are explicit UTC calendar dates.
   */
  async stats(filter: GenreFilter, friendId: number | undefined, year: number): Promise<GenrePageResponse["stats"]> {
    const params: unknown[] = [];
    const bind = binder(params);
    const where = ["t.deleted_at IS NULL", trackGenreFilterClause(filter, bind, "t")];
    if (friendId !== undefined) where.push(`t.friend_id = ${bind(friendId)}`);
    const start = bind(`${year}-01-01`);
    const end = bind(`${year + 1}-01-01`);
    const { rows } = await dbQuery<Omit<GenrePageResponse["stats"], "year">>(`
      WITH matching AS MATERIALIZED (
        SELECT t.bpm, t.date_added, t.local_audio_url
        FROM tracks t WHERE ${where.join(" AND ")}
      ), valid_bpm AS (
        SELECT bpm FROM matching WHERE bpm > 0 AND bpm < 'Infinity'::real
      ), bins AS (
        SELECT floor(bpm::double precision / 10) * 10 AS min, count(*)::integer AS count
        FROM valid_bpm GROUP BY 1
      )
      SELECT
        (SELECT min(bpm) FROM valid_bpm) AS bpm_min,
        (SELECT max(bpm) FROM valid_bpm) AS bpm_max,
        (SELECT count(*) FROM matching WHERE date_added >= ${start}::timestamp AND date_added < ${end}::timestamp)::integer AS added_this_year,
        (SELECT count(*) FROM matching WHERE NULLIF(btrim(local_audio_url), '') IS NOT NULL)::integer AS playable_tracks,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('min', min, 'max', min + 10, 'count', count) ORDER BY min) FROM bins), '[]'::jsonb) AS bpm_histogram
    `, params);
    return { ...rows[0], year };
  }

  /**
   * The page's counts in one round trip. `ownKeys` are the genre's own
   * normalised name and aliases; `filter` is the genre with its subgenres.
   */
  async counts(input: {
    genreId: string;
    ownKeys: string[];
    filter: GenreFilter;
    friendId?: number;
  }): Promise<GenrePageCounts> {
    const params: unknown[] = [];
    const bind = binder(params);
    const friend = input.friendId === undefined ? null : bind(input.friendId);
    const trackFriend = friend ? `AND t.friend_id = ${friend}` : "";
    const albumFriend = friend ? `AND a.friend_id = ${friend}` : "";

    const { rows } = await dbQuery<GenrePageCounts>(
      `
      SELECT
        (
          SELECT COUNT(*)
          FROM track_genres tg
          JOIN tracks t ON t.track_id = tg.track_id AND t.friend_id = tg.friend_id
          WHERE tg.genre_id = ${bind(input.genreId)}::uuid AND t.deleted_at IS NULL ${trackFriend}
        )::integer AS tracks,
        (
          SELECT COUNT(*) FROM albums a
          WHERE ${discogsGenreMatchSql(effectiveAlbumTaxonomySql("a"), bind(input.ownKeys))}
            ${albumFriend}
        )::integer AS albums,
        (
          SELECT COUNT(*) FROM albums a
          WHERE ${albumGenreFilterClause(input.filter, bind, "a")} ${albumFriend}
        )::integer AS albums_total
      `,
      params
    );
    return rows[0];
  }

  /**
   * Tracks the genre filter returns, most played first. Tracks never played
   * follow, most recently added first, so a genre with no spins still shows
   * what's newest in it.
   */
  async topTracks(filter: GenreFilter, friendId: number | undefined, limit: number): Promise<GenrePageTrackRow[]> {
    const params: unknown[] = [];
    const bind = binder(params);
    const where = ["t.deleted_at IS NULL", trackGenreFilterClause(filter, bind, "t")];
    if (friendId !== undefined) where.push(`t.friend_id = ${bind(friendId)}`);

    const { rows } = await dbQuery<GenrePageTrackRow>(
      `
      SELECT t.*, ${hasVectorsSelectSql("t")}, ${trackGenresSelectSql("t")}, COALESCE(p.play_count, 0)::integer AS play_count
      FROM tracks t
      LEFT JOIN (
        SELECT track_id, friend_id, COUNT(*) AS play_count
        FROM track_spin_events
        WHERE session_id IN ${VINYL_SESSIONS_SQL}
        GROUP BY track_id, friend_id
      ) p ON p.track_id = t.track_id AND p.friend_id = t.friend_id
      WHERE ${where.join(" AND ")}
      ORDER BY play_count DESC, t.date_added DESC NULLS LAST, t.track_id ASC
      LIMIT ${bind(limit)}
      `,
      params
    );
    return rows;
  }

  /** Albums the genre filter returns, ordered like `topTracks` by spins of any of their tracks. */
  async topAlbums(filter: GenreFilter, friendId: number | undefined, limit: number): Promise<GenrePageAlbumRow[]> {
    const params: unknown[] = [];
    const bind = binder(params);
    const where = [albumGenreFilterClause(filter, bind, "a")];
    if (friendId !== undefined) where.push(`a.friend_id = ${bind(friendId)}`);

    const { rows } = await dbQuery<GenrePageAlbumRow>(
      `
      SELECT a.*, a.purchase_price::double precision AS purchase_price,
        ${albumTaxonomySelectSql("a")}, COALESCE(p.play_count, 0)::integer AS play_count
      FROM albums a
      LEFT JOIN (
        SELECT release_id, friend_id, COUNT(*) AS play_count
        FROM track_spin_events
        WHERE session_id IN ${VINYL_SESSIONS_SQL}
        GROUP BY release_id, friend_id
      ) p ON p.release_id = a.release_id AND p.friend_id = a.friend_id
      WHERE ${where.join(" AND ")}
      ORDER BY play_count DESC, a.date_added DESC NULLS LAST, a.created_at DESC NULLS LAST, a.release_id ASC
      LIMIT ${bind(limit)}
      `,
      params
    );
    return rows;
  }
}

export const genrePageRepository = new GenrePageRepository();

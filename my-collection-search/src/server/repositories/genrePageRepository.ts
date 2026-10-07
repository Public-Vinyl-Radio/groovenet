import { dbQuery } from "@/lib/serverDb";
import {
  albumGenreFilterClause,
  discogsGenreMatchSql,
  trackGenreFilterClause,
  type GenreFilter,
} from "@/lib/trackFilterSpec";
import { trackGenresSelectSql } from "@/server/repositories/trackGenreRepository";

export type GenrePageCounts = {
  /** Live tracks linked to this genre itself. */
  tracks: number;
  /** Albums whose own Discogs genres or styles name this genre, or an alias of it. */
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
          WHERE ${discogsGenreMatchSql("COALESCE(a.genres, '{}') || COALESCE(a.styles, '{}')", bind(input.ownKeys))}
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
      SELECT t.*, ${trackGenresSelectSql("t")}, COALESCE(p.play_count, 0)::integer AS play_count
      FROM tracks t
      LEFT JOIN (
        SELECT track_id, friend_id, COUNT(*) AS play_count
        FROM track_spin_events
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
      SELECT a.*, COALESCE(p.play_count, 0)::integer AS play_count
      FROM albums a
      LEFT JOIN (
        SELECT release_id, friend_id, COUNT(*) AS play_count
        FROM track_spin_events
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

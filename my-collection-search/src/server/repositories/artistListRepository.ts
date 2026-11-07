import type { ArtistListItem } from "@/api-contract/schemas";
import { normaliseArtistName } from "@/lib/artists/normalization";
import { dbQuery } from "@/lib/serverDb";

export type ArtistListFilter = {
  q: string;
  friendId?: number;
  includePlaceholders: boolean;
};

/** `%` and `_` in a user's query match themselves, not any character. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * The artist list (#710): artists matching a name or any alias they are
 * credited under, with what the chosen collection holds by them. Artists are
 * shared, so with a friend the list keeps only those credited in that
 * collection; without one it lists every artist. Merged artists are hidden.
 */
export class ArtistListRepository {
  private matched(filter: ArtistListFilter) {
    const params: unknown[] = [];
    const add = (value: unknown) => `$${params.push(value)}`;
    const friend = filter.friendId === undefined ? null : add(filter.friendId);
    // A merged artist is a redirect to its survivor, not a list entry.
    const where: string[] = ["ar.merged_into IS NULL"];
    if (!filter.includePlaceholders) where.push("NOT ar.is_placeholder");
    let exact = "false";
    const normalized = normaliseArtistName(filter.q);
    if (filter.q) {
      const name = add(likePattern(filter.q));
      const alias = add(likePattern(normalized));
      where.push(`(ar.name ILIKE ${name} OR EXISTS (
        SELECT 1 FROM artist_aliases al
        WHERE al.artist_id = ar.id AND al.alias_normalized LIKE ${alias}))`);
      exact = `lower(ar.name) = lower(${add(filter.q)})`;
      if (normalized) {
        exact += ` OR EXISTS (SELECT 1 FROM artist_aliases al
          WHERE al.artist_id = ar.id AND al.alias_normalized = ${add(normalized)})`;
      }
      exact = `(${exact})`;
    }
    if (friend) where.push("(COALESCE(alb.n, 0) + COALESCE(trk.n, 0)) > 0");
    const sql = `
      WITH alb AS (
        SELECT aa.artist_id, count(DISTINCT a.id)::integer AS n
        FROM album_artists aa JOIN albums a ON a.id = aa.album_id
        ${friend ? `WHERE a.friend_id = ${friend}` : ""}
        GROUP BY aa.artist_id
      ),
      trk AS (
        SELECT ta.artist_id, count(*)::integer AS n
        FROM (SELECT DISTINCT artist_id, track_id, friend_id FROM track_artists) ta
        JOIN tracks t ON t.track_id = ta.track_id AND t.friend_id = ta.friend_id
        WHERE t.deleted_at IS NULL ${friend ? `AND t.friend_id = ${friend}` : ""}
        GROUP BY ta.artist_id
      ),
      matched AS (
        SELECT ar.id, ar.name, ar.sort_name, ar.slug,
          ar.discogs_artist_id::text AS discogs_artist_id, ar.is_placeholder,
          COALESCE(alb.n, 0) AS album_count, COALESCE(trk.n, 0) AS track_count,
          ${exact} AS exact
        FROM artists ar
        LEFT JOIN alb ON alb.artist_id = ar.id
        LEFT JOIN trk ON trk.artist_id = ar.id
        WHERE ${where.join(" AND ")}
      )`;
    return { sql, params };
  }

  /** One page, exact name or alias matches first, then by sort name. */
  async search(filter: ArtistListFilter, limit: number, offset: number): Promise<ArtistListItem[]> {
    const { sql, params } = this.matched(filter);
    params.push(limit, offset);
    const { rows } = await dbQuery<ArtistListItem & { exact?: boolean }>(
      `${sql}
      SELECT id, name, sort_name, slug, discogs_artist_id, is_placeholder, album_count, track_count
      FROM matched
      ORDER BY exact DESC, lower(sort_name) ASC, id ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return rows;
  }

  async count(filter: ArtistListFilter): Promise<number> {
    const { sql, params } = this.matched(filter);
    const { rows } = await dbQuery<{ total: number }>(
      `${sql} SELECT count(*)::integer AS total FROM matched`,
      params,
    );
    return rows[0]?.total ?? 0;
  }
}

export const artistListRepository = new ArtistListRepository();

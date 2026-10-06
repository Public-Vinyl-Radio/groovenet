import { dbQuery, withDbTransaction } from "@/lib/serverDb";
import type { GenreFilter } from "@/lib/trackFilterSpec";

export type GenreSource = "discogs" | "custom";

export type GenreRow = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  source: GenreSource;
  track_count: number;
  album_count: number;
  /** Normalised alias keys, so a client can match raw Discogs spellings (#376). */
  aliases: string[];
};

/** How many tracks a genre filter would return, subgenres included (#375). */
export type GenreFacet = { id: string; track_count: number };

export type GenreTreeNode = GenreRow & { children: GenreTreeNode[] };

/** Converts the flat, parent-keyed database representation into the API tree. */
export function buildGenreTree(rows: GenreRow[]): GenreTreeNode[] {
  const nodes = new Map<string, GenreTreeNode>();
  for (const row of rows) nodes.set(row.id, { ...row, children: [] });

  const roots: GenreTreeNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id)!;
    if (row.parent_id === null) {
      roots.push(node);
      continue;
    }

    const parent = nodes.get(row.parent_id);
    if (!parent) throw new Error(`Genre '${row.id}' has no parent '${row.parent_id}'`);
    parent.children.push(node);
  }

  return roots;
}

export class GenreRepository {
  async listTree(): Promise<GenreTreeNode[]> {
    return buildGenreTree(await this.listFlat());
  }

  /** Every taxonomy genre with its usage counts, parent-keyed, by name. */
  async listFlat(): Promise<GenreRow[]> {
    // Direct links only: a parent's count does not include its subgenres'.
    // Albums are those with at least one live track linked to the genre.
    const { rows } = await dbQuery<GenreRow>(`
      SELECT
        g.id,
        g.name,
        g.slug,
        g.parent_id,
        g.source,
        COALESCE(c.track_count, 0)::integer AS track_count,
        COALESCE(c.album_count, 0)::integer AS album_count,
        COALESCE(a.aliases, '{}') AS aliases
      FROM genres g
      LEFT JOIN (
        SELECT
          tg.genre_id,
          COUNT(*) AS track_count,
          COUNT(DISTINCT (t.release_id, t.friend_id))
            FILTER (WHERE t.release_id IS NOT NULL) AS album_count
        FROM track_genres tg
        JOIN tracks t ON t.track_id = tg.track_id AND t.friend_id = tg.friend_id
        WHERE t.deleted_at IS NULL
        GROUP BY tg.genre_id
      ) c ON c.genre_id = g.id
      LEFT JOIN (
        SELECT genre_id, array_agg(alias_normalized ORDER BY alias_normalized) AS aliases
        FROM genre_aliases
        GROUP BY genre_id
      ) a ON a.genre_id = g.id
      ORDER BY g.name ASC
    `);
    return rows;
  }

  /** Taxonomy ids by slug, for the slugs that exist. */
  async findIdsBySlug(slugs: string[]): Promise<Map<string, string>> {
    if (slugs.length === 0) return new Map();
    const { rows } = await dbQuery<{ slug: string; id: string }>(
      "SELECT slug, id::text AS id FROM genres WHERE slug = ANY($1::text[])",
      [slugs]
    );
    return new Map(rows.map((row) => [row.slug, row.id]));
  }

  /**
   * A genre filter for `genreIds`: those genres and every genre beneath them,
   * with the normalised names and aliases that raw Discogs values match on.
   */
  async expandToFilter(genreIds: string[]): Promise<GenreFilter> {
    const { rows } = await dbQuery<{ ids: string[] | null; keys: string[] | null }>(
      `
      WITH RECURSIVE tree AS (
        SELECT id FROM genres WHERE id = ANY($1::uuid[])
        UNION
        SELECT g.id FROM genres g JOIN tree ON g.parent_id = tree.id
      )
      SELECT
        (SELECT array_agg(id::text ORDER BY id) FROM tree) AS ids,
        (SELECT array_agg(key ORDER BY key) FROM (
          SELECT g.normalized_name AS key FROM genres g WHERE g.id IN (SELECT id FROM tree)
          UNION
          SELECT a.alias_normalized FROM genre_aliases a WHERE a.genre_id IN (SELECT id FROM tree)
        ) keys) AS keys
      `,
      [genreIds]
    );
    return { ids: rows[0]?.ids ?? [], keys: rows[0]?.keys ?? [] };
  }

  /**
   * Per-genre track counts over the tracks `where` selects (clauses over
   * `tracks t`). Each track counts under the genres the filter matches it on —
   * its own links, else its Discogs genres and styles through names and
   * aliases — and under every ancestor of those, once. So a genre's count is
   * exactly what adding it as a filter would return.
   */
  async trackFacets(where: string[], params: unknown[]): Promise<GenreFacet[]> {
    return withDbTransaction(async (client) => {
      // Postgres JIT-compiles this plan for ~200 ms to save a few: measured
      // at 290 ms with JIT and 55 ms without, over one friend's 3.8k tracks.
      // Transaction-local, so a pooled connection never carries it onward.
      await client.query("SELECT set_config('jit', 'off', true)");
      const { rows } = await client.query<GenreFacet>(
      `
      WITH RECURSIVE matched AS (
        SELECT t.track_id, t.friend_id, t.genres, t.styles
        FROM tracks t
        WHERE ${[...where, "t.deleted_at IS NULL"].join(" AND ")}
      ),
      genre_keys AS (
        SELECT normalized_name AS key, id AS genre_id FROM genres
        UNION
        SELECT alias_normalized, genre_id FROM genre_aliases
      ),
      track_genre AS (
        SELECT m.track_id, m.friend_id, tg.genre_id
        FROM matched m
        JOIN track_genres tg ON tg.track_id = m.track_id AND tg.friend_id = m.friend_id
        UNION
        SELECT m.track_id, m.friend_id, k.genre_id
        FROM matched m
        CROSS JOIN LATERAL unnest(COALESCE(m.genres, '{}') || COALESCE(m.styles, '{}')) AS d(name)
        JOIN genre_keys k ON k.key = genre_normalize(d.name)
        WHERE NOT EXISTS (
          SELECT 1 FROM track_genres tg WHERE tg.track_id = m.track_id AND tg.friend_id = m.friend_id
        )
      ),
      lineage AS (
        SELECT id AS genre_id, id AS ancestor_id, parent_id FROM genres
        UNION
        SELECT l.genre_id, g.id, g.parent_id FROM lineage l JOIN genres g ON g.id = l.parent_id
      )
      SELECT l.ancestor_id::text AS id, COUNT(DISTINCT (tg.track_id, tg.friend_id))::integer AS track_count
      FROM track_genre tg
      JOIN lineage l ON l.genre_id = tg.genre_id
      GROUP BY l.ancestor_id
      ORDER BY track_count DESC, id
      `,
        params
      );
      return rows;
    });
  }
}

export const genreRepository = new GenreRepository();

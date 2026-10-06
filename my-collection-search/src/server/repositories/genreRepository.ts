import { dbQuery } from "@/lib/serverDb";

export type GenreSource = "discogs" | "custom";

export type GenreRow = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  source: GenreSource;
  track_count: number;
  album_count: number;
};

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
        COALESCE(c.album_count, 0)::integer AS album_count
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
      ORDER BY g.name ASC
    `);
    return buildGenreTree(rows);
  }
}

export const genreRepository = new GenreRepository();

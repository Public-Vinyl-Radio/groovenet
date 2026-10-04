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
    // #371 introduces track_genres and #375 adds album/track filtering. Until
    // then taxonomy entries deliberately report zero links rather than trying
    // to infer DJ-facing genres from the broad Discogs arrays on tracks.
    const { rows } = await dbQuery<GenreRow>(`
      SELECT
        id,
        name,
        slug,
        parent_id,
        source,
        0::integer AS track_count,
        0::integer AS album_count
      FROM genres
      ORDER BY name ASC
    `);
    return buildGenreTree(rows);
  }
}

export const genreRepository = new GenreRepository();

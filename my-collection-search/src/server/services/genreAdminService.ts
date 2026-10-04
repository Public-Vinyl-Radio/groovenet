import { withDbTransaction } from "@/lib/serverDb";
import type { PoolClient } from "pg";
import { normalizeGenreName } from "@/lib/genres/normalization";

export type GenreAdminRow = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  source: "discogs" | "custom";
};

export class GenreAdminError extends Error {
  constructor(message: string, public readonly status: 404 | 409) {
    super(message);
  }
}

const columns = "id, name, slug, parent_id, source";
const slug = (name: string) => name.normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function mutate<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
  try {
    return await withDbTransaction(async (client) => {
      // Serialize this small admin-only taxonomy's writes. Row locks alone
      // cannot protect an absent alias or two concurrent opposing tree moves.
      await client.query("LOCK TABLE genres, genre_aliases IN SHARE ROW EXCLUSIVE MODE");
      return action(client);
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      throw new GenreAdminError("Genre name, slug or alias already exists", 409);
    }
    throw error;
  }
}

async function find(client: PoolClient, id: string): Promise<GenreAdminRow> {
  const result = await client.query<GenreAdminRow>(`SELECT ${columns} FROM genres WHERE id = $1`, [id]);
  const row = result.rows[0];
  if (!row) throw new GenreAdminError("Genre not found", 404);
  return row;
}

async function checkName(client: PoolClient, name: string, id?: string) {
  if (!normalizeGenreName(name) || !slug(name)) throw new GenreAdminError("Genre name must produce a nonempty URL slug", 409);
  const { rows } = await client.query(
    "SELECT genre_id FROM genre_aliases WHERE alias_normalized = $1",
    [normalizeGenreName(name)]
  );
  if (rows.length && rows[0].genre_id !== id) throw new GenreAdminError("Genre name is already an alias", 409);
}

async function checkCycle(client: PoolClient, id: string, parentId: string) {
  if (id === parentId) throw new GenreAdminError("A genre cannot be its own parent or merge target", 409);
  const { rows } = await client.query<{ cycle: boolean }>(
    `WITH RECURSIVE descendants AS (
       SELECT id FROM genres WHERE parent_id = $1
       UNION
       SELECT g.id FROM genres g JOIN descendants d ON g.parent_id = d.id
     ) SELECT EXISTS (SELECT 1 FROM descendants WHERE id = $2) AS cycle`,
    [id, parentId]
  );
  if (rows[0].cycle) throw new GenreAdminError("A genre cannot be moved or merged below one of its descendants", 409);
}

export async function createGenre(name: string, parentId: string): Promise<GenreAdminRow> {
  return mutate(async (client) => {
    await find(client, parentId);
    await checkName(client, name);
    const result = await client.query<GenreAdminRow>(
      `INSERT INTO genres (name, normalized_name, slug, parent_id, source)
       VALUES ($1, $2, $3, $4, 'custom') RETURNING ${columns}`,
      [name.trim(), normalizeGenreName(name), slug(name), parentId]
    );
    return result.rows[0];
  });
}

export async function updateGenre(id: string, input: { name?: string; parent_id?: string | null }): Promise<GenreAdminRow> {
  return mutate(async (client) => {
    const existing = await find(client, id);
    const name = input.name?.trim() ?? existing.name;
    const parentId = input.parent_id === undefined ? existing.parent_id : input.parent_id;
    if (parentId !== null && parentId !== existing.parent_id) {
      await checkCycle(client, id, parentId);
      await find(client, parentId);
    }
    await checkName(client, name, id);
    const result = await client.query<GenreAdminRow>(
      `UPDATE genres SET name=$1, normalized_name=$2, slug=$3, parent_id=$4
       WHERE id=$5 RETURNING ${columns}`,
      [name, normalizeGenreName(name), slug(name), parentId, id]
    );
    // Renaming to an alias owned by this genre promotes it to canonical.
    await client.query("DELETE FROM genre_aliases WHERE alias_normalized=$1 AND genre_id=$2", [normalizeGenreName(name), id]);
    if (normalizeGenreName(name) !== normalizeGenreName(existing.name)) {
      await client.query(
        `INSERT INTO genre_aliases (alias_normalized, genre_id, source)
         VALUES ($1,$2,'manual') ON CONFLICT DO NOTHING`,
        [normalizeGenreName(existing.name), id]
      );
    }
    return result.rows[0];
  });
}

export async function addGenreAlias(id: string, alias: string): Promise<void> {
  await mutate(async (client) => {
    await find(client, id);
    const normalized = normalizeGenreName(alias);
    const { rows } = await client.query("SELECT id FROM genres WHERE normalized_name=$1", [normalized]);
    if (rows.length) throw new GenreAdminError("Alias is already a canonical genre name", 409);
    const existing = await client.query("SELECT genre_id FROM genre_aliases WHERE alias_normalized=$1", [normalized]);
    if (existing.rows.length) {
      if (existing.rows[0].genre_id !== id) throw new GenreAdminError("Alias already belongs to another genre", 409);
      return;
    }
    await client.query(
      "INSERT INTO genre_aliases (alias_normalized, genre_id, source) VALUES ($1,$2,'manual')",
      [normalized, id]
    );
  });
}

export async function mergeGenres(sourceId: string, targetId: string): Promise<void> {
  await mutate(async (client) => {
    const source = await find(client, sourceId);
    await find(client, targetId);
    await checkCycle(client, sourceId, targetId);
    await client.query("UPDATE genres SET parent_id=$1 WHERE parent_id=$2", [targetId, sourceId]);
    await client.query("UPDATE genre_aliases SET genre_id=$1 WHERE genre_id=$2", [targetId, sourceId]);
    await client.query(
      `INSERT INTO genre_aliases (alias_normalized, genre_id, source)
       VALUES ($1,$2,'manual') ON CONFLICT DO NOTHING`,
      [normalizeGenreName(source.name), targetId]
    );
    // #371 will add movement of track_genres links here once that table exists.
    await client.query("DELETE FROM genres WHERE id=$1", [sourceId]);
  });
}

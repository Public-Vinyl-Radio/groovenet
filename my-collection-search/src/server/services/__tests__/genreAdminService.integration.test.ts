import { afterAll, describe, expect, it } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { addGenreAlias, createGenre, mergeGenres, updateGenre } from "../genreAdminService";
import { up } from "../../../../migrations/1791300000000_add_genre_taxonomy.js";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
afterAll(async () => { if (process.env.RUN_DB_TESTS === "1") await dbPool.end(); });

async function latin() {
  const { rows } = await dbQuery<{ id: string }>("SELECT id FROM genres WHERE normalized_name='latin'");
  return rows[0].id;
}

async function cleanup() {
  await dbQuery("DELETE FROM genre_aliases WHERE genre_id IN (SELECT id FROM genres WHERE name LIKE 'Taxonomy Test %')");
  await dbQuery("UPDATE genres SET parent_id=NULL WHERE name LIKE 'Taxonomy Test %'");
  await dbQuery("DELETE FROM genres WHERE name LIKE 'Taxonomy Test %'");
}

describe("taxonomy database invariants", () => {
  dbTest("seed is idempotent including IDs and timestamps", async () => {
    const snapshot = async () => ({
      genres: (await dbQuery("SELECT * FROM genres ORDER BY id")).rows,
      aliases: (await dbQuery("SELECT * FROM genre_aliases ORDER BY alias_normalized")).rows,
    });
    const before = await snapshot();
    const statements: string[] = [];
    // Replay exactly the migration's seed statements without recreating tables.
    up({ createTable() {}, addConstraint() {}, createIndex() {}, func: (value: string) => value, sql: (sql: string) => statements.push(sql) });
    for (const sql of statements) await dbQuery(sql);
    expect(await snapshot()).toEqual(before);
  });

  dbTest("creates, renames, re-parents, aliases and merges with consistent lookups", async () => {
    await cleanup();
    try {
      const root = await latin();
      const source = await createGenre("Taxonomy Test Source", root);
      const child = await createGenre("Taxonomy Test Child", source.id);
      const target = await createGenre("Taxonomy Test Target", root);
      await addGenreAlias(source.id, "Taxonomy Test Post‑punk");
      await addGenreAlias(source.id, "Taxonomy Test Post-punk");
      await expect(addGenreAlias(target.id, "Taxonomy Test Post-punk")).rejects.toMatchObject({ status: 409 });
      await expect(addGenreAlias(target.id, source.name)).rejects.toMatchObject({ status: 409 });
      await expect(createGenre("Taxonomy Test Source", root)).rejects.toMatchObject({ status: 409 });
      await expect(createGenre("Taxonomy-Test-Source", root)).rejects.toMatchObject({ status: 409 });
      await expect(updateGenre(source.id, { parent_id: child.id })).rejects.toMatchObject({ status: 409 });
      await expect(mergeGenres(source.id, child.id)).rejects.toMatchObject({ status: 409 });
      await updateGenre(source.id, { name: "Taxonomy Test Renamed", parent_id: null });
      await mergeGenres(source.id, target.id);
      expect((await dbQuery("SELECT parent_id FROM genres WHERE id=$1", [child.id])).rows[0].parent_id).toBe(target.id);
      expect((await dbQuery("SELECT id FROM genres WHERE id=$1", [source.id])).rows).toEqual([]);
      expect((await dbQuery("SELECT alias_normalized, genre_id FROM genre_aliases WHERE genre_id=$1 ORDER BY alias_normalized", [target.id])).rows).toEqual([
        { alias_normalized: "taxonomy test post-punk", genre_id: target.id },
        { alias_normalized: "taxonomy test renamed", genre_id: target.id },
        { alias_normalized: "taxonomy test source", genre_id: target.id },
      ]);
      // Restoring an owned alias removes its alias row and preserves the old name.
      await updateGenre(target.id, { name: "Taxonomy Test Source" });
      expect((await dbQuery("SELECT * FROM genre_aliases WHERE alias_normalized='taxonomy test source'")).rows).toEqual([]);
    } finally { await cleanup(); }
  });

  dbTest("serializes concurrent edits so opposing parent moves cannot create a cycle", async () => {
    await cleanup();
    try {
      const root = await latin();
      const a = await createGenre("Taxonomy Test Concurrent A", root);
      const b = await createGenre("Taxonomy Test Concurrent B", root);
      const results = await Promise.allSettled([
        updateGenre(a.id, { parent_id: b.id }), updateGenre(b.id, { parent_id: a.id }),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    } finally { await cleanup(); }
  });

  dbTest("rolls back child and alias moves if the final delete fails", async () => {
    await cleanup();
    try {
      const root = await latin();
      const source = await createGenre("Taxonomy Test Rollback", root);
      const child = await createGenre("Taxonomy Test Rollback Child", source.id);
      const target = await createGenre("Taxonomy Test Rollback Target", root);
      await addGenreAlias(source.id, "Taxonomy Test Rollback Alias");
      await dbQuery("CREATE TABLE genre_test_blocker (genre_id uuid REFERENCES genres(id))");
      await dbQuery("INSERT INTO genre_test_blocker VALUES ($1)", [source.id]);
      await expect(mergeGenres(source.id, target.id)).rejects.toMatchObject({ code: "23503" });
      expect((await dbQuery("SELECT parent_id FROM genres WHERE id=$1", [child.id])).rows[0].parent_id).toBe(source.id);
      expect((await dbQuery("SELECT genre_id FROM genre_aliases WHERE alias_normalized='taxonomy test rollback alias'")).rows[0].genre_id).toBe(source.id);
      expect((await dbQuery("SELECT * FROM genre_aliases WHERE alias_normalized='taxonomy test rollback'")).rows).toEqual([]);
      expect((await dbQuery("SELECT id FROM genres WHERE id=$1", [source.id])).rows).toHaveLength(1);
    } finally {
      await dbQuery("DROP TABLE IF EXISTS genre_test_blocker");
      await cleanup();
    }
  });
});

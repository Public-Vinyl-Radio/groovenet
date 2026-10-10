import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { trackGenreRepository, trackGenreIdsSelectSql } from "../trackGenreRepository";
import { genreRepository, type GenreTreeNode } from "../genreRepository";
import { trackRepository } from "../trackRepository";
import { addGenreAlias, createGenre, mergeGenres } from "@/server/services/genreAdminService";

// Real-database checks for track genre links (#371): what a mocked driver
// would accept but Postgres might not — the uuid[] casts, the composite
// foreign key, the correlated json_agg, and links moving on a merge.
const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const USERNAME = "track-genres-test";
let friendId: number;

async function genreId(name: string): Promise<string> {
  const { rows } = await dbQuery<{ id: string }>("SELECT id FROM genres WHERE name = $1", [name]);
  return rows[0].id;
}

function findNode(nodes: GenreTreeNode[], id: string): GenreTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findNode(node.children, id);
    if (child) return child;
  }
  return undefined;
}

async function cleanup() {
  await dbQuery("DELETE FROM tracks WHERE username = $1", [USERNAME]);
  await dbQuery("DELETE FROM genre_aliases WHERE alias_normalized LIKE 'track genre test %'");
  await dbQuery("DELETE FROM genres WHERE name LIKE 'Track Genre Test %'");
  await dbQuery("DELETE FROM friends WHERE username = $1", [USERNAME]);
}

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  const { rows } = await dbQuery<{ id: number }>(
    "INSERT INTO friends (username) VALUES ($1) RETURNING id",
    [USERNAME]
  );
  friendId = rows[0].id;
  for (const [trackId, releaseId] of [["tg-1", "r-1"], ["tg-2", "r-1"], ["tg-3", "r-2"]]) {
    await dbQuery(
      `INSERT INTO tracks (track_id, username, friend_id, title, artist, release_id)
       VALUES ($1, $2, $3, 'Title', 'Artist', $4)`,
      [trackId, USERNAME, friendId, releaseId]
    );
  }
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});

describe("track genre links", () => {
  dbTest("resolves ids, names and aliases, and leaves unknown names unknown", async () => {
    const salsa = await genreId("Salsa");
    const cumbia = await genreId("Cumbia");
    await addGenreAlias(cumbia, "Track Genre Test Cumbia Colombiana");

    const result = await trackGenreRepository.resolveGenreRefs([
      salsa,
      "SALSA",
      "track genre test cumbia  colombiana",
      "Feminist Anthem",
    ]);
    expect(result).toEqual({ ids: [salsa, cumbia], unknown: ["Feminist Anthem"] });
  });

  dbTest("a canonical name wins over the seed alias spelled the same", async () => {
    const result = await trackGenreRepository.resolveGenreRefs(["Bossanova"]);
    expect(result.ids).toEqual([await genreId("Bossanova")]);
  });

  dbTest("replaces links, keeps an existing link's source, and returns them on reads", async () => {
    const latin = await genreId("Latin");
    const cumbia = await genreId("Cumbia");
    const salsa = await genreId("Salsa");

    await trackGenreRepository.replaceTrackGenres("tg-1", friendId, [cumbia, salsa], "reconciliation");
    await trackGenreRepository.replaceTrackGenres("tg-1", friendId, [cumbia], "manual");

    const { rows } = await dbQuery("SELECT genre_id, source FROM track_genres WHERE track_id = 'tg-1'");
    expect(rows).toEqual([{ genre_id: cumbia, source: "reconciliation" }]);

    const track = await trackRepository.findTrackByTrackIdAndFriendId("tg-1", friendId);
    expect(track?.track_genres).toEqual([
      { id: cumbia, name: "Cumbia", slug: "cumbia", parent_id: latin, parent_name: "Latin" },
    ]);
    expect(track?.descriptors).toEqual([]);

    const untagged = await trackRepository.findTrackByTrackIdAndFriendId("tg-3", friendId);
    expect(untagged?.track_genres).toEqual([]);

    const [batch] = await trackRepository.findTracksByRefsPreservingOrder([{ track_id: "tg-1", friend_id: friendId }]);
    expect(batch.track_genres).toHaveLength(1);
  });

  dbTest("stores descriptors through the field update", async () => {
    const updated = await trackRepository.updateTrackFields({
      track_id: "tg-2",
      friend_id: friendId,
      descriptors: ["uplifting", "cinematic"],
    });
    expect(updated?.descriptors).toEqual(["uplifting", "cinematic"]);
  });

  dbTest("rejects a link to a genre that does not exist", async () => {
    await expect(
      trackGenreRepository.replaceTrackGenres("tg-1", friendId, ["00000000-0000-4000-8000-000000000000"], "manual")
    ).rejects.toMatchObject({ code: "23503" });
  });

  dbTest("counts live tracks and albums, and moves links to the survivor on merge", async () => {
    const latin = await genreId("Latin");
    const source = await createGenre("Track Genre Test Source", latin);
    const target = await createGenre("Track Genre Test Target", latin);

    await trackGenreRepository.replaceTrackGenres("tg-1", friendId, [source.id], "manual");
    await trackGenreRepository.replaceTrackGenres("tg-2", friendId, [source.id, target.id], "manual");
    await trackGenreRepository.replaceTrackGenres("tg-3", friendId, [source.id], "manual");
    await trackRepository.softDeleteTrack("tg-3", friendId);

    const before = findNode(await genreRepository.listTree(), source.id);
    expect(before).toMatchObject({ track_count: 2, album_count: 1 });

    await mergeGenres(source.id, target.id);

    const { rows } = await dbQuery(
      "SELECT track_id FROM track_genres WHERE genre_id = $1 ORDER BY track_id",
      [target.id]
    );
    expect(rows.map((row) => row.track_id)).toEqual(["tg-1", "tg-2", "tg-3"]);
    expect(findNode(await genreRepository.listTree(), target.id)).toMatchObject({ track_count: 2, album_count: 1 });
  });

  dbTest("lists each genre's normalised aliases on the tree, and none for a genre without (#376)", async () => {
    const cumbia = await genreId("Cumbia");
    await addGenreAlias(cumbia, "Track Genre Test Cumbia Colombiana");

    const tree = await genreRepository.listTree();
    expect(findNode(tree, cumbia)?.aliases).toContain("track genre test cumbia colombiana");
    const bare = await createGenre("Track Genre Test Bare", cumbia);
    expect(findNode(await genreRepository.listTree(), bare.id)?.aliases).toEqual([]);
  });

  dbTest("counts the genres on a release's other live tracks (#374)", async () => {
    const cumbia = await genreId("Cumbia");
    const salsa = await genreId("Salsa");
    await trackGenreRepository.replaceTrackGenres("tg-1", friendId, [cumbia, salsa], "enrichment");
    await trackGenreRepository.replaceTrackGenres("tg-2", friendId, [cumbia], "manual");

    expect(await trackGenreRepository.listReleaseGenreCounts("r-1", friendId, "tg-2")).toEqual([
      { name: "Cumbia", track_count: 1 },
      { name: "Salsa", track_count: 1 },
    ]);
    expect(await trackGenreRepository.listReleaseGenreCounts("r-1", friendId, "none")).toEqual([
      { name: "Cumbia", track_count: 2 },
      { name: "Salsa", track_count: 1 },
    ]);
    expect(await trackGenreRepository.listReleaseGenreCounts("r-2", friendId, "none")).toEqual([]);
  });

  dbTest("a linked genre cannot be deleted outright", async () => {
    const cumbia = await genreId("Cumbia");
    await trackGenreRepository.replaceTrackGenres("tg-2", friendId, [cumbia], "manual");
    await expect(dbQuery("DELETE FROM genres WHERE id = $1", [cumbia])).rejects.toMatchObject({ code: "23503" });
  });

  dbTest(
    "trackGenreIdsSelectSql combines track_genres with styles resolved onto the taxonomy, each with its parent (#486)",
    async () => {
      const latin = await genreId("Latin");
      const cumbia = await genreId("Cumbia");
      const salsa = await genreId("Salsa");
      await trackGenreRepository.replaceTrackGenres("tg-1", friendId, [cumbia], "manual");
      await dbQuery("UPDATE tracks SET styles = $1 WHERE track_id = 'tg-1' AND friend_id = $2", [
        ["SALSA"],
        friendId,
      ]);

      const { rows } = await dbQuery<{
        track_genre_ids: Array<{ id: string; parent_id: string | null }>;
      }>(`SELECT ${trackGenreIdsSelectSql("t")} FROM tracks t WHERE t.track_id = 'tg-1' AND t.friend_id = $1`, [
        friendId,
      ]);

      const byId = new Map(rows[0].track_genre_ids.map((g) => [g.id, g.parent_id]));
      expect([...byId.keys()].sort()).toEqual([cumbia, salsa].sort());
      expect(byId.get(cumbia)).toBe(latin);
      expect(byId.get(salsa)).toBe(latin);
    }
  );

  dbTest("trackGenreIdsSelectSql never yields null for a track with no genres or styles (#486)", async () => {
    // tg-3 picked up a link from an earlier test's merge; this test only cares
    // about the no-genres-and-no-styles shape, so it clears both first.
    await trackGenreRepository.replaceTrackGenres("tg-3", friendId, [], "manual");
    await dbQuery("UPDATE tracks SET styles = NULL WHERE track_id = 'tg-3' AND friend_id = $1", [friendId]);

    const { rows } = await dbQuery<{ track_genre_ids: unknown[] }>(
      `SELECT ${trackGenreIdsSelectSql("t")} FROM tracks t WHERE t.track_id = 'tg-3' AND t.friend_id = $1`,
      [friendId]
    );
    expect(rows[0].track_genre_ids).toEqual([]);
  });
});

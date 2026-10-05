/**
 * Library-scoped track suggestions against a real Postgres: the library
 * filter inside the vector scan, single seed and centroid; soft-deleted
 * tracks never suggested; ivfflat settings kept to their transaction; and the
 * `recommendation_settings` table with its scope CHECK. A mocked driver
 * accepts any of this SQL. Run with `just embedding-versions-test`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbPool, dbQuery, withDbClient } from "@/lib/serverDb";
import { EmbeddingsRepository } from "../embeddingsRepository";
import { RecommendationRepository } from "../recommendationRepository";
import { SettingsRepository } from "../settingsRepository";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const embeddings = new EmbeddingsRepository();
const recommendations = new RecommendationRepository();
const settings = new SettingsRepository();

// No partial index exists for this model, so 3-dim vectors are fine.
const MODEL = "recommendation-scope-test-model";
const MINE = "scope-test-mine";
const THEIRS = "scope-test-theirs";
let mine = 0;
let theirs = 0;

const query = { model: MODEL, templateVersion: 1, dims: 3, limit: 10, ivfflatProbes: 10 };
const ids = (rows: Array<{ track_id: string }>) => rows.map((r) => r.track_id);

async function cleanup() {
  await dbQuery(`DELETE FROM track_embeddings WHERE model = $1`, [MODEL]);
  await dbQuery(`DELETE FROM tracks WHERE username IN ($1, $2)`, [MINE, THEIRS]);
  await dbQuery(`DELETE FROM friends WHERE username IN ($1, $2)`, [MINE, THEIRS]);
}

async function addTrack(friendId: number, username: string, id: string, vector: number[], deleted = false) {
  await dbQuery(
    `INSERT INTO tracks (track_id, username, friend_id, title, artist, deleted_at)
     VALUES ($1, $2, $3, $1, 'A', $4)`,
    [id, username, friendId, deleted ? new Date() : null]
  );
  await embeddings.upsertTrackEmbedding({
    trackId: id, friendId, embeddingType: "identity", model: MODEL, dims: 3,
    embedding: vector, sourceHash: "h", identityText: id, templateVersion: 1,
  });
}

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  const { rows } = await dbQuery<{ id: number; username: string }>(
    `INSERT INTO friends (username) VALUES ($1), ($2) RETURNING id, username`,
    [MINE, THEIRS]
  );
  mine = rows.find((r) => r.username === MINE)!.id;
  theirs = rows.find((r) => r.username === THEIRS)!.id;

  await addTrack(mine, MINE, "seed", [1, 0, 0]);
  await addTrack(mine, MINE, "mine-near", [0.9, 0.1, 0]);
  await addTrack(mine, MINE, "mine-far", [0.2, 1, 0]);
  await addTrack(mine, MINE, "mine-deleted", [1, 0.01, 0], true);
  // Closer to the seed than anything of mine: today's bug surfaced exactly these.
  await addTrack(theirs, THEIRS, "theirs-closest", [1, 0.02, 0]);
  await addTrack(theirs, THEIRS, "theirs-near", [0.95, 0.05, 0]);
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});

describe("library-scoped suggestions (integration)", () => {
  dbTest("without a library, every library is searched, nearest first, minus deleted tracks", async () => {
    const rows = await recommendations.findIdentitySimilar({ ...query, seedTrackId: "seed", seedFriendId: mine });
    expect(ids(rows)).toEqual(["theirs-closest", "theirs-near", "mine-near", "mine-far"]);
  });

  dbTest("a library keeps one seed's suggestions to it", async () => {
    const rows = await recommendations.findIdentitySimilar({
      ...query, seedTrackId: "seed", seedFriendId: mine, libraryFriendId: mine,
    });
    expect(ids(rows)).toEqual(["mine-near", "mine-far"]);
    expect(rows.every((r) => r.friend_id === mine)).toBe(true);
  });

  dbTest("the seed may come from another library than the one searched", async () => {
    const rows = await recommendations.findIdentitySimilar({
      ...query, seedTrackId: "seed", seedFriendId: mine, libraryFriendId: theirs,
    });
    expect(ids(rows)).toEqual(["theirs-closest", "theirs-near"]);
  });

  dbTest("a library keeps a centroid's suggestions to it", async () => {
    const seedTracks = [{ trackId: "seed", friendId: mine }];
    expect(ids(await recommendations.findIdentitySimilarByCentroid({ ...query, seedTracks }))).toEqual([
      "theirs-closest", "theirs-near", "mine-near", "mine-far",
    ]);
    expect(ids(await recommendations.findIdentitySimilarByCentroid({ ...query, seedTracks, libraryFriendId: mine }))).toEqual([
      "mine-near", "mine-far",
    ]);
  });

  dbTest("leaves no ivfflat settings behind on pooled connections", async () => {
    await recommendations.findIdentitySimilar({ ...query, ivfflatProbes: 37, seedTrackId: "seed", seedFriendId: mine });
    const settingsSeen = await Promise.all(
      Array.from({ length: 3 }, () =>
        withDbClient(async (client) => {
          // Loads pgvector into this backend, which is what registers its settings.
          await client.query(`SELECT '[1]'::vector`);
          const { rows } = await client.query<{ probes: string; scan: string }>(
            `SELECT current_setting('ivfflat.probes') AS probes,
                    current_setting('ivfflat.iterative_scan') AS scan`
          );
          return rows[0];
        })
      )
    );
    for (const row of settingsSeen) expect(row).toEqual({ probes: "1", scan: "off" });
  });

  dbTest("stores a library's scope, and refuses anything but library or all", async () => {
    expect(await settings.findRecommendationScope(mine)).toBeNull();
    expect(await settings.upsertRecommendationScope(mine, "all")).toBe("all");
    expect(await settings.upsertRecommendationScope(mine, "library")).toBe("library");
    expect(await settings.findRecommendationScope(mine)).toBe("library");
    await expect(
      dbQuery(`INSERT INTO recommendation_settings (friend_id, scope) VALUES ($1, 'everyone')`, [theirs])
    ).rejects.toThrow(/check constraint/);
  });
});

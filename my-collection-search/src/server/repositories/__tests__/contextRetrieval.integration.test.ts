/**
 * Context retrieval (#408), against a real Postgres: the `context` enum value
 * and settings row from the migrations, the per-release window cap, the
 * year regex behind the era filter, and the genre `unnest` over the album
 * join — all things a mocked driver accepts whether or not they're valid.
 * Run with `just embedding-versions-test`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbQuery, dbPool, withDbClient } from "@/lib/serverDb";
import { EmbeddingsRepository } from "../embeddingsRepository";
import { SettingsRepository } from "../settingsRepository";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const embeddings = new EmbeddingsRepository();

// No partial index exists for this model, so 3-dim vectors are fine.
const MODEL = "context-retrieval-test-model";
const USERNAME = "context-retrieval-friend";
let friendId = 0;

type Fixture = { id: string; release: string | null; year: string | null; bpm: number | null; vector: number[] };
const TRACKS: Fixture[] = [
  { id: "cumbia-1", release: "r-cumbia", year: "1974", bpm: 95, vector: [1, 0, 0] },
  { id: "cumbia-2", release: "r-cumbia", year: "1974", bpm: 100, vector: [0.99, 0.1, 0] },
  { id: "cumbia-3", release: "r-cumbia", year: "1974", bpm: 105, vector: [0.98, 0.2, 0] },
  { id: "rock-1", release: "r-rock", year: "1985-06", bpm: 130, vector: [0.9, 0.4, 0] },
  { id: "no-year", release: null, year: null, bpm: null, vector: [0.5, 0.8, 0] },
];

async function cleanup() {
  await dbQuery(`DELETE FROM track_embeddings WHERE model = $1`, [MODEL]);
  await dbQuery(`DELETE FROM tracks WHERE username = $1`, [USERNAME]);
  await dbQuery(`DELETE FROM albums WHERE release_id IN ('r-cumbia', 'r-rock') AND friend_id = $1`, [friendId]);
  await dbQuery(`DELETE FROM friends WHERE username = $1`, [USERNAME]);
}

function search(params: Partial<Parameters<EmbeddingsRepository["findContextMatches"]>[1]> = {}) {
  return withDbClient((client) =>
    embeddings.findContextMatches(client, {
      queryEmbedding: [1, 0, 0],
      model: MODEL,
      templateVersion: 1,
      dims: 3,
      limit: 10,
      perReleaseCap: 2,
      ...params,
      filters: { friendId, ...params.filters },
    })
  );
}

const ids = (rows: Array<{ track_id: string }>) => rows.map((r) => r.track_id);

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  const { rows } = await dbQuery<{ id: number }>(
    `INSERT INTO friends (username) VALUES ($1) RETURNING id`,
    [USERNAME]
  );
  friendId = rows[0].id;
  await dbQuery(
    `INSERT INTO albums (release_id, friend_id, title, artist, genres, styles) VALUES
       ('r-cumbia', $1, 'Cumbia LP', 'A', ARRAY['Latin'], ARRAY['Cumbia', 'Chicha']),
       ('r-rock', $1, 'Rock LP', 'B', ARRAY['Rock'], ARRAY['New Wave'])`,
    [friendId]
  );
  for (const t of TRACKS) {
    await dbQuery(
      `INSERT INTO tracks (track_id, username, friend_id, title, artist, release_id, year, bpm)
       VALUES ($1, $2, $3, $1, 'A', $4, $5, $6)`,
      [t.id, USERNAME, friendId, t.release, t.year, t.bpm]
    );
    await embeddings.upsertTrackEmbedding({
      trackId: t.id, friendId, embeddingType: "context", model: MODEL, dims: 3,
      embedding: t.vector, sourceHash: "h", identityText: `context ${t.id}`, templateVersion: 1,
    });
  }
  // A closer match under an older template must never be served.
  await embeddings.upsertTrackEmbedding({
    trackId: "rock-1", friendId, embeddingType: "context", model: MODEL, dims: 3,
    embedding: [1, 0, 0], sourceHash: "h", identityText: "old", templateVersion: 0,
  });
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});

describe("context retrieval (integration)", () => {
  dbTest("the migrations seed context settings on text-embedding-3-small", async () => {
    const settings = await new SettingsRepository().findEmbeddingModelSettings("context");
    expect(settings).toMatchObject({
      target_model: "text-embedding-3-small",
      serving_model: "text-embedding-3-small",
      serving_template_version: 1,
    });
  });

  dbTest("ranks by distance, capped per release, at one template version", async () => {
    const rows = await search();

    expect(ids(rows)).toEqual(["cumbia-1", "cumbia-2", "rock-1", "no-year"]);
    expect(rows[0]).toMatchObject({ release_id: "r-cumbia", context_text: "context cumbia-1" });
    expect(rows[0].distance).toBeCloseTo(0);
    expect(rows[2].context_text).toBe("context rock-1");
  });

  dbTest("a looser cap lets a whole release through, and limit trims the page", async () => {
    expect(ids(await search({ perReleaseCap: 3, limit: 3 }))).toEqual([
      "cumbia-1",
      "cumbia-2",
      "cumbia-3",
    ]);
  });

  dbTest("genre matches album genres or styles, case-insensitively", async () => {
    expect(ids(await search({ filters: { genre: "chicha" } }))).toEqual(["cumbia-1", "cumbia-2"]);
    expect(ids(await search({ filters: { genre: "ROCK" } }))).toEqual(["rock-1"]);
  });

  dbTest("era reads the leading year, and unknown-era finds tracks without one", async () => {
    expect(ids(await search({ filters: { era: "1980s" } }))).toEqual(["rock-1"]);
    expect(ids(await search({ filters: { era: "1970s" } }))).toEqual(["cumbia-1", "cumbia-2"]);
    expect(ids(await search({ filters: { era: "unknown-era" } }))).toEqual(["no-year"]);
  });

  dbTest("bpm bounds are inclusive", async () => {
    expect(ids(await search({ perReleaseCap: 3, filters: { bpmMin: 100, bpmMax: 130 } }))).toEqual([
      "cumbia-2",
      "cumbia-3",
      "rock-1",
    ]);
  });

  dbTest("other friends and other models are excluded", async () => {
    expect(await search({ filters: { friendId: friendId + 100000 } })).toEqual([]);
    expect(await search({ model: "some-other-model" })).toEqual([]);
  });
});

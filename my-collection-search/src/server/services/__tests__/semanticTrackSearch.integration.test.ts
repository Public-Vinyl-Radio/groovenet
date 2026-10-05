/**
 * Semantic track search (#409) against a real Postgres with pgvector: the
 * transaction-local `ivfflat.iterative_scan` setting (which only exists from
 * pgvector 0.8), the vector scan, and hydrating matches into full track rows
 * through the `unnest` join. OpenAI and the model settings are stubbed; the
 * SQL is real. Run with `just embedding-versions-test`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/embeddings/config", () => ({
  getServingModel: vi.fn(async () => ({ model: MODEL, dims: 3, templateVersion: 1 })),
}));
vi.mock("@/server/services/queryEmbeddingService", () => ({
  embedSearchQuery: vi.fn(async () => ({ embedding: [1, 0, 0], cacheHit: false })),
  normalizeQuery: (q: string) => q.toLowerCase().trim(),
}));

import { dbPool, dbQuery, withDbClient } from "@/lib/serverDb";
import { EmbeddingsRepository } from "@/server/repositories/embeddingsRepository";
import { semanticTrackSearch } from "../semanticTrackSearchService";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const embeddings = new EmbeddingsRepository();

const MODEL = "semantic-search-test-model";
const USERNAME = "semantic-search-friend";
let friendId = 0;

const TRACKS = [
  { id: "near", release: "r-a", vector: [1, 0, 0], audio: null },
  { id: "near-2", release: "r-a", vector: [0.99, 0.1, 0], audio: "/audio/n2.m4a" },
  { id: "near-3", release: "r-a", vector: [0.98, 0.2, 0], audio: null },
  { id: "near-4", release: "r-a", vector: [0.97, 0.3, 0], audio: null },
  { id: "far", release: "r-b", vector: [0, 1, 0], audio: null },
];

async function cleanup() {
  await dbQuery(`DELETE FROM track_embeddings WHERE model = $1`, [MODEL]);
  await dbQuery(`DELETE FROM tracks WHERE username = $1`, [USERNAME]);
  await dbQuery(`DELETE FROM friends WHERE username = $1`, [USERNAME]);
}

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  const { rows } = await dbQuery<{ id: number }>(
    `INSERT INTO friends (username) VALUES ($1) RETURNING id`,
    [USERNAME]
  );
  friendId = rows[0].id;
  for (const t of TRACKS) {
    await dbQuery(
      `INSERT INTO tracks (track_id, username, friend_id, title, artist, release_id, local_audio_url)
       VALUES ($1, $2, $3, $1, 'Artist', $4, $5)`,
      [t.id, USERNAME, friendId, t.release, t.audio]
    );
    await embeddings.upsertTrackEmbedding({
      trackId: t.id, friendId, embeddingType: "context", model: MODEL, dims: 3,
      embedding: t.vector, sourceHash: "h", identityText: `context ${t.id}`, templateVersion: 1,
    });
  }
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});

const base = () => ({ q: "q", limit: 10, friendId, missing: [], caller: "test" });

describe("semanticTrackSearch (integration)", () => {
  dbTest("returns full track rows in distance order, three per release", async () => {
    const { hits } = await semanticTrackSearch(base());

    expect(hits.map((h) => h.track_id)).toEqual(["near", "near-2", "near-3", "far"]);
    expect(hits[0]).toMatchObject({
      friend_id: friendId,
      title: "near",
      artist: "Artist",
      release_id: "r-a",
      hasVectors: false,
    });
  });

  dbTest("applies the missing-audio chip inside the vector scan", async () => {
    const { hits } = await semanticTrackSearch({ ...base(), missing: ["local_audio"] });
    expect(hits.map((h) => h.track_id)).toEqual(["near", "near-3", "near-4", "far"]);
  });

  dbTest("keeps the scan settings to its own transaction", async () => {
    await semanticTrackSearch(base());
    // Every pooled connection is back on the defaults afterwards.
    const settings = await Promise.all(
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
    for (const row of settings) expect(row).toEqual({ probes: "1", scan: "off" });
  });
});

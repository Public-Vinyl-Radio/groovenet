/**
 * Template-versioned embeddings, against a real Postgres (#407).
 *
 * The five-column conflict key, the backfill's LEFT JOIN through
 * `embedding_model_settings`, and the COALESCE on the serving version are
 * all things a mocked `dbQuery` accepts happily and a real driver may not.
 * Run with `just embedding-versions-test`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbQuery, dbPool } from "@/lib/serverDb";
import { CURRENT_TEMPLATE_VERSIONS } from "@/lib/embeddings/templateVersions";
import { EmbeddingsRepository } from "../embeddingsRepository";
import { SettingsRepository } from "../settingsRepository";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const embeddings = new EmbeddingsRepository();
const settings = new SettingsRepository();

// A model with no partial ivfflat index, so 3-dim test vectors are allowed.
const MODEL = "embedding-versions-test-model";
const OTHER_MODEL = "embedding-versions-other-model";
const USERNAME = "embedding-versions-friend";
const CURRENT = CURRENT_TEMPLATE_VERSIONS.identity;
const OLD = CURRENT - 1;
let friendId = 0;
let original: { target_model: string; target_dims: number; serving_model: string; serving_dims: number; serving_template_version: number };

async function cleanup() {
  await dbQuery(`DELETE FROM track_embeddings WHERE model IN ($1, $2)`, [MODEL, OTHER_MODEL]);
  await dbQuery(`DELETE FROM tracks WHERE username = $1`, [USERNAME]);
  await dbQuery(`DELETE FROM friends WHERE username = $1`, [USERNAME]);
}

function upsert(trackId: string, model: string, templateVersion: number, sourceHash: string) {
  return embeddings.upsertTrackEmbedding({
    trackId,
    friendId,
    embeddingType: "identity",
    model,
    dims: 3,
    embedding: [templateVersion, 0, 1],
    sourceHash,
    identityText: `text v${templateVersion}`,
    templateVersion,
  });
}

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  const found = await settings.findEmbeddingModelSettings("identity");
  if (!found) throw new Error("identity settings row missing — run migrations first");
  original = found;
  await settings.updateTargetModel("identity", MODEL, 3);

  const { rows } = await dbQuery<{ id: number }>(
    `INSERT INTO friends (username) VALUES ($1) RETURNING id`,
    [USERNAME]
  );
  friendId = rows[0].id;
  for (const id of ["current", "old-only", "other-model"]) {
    await dbQuery(
      `INSERT INTO tracks (track_id, username, friend_id, title, artist) VALUES ($1, $2, $3, 'T', 'A')`,
      [id, USERNAME, friendId]
    );
  }

  // "current" has both versions at the target model, side by side.
  await upsert("current", MODEL, OLD, "hash-old");
  await upsert("current", MODEL, CURRENT, "hash-current");
  // "old-only" was embedded by the previous template only.
  await upsert("old-only", MODEL, OLD, "hash-old");
  // "other-model" is current, but under a model that isn't the target.
  await upsert("other-model", OTHER_MODEL, CURRENT, "hash-other");
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await settings.updateTargetModel("identity", original.target_model, original.target_dims);
  await settings.updateServingModel(
    "identity",
    original.serving_model,
    original.serving_dims,
    original.serving_template_version
  );
  await dbPool.end();
});

describe("template-versioned track embeddings (integration)", () => {
  dbTest("keeps one row per template version instead of overwriting", async () => {
    await upsert("current", MODEL, CURRENT, "hash-current-2");

    const { rows } = await dbQuery<{ template_version: number; source_hash: string }>(
      `SELECT template_version, source_hash FROM track_embeddings
       WHERE track_id = 'current' AND friend_id = $1 AND model = $2
       ORDER BY template_version`,
      [friendId, MODEL]
    );
    expect(rows).toEqual([
      { template_version: OLD, source_hash: "hash-old" },
      { template_version: CURRENT, source_hash: "hash-current-2" },
    ]);
  });

  dbTest("backfill treats older templates and other models as missing", async () => {
    const missing = await embeddings.listTracksForBackfill({ type: "identity", friend_id: friendId });

    expect(missing.map((t) => t.track_id).sort()).toEqual(["old-only", "other-model"]);
  });

  dbTest("the source-hash lookup is pinned to model and version", async () => {
    await expect(
      embeddings.findEmbeddingSourceHash("old-only", friendId, "identity", MODEL, CURRENT)
    ).resolves.toBeNull();
    await expect(
      embeddings.findEmbeddingSourceHash("old-only", friendId, "identity", MODEL, OLD)
    ).resolves.toBe("hash-old");
    await expect(
      embeddings.findEmbeddingSourceHash("other-model", friendId, "identity", MODEL, CURRENT)
    ).resolves.toBeNull();
  });

  dbTest("serving reads return only the requested version", async () => {
    const rows = await embeddings.findEmbeddingsForTracks(
      [
        { trackId: "current", friendId },
        { trackId: "old-only", friendId },
      ],
      "identity",
      MODEL,
      OLD
    );

    expect(rows.map((r) => [r.track_id, r.embedding]).sort()).toEqual([
      ["current", `[${OLD},0,1]`],
      ["old-only", `[${OLD},0,1]`],
    ]);
  });

  dbTest("coverage is counted per template version", async () => {
    const coverage = await embeddings.countEmbeddingsByModel("identity", friendId);

    expect(coverage).toEqual(
      expect.arrayContaining([
        { model: MODEL, dims: 3, template_version: OLD, count: 2 },
        { model: MODEL, dims: 3, template_version: CURRENT, count: 1 },
        { model: OTHER_MODEL, dims: 3, template_version: CURRENT, count: 1 },
      ])
    );
  });

  dbTest("the serving cutover sets a version, and keeps it when none is given", async () => {
    const moved = await settings.updateServingModel("identity", MODEL, 3, CURRENT);
    expect(moved?.serving_template_version).toBe(CURRENT);

    const kept = await settings.updateServingModel("identity", MODEL, 3);
    expect(kept?.serving_template_version).toBe(CURRENT);
  });
});

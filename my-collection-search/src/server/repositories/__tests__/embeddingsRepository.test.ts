import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmbeddingsRepository, eraYearRange } from "../embeddingsRepository";
import { CURRENT_TEMPLATE_VERSIONS } from "@/lib/embeddings/templateVersions";

const dbQuery = vi.hoisted(() => vi.fn());

vi.mock("@/lib/serverDb", () => ({ dbQuery }));

beforeEach(() => {
  vi.resetAllMocks();
});

function makeRepo() {
  return new EmbeddingsRepository();
}

function makeClient() {
  return { query: vi.fn() };
}

// ─── listTracksForBackfill ────────────────────────────────────────────────────

describe("listTracksForBackfill()", () => {
  it("returns rows from dbQuery", async () => {
    const rows = [{ track_id: "t1", friend_id: 1 }];
    dbQuery.mockResolvedValue({ rows });

    const result = await makeRepo().listTracksForBackfill({ type: "identity" });

    expect(result).toEqual(rows);
  });

  it("force=false, type=identity: LEFT JOINs track_embeddings for missing identity rows", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().listTracksForBackfill({ type: "identity", force: false });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("track_embeddings");
    expect(sql).toContain("te.id IS NULL");
    expect(sql).not.toContain("bpm");
    expect(params).toEqual(["identity", CURRENT_TEMPLATE_VERSIONS.identity]);
  });

  it("force=false: only a row at the target model and current template counts (#407)", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().listTracksForBackfill({ type: "identity" });

    const [sql] = dbQuery.mock.calls[0];
    expect(sql).toContain("LEFT JOIN embedding_model_settings ems");
    expect(sql).toContain("ems.embedding_type = $1");
    expect(sql).toContain("te.model = ems.target_model");
    expect(sql).toContain("te.template_version = $2");
  });

  it("force=false, type=audio_vibe: filters for tracks with audio features", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().listTracksForBackfill({ type: "audio_vibe", force: false });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("track_embeddings");
    expect(sql).toContain("bpm");
    expect(params).toEqual(["audio_vibe", CURRENT_TEMPLATE_VERSIONS.audio_vibe]);
  });

  it("force=true, type=identity: selects all tracks, no params", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().listTracksForBackfill({ type: "identity", force: true });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).not.toContain("track_embeddings");
    expect(sql).not.toContain("bpm");
    expect(params).toEqual([]);
  });

  it("force=true, type=audio_vibe: still filters for tracks with audio features", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().listTracksForBackfill({ type: "audio_vibe", force: true });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("bpm");
    expect(sql).not.toContain("track_embeddings");
    expect(params).toEqual([]);
  });

  it("adds friend_id param when provided", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().listTracksForBackfill({ type: "identity", force: true, friend_id: 7 });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("t.friend_id");
    expect(params).toEqual([7]);
  });

  it("adds a release_id param when provided", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().listTracksForBackfill({
      type: "identity",
      force: true,
      release_id: "rel-1",
    });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("t.release_id");
    expect(params).toEqual(["rel-1"]);
  });

  it("adds a track_ids = ANY(...) param when provided", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().listTracksForBackfill({
      type: "identity",
      force: true,
      track_ids: ["t1", "t2"],
    });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("ANY(");
    expect(params).toEqual([["t1", "t2"]]);
  });

  it("ignores an empty track_ids array", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().listTracksForBackfill({ type: "identity", force: true, track_ids: [] });

    const [, params] = dbQuery.mock.calls[0];
    expect(params).toEqual([]);
  });

  it("adds limit param when provided", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().listTracksForBackfill({ type: "identity", force: true, limit: 50 });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("LIMIT");
    expect(params).toEqual([50]);
  });

  it("orders params as type, template version, friend_id, release_id, track_ids, limit", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().listTracksForBackfill({
      type: "identity",
      force: false,
      friend_id: 3,
      release_id: "rel-1",
      track_ids: ["t1"],
      limit: 10,
    });

    const [, params] = dbQuery.mock.calls[0];
    expect(params).toEqual([
      "identity",
      CURRENT_TEMPLATE_VERSIONS.identity,
      3,
      "rel-1",
      ["t1"],
      10,
    ]);
  });
});

// ─── listTracksNeedingIdentityEmbeddings ──────────────────────────────────────

describe("listTracksNeedingIdentityEmbeddings()", () => {
  it("delegates to listTracksForBackfill with type='identity'", async () => {
    const rows = [{ track_id: "t1", friend_id: 1 }];
    dbQuery.mockResolvedValue({ rows });

    const result = await makeRepo().listTracksNeedingIdentityEmbeddings({ friend_id: 2 });

    expect(result).toEqual(rows);
    const [, params] = dbQuery.mock.calls[0];
    expect(params).toContain("identity");
  });
});

// ─── listTracksNeedingAudioVibeEmbeddings ─────────────────────────────────────

describe("listTracksNeedingAudioVibeEmbeddings()", () => {
  it("delegates to listTracksForBackfill with type='audio_vibe'", async () => {
    const rows = [{ track_id: "t1", friend_id: 1 }];
    dbQuery.mockResolvedValue({ rows });

    const result = await makeRepo().listTracksNeedingAudioVibeEmbeddings({ friend_id: 2 });

    expect(result).toEqual(rows);
    const [, params] = dbQuery.mock.calls[0];
    expect(params).toContain("audio_vibe");
  });
});

// ─── countTracks ──────────────────────────────────────────────────────────────

describe("countTracks()", () => {
  it("returns the total with no friend filter", async () => {
    dbQuery.mockResolvedValue({ rows: [{ count: 42 }] });

    const result = await makeRepo().countTracks();

    expect(result).toBe(42);
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).not.toContain("WHERE");
    expect(params).toEqual([]);
  });

  it("scopes to one friend when given", async () => {
    dbQuery.mockResolvedValue({ rows: [{ count: 5 }] });

    const result = await makeRepo().countTracks(7);

    expect(result).toBe(5);
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("friend_id = $1");
    expect(params).toEqual([7]);
  });

  it("falls back to 0 when no row comes back", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    expect(await makeRepo().countTracks()).toBe(0);
  });
});

// ─── countEmbeddingsByModel ───────────────────────────────────────────────────

describe("countEmbeddingsByModel()", () => {
  it("groups by model, dims and template version", async () => {
    dbQuery.mockResolvedValue({
      rows: [{ model: "text-embedding-3-small", dims: 1536, template_version: 2, count: "10" }],
    });

    const result = await makeRepo().countEmbeddingsByModel("identity");

    expect(result).toEqual([
      { model: "text-embedding-3-small", dims: 1536, template_version: 2, count: 10 },
    ]);
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("GROUP BY model, dims, template_version");
    expect(params).toEqual(["identity"]);
  });

  it("scopes to one friend when given", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().countEmbeddingsByModel("audio_vibe", 7);

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("friend_id = $2");
    expect(params).toEqual(["audio_vibe", 7]);
  });
});

// ─── setIvfflatProbes ─────────────────────────────────────────────────────────

describe("setIvfflatProbes()", () => {
  it("calls client.query with the stringified probe count", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [] });

    await makeRepo().setIvfflatProbes(client as any, 4);

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("set_config"),
      ["4"]
    );
  });
});

// ─── findSourceEmbedding ──────────────────────────────────────────────────────

describe("findSourceEmbedding()", () => {
  it("returns the embedding when found", async () => {
    const client = makeClient();
    const embedding = [0.1, 0.2, 0.3];
    client.query.mockResolvedValue({ rows: [{ embedding }] });

    const result = await makeRepo().findSourceEmbedding(
      client as any,
      "t1",
      1,
      "identity",
      "text-embedding-3-small",
      2
    );

    expect(result).toEqual(embedding);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("template_version = $5"),
      ["t1", 1, "identity", "text-embedding-3-small", 2]
    );
  });

  it("returns null when not found", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [] });

    const result = await makeRepo().findSourceEmbedding(
      client as any,
      "t1",
      1,
      "audio_vibe",
      "text-embedding-3-small",
      1
    );

    expect(result).toBeNull();
  });
});

// ─── findSimilarIdentityTracks ────────────────────────────────────────────────

describe("findSimilarIdentityTracks()", () => {
  it("returns tracks with distance coerced to number", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({
      rows: [{ track_id: "t2", friend_id: 1, distance: "0.45" }],
    });

    const result = await makeRepo().findSimilarIdentityTracks(client as any, {
      sourceEmbedding: [0.1],
      sourceTrackId: "t1",
      sourceFriendId: 1,
      model: "text-embedding-3-small",
      templateVersion: 2,
      dims: 1536,
      limit: 5,
      filters: {},
    });

    expect(result[0].distance).toBe(0.45);
    expect(typeof result[0].distance).toBe("number");
  });

  it("filters by model and casts to the configured dims", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [] });

    await makeRepo().findSimilarIdentityTracks(client as any, {
      sourceEmbedding: [0.1],
      sourceTrackId: "t1",
      sourceFriendId: 1,
      model: "text-embedding-3-small",
      templateVersion: 2,
      dims: 768,
      limit: 5,
      filters: {},
    });

    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain("te.model = $4");
    expect(sql).toContain("te.template_version = $5");
    expect(sql).toContain("vector(768)");
    expect(params).toContain("text-embedding-3-small");
  });

  it("includes country filter clause when filters.country is set", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [] });

    await makeRepo().findSimilarIdentityTracks(client as any, {
      sourceEmbedding: [0.1],
      sourceTrackId: "t1",
      sourceFriendId: 1,
      model: "text-embedding-3-small",
      templateVersion: 2,
      dims: 1536,
      limit: 5,
      filters: { country: "DE" },
    });

    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain("country");
    expect(params).toContain("DE");
  });

  it("includes tag LIKE clauses when filters.tags is set", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [] });

    await makeRepo().findSimilarIdentityTracks(client as any, {
      sourceEmbedding: [0.1],
      sourceTrackId: "t1",
      sourceFriendId: 1,
      model: "text-embedding-3-small",
      templateVersion: 2,
      dims: 1536,
      limit: 5,
      filters: { tags: ["techno", "dark"] },
    });

    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain("LIKE");
    expect(params).toContain("%techno%");
    expect(params).toContain("%dark%");
  });

  it("includes no filter clauses when filters is empty", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [] });

    await makeRepo().findSimilarIdentityTracks(client as any, {
      sourceEmbedding: [0.1],
      sourceTrackId: "t1",
      sourceFriendId: 1,
      model: "text-embedding-3-small",
      templateVersion: 2,
      dims: 1536,
      limit: 5,
      filters: {},
    });

    const [sql] = client.query.mock.calls[0];
    expect(sql).not.toContain("a.country");
    expect(sql).not.toContain("LIKE");
  });

  it("selects the track's taxonomy genres, so Related/Similar lists can badge them (#470)", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [] });

    await makeRepo().findSimilarIdentityTracks(client as any, {
      sourceEmbedding: [0.1],
      sourceTrackId: "t1",
      sourceFriendId: 1,
      model: "text-embedding-3-small",
      templateVersion: 2,
      dims: 1536,
      limit: 5,
      filters: {},
    });

    const [sql] = client.query.mock.calls[0];
    expect(sql).toContain("AS track_genres");
  });

  it.each([0, -1, 1.5, NaN])("rejects invalid dims (%s) without querying", async (dims) => {
    const client = makeClient();

    await expect(
      makeRepo().findSimilarIdentityTracks(client as any, {
        sourceEmbedding: [0.1],
        sourceTrackId: "t1",
        sourceFriendId: 1,
        model: "text-embedding-3-small",
        templateVersion: 2,
        dims,
        limit: 5,
        filters: {},
      })
    ).rejects.toThrow(`Invalid vector dims: ${dims}`);
    expect(client.query).not.toHaveBeenCalled();
  });
});

// ─── findSimilarAudioVibeTracks ───────────────────────────────────────────────

describe("findSimilarAudioVibeTracks()", () => {
  it("returns tracks with distance coerced to number", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({
      rows: [{ track_id: "t2", friend_id: 1, distance: "0.12" }],
    });

    const result = await makeRepo().findSimilarAudioVibeTracks(client as any, {
      sourceEmbedding: [0.1],
      sourceTrackId: "t1",
      sourceFriendId: 1,
      model: "text-embedding-3-small",
      templateVersion: 2,
      dims: 1536,
      limit: 10,
    });

    expect(result[0].distance).toBe(0.12);
    expect(typeof result[0].distance).toBe("number");
  });

  it("passes all six params in the correct positions", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [] });
    const embedding = [0.5];

    await makeRepo().findSimilarAudioVibeTracks(client as any, {
      sourceEmbedding: embedding,
      sourceTrackId: "t1",
      sourceFriendId: 3,
      model: "text-embedding-3-small",
      templateVersion: 2,
      dims: 1536,
      limit: 20,
    });

    const [, params] = client.query.mock.calls[0];
    expect(params).toEqual([embedding, "t1", 3, 20, "text-embedding-3-small", 2]);
    const [sql] = client.query.mock.calls[0];
    expect(sql).toContain("te.template_version = $6");
  });

  it("selects the track's taxonomy genres, so Vibe lists can badge them (#470)", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [] });

    await makeRepo().findSimilarAudioVibeTracks(client as any, {
      sourceEmbedding: [0.1],
      sourceTrackId: "t1",
      sourceFriendId: 1,
      model: "text-embedding-3-small",
      templateVersion: 2,
      dims: 1536,
      limit: 10,
    });

    const [sql] = client.query.mock.calls[0];
    expect(sql).toContain("AS track_genres");
  });
});

// ─── upsertTrackEmbedding ─────────────────────────────────────────────────────

describe("upsertTrackEmbedding()", () => {
  it("formats the embedding array as a pgvector string", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().upsertTrackEmbedding({
      trackId: "t1",
      friendId: 1,
      embeddingType: "identity",
      model: "text-embedding-3-small",
      dims: 3,
      embedding: [0.1, 0.2, 0.3],
      sourceHash: "abc123",
      identityText: "Some Artist - Some Track",
    });

    const [, params] = dbQuery.mock.calls[0];
    expect(params[5]).toBe("[0.1,0.2,0.3]");
  });

  it("passes all 9 params in the correct order, defaulting templateVersion to 1", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().upsertTrackEmbedding({
      trackId: "t1",
      friendId: 2,
      embeddingType: "audio_vibe",
      model: "audio-model",
      dims: 512,
      embedding: [0.5],
      sourceHash: "hash1",
      identityText: "text",
    });

    const [, params] = dbQuery.mock.calls[0];
    expect(params[0]).toBe("t1");
    expect(params[1]).toBe(2);
    expect(params[2]).toBe("audio_vibe");
    expect(params[3]).toBe("audio-model");
    expect(params[4]).toBe(512);
    expect(params[6]).toBe("hash1");
    expect(params[7]).toBe("text");
    expect(params[8]).toBe(1);
  });

  it("passes an explicit templateVersion through", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().upsertTrackEmbedding({
      trackId: "t1",
      friendId: 1,
      embeddingType: "identity",
      model: "text-embedding-3-small",
      dims: 3,
      embedding: [0.1],
      sourceHash: "abc123",
      identityText: "text",
      templateVersion: 2,
    });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(params[8]).toBe(2);
    // Each template version is its own row, so a re-embed under a new
    // template never overwrites the one being served (#407).
    expect(sql).toContain(
      "ON CONFLICT (track_id, friend_id, embedding_type, model, template_version)"
    );
    expect(sql).not.toContain("template_version = EXCLUDED.template_version");
  });
});

// ─── findEmbeddingSourceHash ──────────────────────────────────────────────────

describe("findEmbeddingSourceHash()", () => {
  it("returns the source hash when found", async () => {
    dbQuery.mockResolvedValue({ rows: [{ source_hash: "abc123" }] });

    const result = await makeRepo().findEmbeddingSourceHash(
      "t1",
      1,
      "identity",
      "text-embedding-3-small",
      2
    );

    expect(result).toBe("abc123");
    // Pinned to model and template version: a row from another model or an
    // older template must not satisfy the staleness check (#407).
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("model = $4 AND template_version = $5");
    expect(params).toEqual(["t1", 1, "identity", "text-embedding-3-small", 2]);
  });

  it("returns null when not found", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    const result = await makeRepo().findEmbeddingSourceHash(
      "t1",
      1,
      "audio_vibe",
      "text-embedding-3-small",
      1
    );

    expect(result).toBeNull();
  });
});

// ─── listEmbeddingTypesForTrack ────────────────────────────────────────────────

describe("listEmbeddingTypesForTrack()", () => {
  it("returns the list of embedding types for a track", async () => {
    dbQuery.mockResolvedValue({
      rows: [{ embedding_type: "identity" }, { embedding_type: "audio_vibe" }],
    });

    const result = await makeRepo().listEmbeddingTypesForTrack("t1", 1);

    expect(result).toEqual(["identity", "audio_vibe"]);
  });
});

// ─── listEmbeddingTypesForTrackPairs ──────────────────────────────────────────

describe("listEmbeddingTypesForTrackPairs()", () => {
  it("returns empty array without querying for an empty input", async () => {
    const result = await makeRepo().listEmbeddingTypesForTrackPairs([]);

    expect(result).toEqual([]);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("returns distinct embedding types across seed pairs", async () => {
    dbQuery.mockResolvedValue({
      rows: [{ embedding_type: "identity" }],
    });

    const result = await makeRepo().listEmbeddingTypesForTrackPairs([
      { trackId: "t1", friendId: 1 },
      { trackId: "t2", friendId: 1 },
    ]);

    expect(result).toEqual(["identity"]);
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("$1");
    expect(sql).toContain("$3");
    expect(params).toEqual(["t1", 1, "t2", 1]);
  });
});

// ─── findEmbeddingsForTracks ──────────────────────────────────────────────────

describe("findEmbeddingsForTracks()", () => {
  it("returns [] without querying when no tracks are given", async () => {
    const result = await makeRepo().findEmbeddingsForTracks([], "audio_vibe", "m", 1);

    expect(result).toEqual([]);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("pins the query to the embedding type, model and template version, batching ids as arrays", async () => {
    const rows = [{ track_id: "t1", friend_id: 1, embedding: "[0.1,0.2]" }];
    dbQuery.mockResolvedValue({ rows });

    const result = await makeRepo().findEmbeddingsForTracks(
      [
        { trackId: "t1", friendId: 1 },
        { trackId: "t2", friendId: 2 },
      ],
      "audio_vibe",
      "vibe-model",
      3
    );

    expect(result).toEqual(rows);
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("te.embedding::text");
    expect(sql).toContain("te.model = $4 AND te.template_version = $5");
    expect(params).toEqual([["t1", "t2"], [1, 2], "audio_vibe", "vibe-model", 3]);
  });
});

// ─── context retrieval (#408) ─────────────────────────────────────────────────

describe("listTracksNeedingContextEmbeddings()", () => {
  it("delegates to listTracksForBackfill with type='context'", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().listTracksNeedingContextEmbeddings({ friend_id: 2 });

    const [, params] = dbQuery.mock.calls[0];
    expect(params).toEqual(["context", CURRENT_TEMPLATE_VERSIONS.context, 2]);
  });
});

describe("eraYearRange()", () => {
  it.each([
    ["1970s", [1970, 1980]],
    ["2020s", [2020, 2030]],
    ["1950s", [1950, 1960]],
    ["pre-1950s", [1900, 1950]],
    ["unknown-era", "unknown"],
  ])("maps %s", (era, expected) => {
    expect(eraYearRange(era)).toEqual(expected);
  });

  it.each(["1940s", "70s", "seventies", ""])("rejects %j", (era) => {
    expect(() => eraYearRange(era)).toThrow("Invalid era filter");
  });
});

describe("findContextMatches()", () => {
  const base = {
    queryEmbedding: [0.1, 0.2],
    model: "context-model",
    templateVersion: 1,
    dims: 1536,
    limit: 10,
    perReleaseCap: 2,
  };

  it("pins kind, model and version, caps per release and coerces distance", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [{ track_id: "t1", distance: "0.25" }] });

    const rows = await makeRepo().findContextMatches(client as any, base);

    expect(rows[0].distance).toBe(0.25);
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain("te.embedding_type = 'context'");
    expect(sql).toContain("te.model = $2");
    expect(sql).toContain("te.template_version = $3");
    expect(sql).toContain("vector(1536)");
    expect(sql).toContain("PARTITION BY friend_id, COALESCE(release_id, track_id)");
    // vector, model, version, pool, cap, limit — pool defaults to max(limit × 10, 200).
    expect(params).toEqual(["[0.1,0.2]", "context-model", 1, 200, 2, 10]);
  });

  it("binds every filter after the fixed params", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [] });

    await makeRepo().findContextMatches(client as any, {
      ...base,
      limit: 30,
      candidatePool: 500,
      filters: { friendId: 6, era: "1970s", genre: "Cumbia", bpmMin: 90, bpmMax: 110 },
    });

    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain("te.friend_id = $4");
    expect(sql).toContain(">= $5");
    expect(sql).toContain("< $6");
    expect(sql).toContain("LOWER(g.name) = LOWER($7)");
    expect(sql).toContain("t.bpm >= $8");
    expect(sql).toContain("t.bpm <= $9");
    expect(params).toEqual(["[0.1,0.2]", "context-model", 1, 6, 1970, 1980, "Cumbia", 90, 110, 500, 2, 30]);
  });

  it("binds key and minimum rating after BPM, on t (#412)", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [] });

    await makeRepo().findContextMatches(client as any, {
      ...base,
      filters: { friendId: 6, bpmMin: 90, key: "A minor", minStarRating: 4 },
    });

    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain("t.bpm >= $5");
    expect(sql).toContain("LOWER(t.key) = LOWER($6)");
    expect(sql).toContain("t.star_rating >= $7");
    expect(params).toEqual(["[0.1,0.2]", "context-model", 1, 6, 90, "A minor", 4, 200, 2, 10]);
  });

  it("excludes soft-deleted tracks and applies the missing-field chips on t", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [] });

    await makeRepo().findContextMatches(client as any, {
      ...base,
      filters: { missing: ["local_audio", "bpm_or_key"] },
    });

    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain("t.deleted_at IS NULL");
    expect(sql).toContain("AND t.local_audio_url IS NULL");
    expect(sql).toContain("AND (t.bpm IS NULL OR t.key IS NULL)");
    expect(params).toHaveLength(6);
  });

  it("matches tracks with no usable year for the unknown era", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [] });

    await makeRepo().findContextMatches(client as any, { ...base, filters: { era: "unknown-era" } });

    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain("IS NULL OR");
    expect(params).toHaveLength(6);
  });

  it.each([
    [{ limit: 0 }, "Invalid limit"],
    [{ perReleaseCap: 1.5 }, "Invalid perReleaseCap"],
    [{ dims: 0 }, "Invalid vector dims"],
    [{ filters: { era: "seventies" } }, "Invalid era filter"],
  ])("rejects %j without querying", async (override, message) => {
    const client = makeClient();

    await expect(
      makeRepo().findContextMatches(client as any, { ...base, ...override })
    ).rejects.toThrow(message);
    expect(client.query).not.toHaveBeenCalled();
  });
});

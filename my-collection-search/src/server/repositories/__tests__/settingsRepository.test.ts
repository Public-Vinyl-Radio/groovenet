import { describe, it, expect, vi, beforeEach } from "vitest";
import { SettingsRepository } from "../settingsRepository";

const dbQuery = vi.hoisted(() => vi.fn());

vi.mock("@/lib/serverDb", () => ({ dbQuery }));

beforeEach(() => {
  vi.resetAllMocks();
});

function makeRepo() {
  return new SettingsRepository();
}

const ROW = {
  embedding_type: "identity",
  target_model: "text-embedding-3-small",
  target_dims: 1536,
  serving_model: "text-embedding-3-small",
  serving_dims: 1536,
  serving_template_version: 1,
};

describe("recommendation scope", () => {
  it("reads a library's saved scope, or null when it has none", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ scope: "all" }] }).mockResolvedValueOnce({ rows: [] });

    await expect(makeRepo().findRecommendationScope(4)).resolves.toBe("all");
    await expect(makeRepo().findRecommendationScope(5)).resolves.toBeNull();
    expect(dbQuery.mock.calls[0]).toEqual([expect.stringContaining("FROM recommendation_settings WHERE friend_id = $1"), [4]]);
  });

  it("upserts a library's scope", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ scope: "library" }] }).mockResolvedValueOnce({ rows: [] });

    await expect(makeRepo().upsertRecommendationScope(4, "library")).resolves.toBe("library");
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("ON CONFLICT (friend_id)");
    expect(params).toEqual([4, "library"]);
    // Falls back to what was asked for if the driver returns no row.
    await expect(makeRepo().upsertRecommendationScope(4, "all")).resolves.toBe("all");
  });
});

describe("findEmbeddingModelSettings()", () => {
  it("returns the row for the given kind", async () => {
    dbQuery.mockResolvedValue({ rows: [ROW] });

    const result = await makeRepo().findEmbeddingModelSettings("identity");

    expect(result).toEqual(ROW);
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("WHERE embedding_type = $1");
    expect(params).toEqual(["identity"]);
  });

  it("returns null when no row exists", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await expect(makeRepo().findEmbeddingModelSettings("audio_vibe")).resolves.toBeNull();
  });
});

describe("listEmbeddingModelSettings()", () => {
  it("returns every kind's row, ordered", async () => {
    dbQuery.mockResolvedValue({ rows: [ROW] });

    const result = await makeRepo().listEmbeddingModelSettings();

    expect(result).toEqual([ROW]);
    const [sql] = dbQuery.mock.calls[0];
    expect(sql).toContain("ORDER BY embedding_type");
  });
});

describe("updateTargetModel()", () => {
  it("updates target_model and target_dims for the kind", async () => {
    const updated = { ...ROW, target_model: "text-embedding-3-small", target_dims: 768 };
    dbQuery.mockResolvedValue({ rows: [updated] });

    const result = await makeRepo().updateTargetModel(
      "identity",
      "text-embedding-3-small",
      768
    );

    expect(result).toEqual(updated);
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("SET target_model = $2, target_dims = $3");
    expect(params).toEqual(["identity", "text-embedding-3-small", 768]);
  });

  it("returns null when the kind has no row", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await expect(
      makeRepo().updateTargetModel("identity", "m", 1)
    ).resolves.toBeNull();
  });
});

describe("updateServingModel()", () => {
  it("updates serving_model and serving_dims for the kind", async () => {
    const updated = { ...ROW, serving_model: "text-embedding-3-small", serving_dims: 768 };
    dbQuery.mockResolvedValue({ rows: [updated] });

    const result = await makeRepo().updateServingModel(
      "identity",
      "text-embedding-3-small",
      768
    );

    expect(result).toEqual(updated);
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("serving_model = $2");
    expect(sql).toContain("serving_dims = $3");
    // No version given: COALESCE keeps the one already served.
    expect(sql).toContain("serving_template_version = COALESCE($4, serving_template_version)");
    expect(params).toEqual(["identity", "text-embedding-3-small", 768, null]);
  });

  it("moves serving to a new template version when one is given (#407)", async () => {
    dbQuery.mockResolvedValue({ rows: [{ ...ROW, serving_template_version: 2 }] });

    const result = await makeRepo().updateServingModel("identity", "text-embedding-3-small", 1536, 2);

    expect(result?.serving_template_version).toBe(2);
    expect(dbQuery.mock.calls[0][1]).toEqual(["identity", "text-embedding-3-small", 1536, 2]);
  });

  it("returns null when the kind has no row", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await expect(
      makeRepo().updateServingModel("audio_vibe", "m", 1)
    ).resolves.toBeNull();
  });
});

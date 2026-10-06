import { beforeEach, describe, expect, it, vi } from "vitest";

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({ dbQuery }));

import { genreReconciliationRepository as repo } from "../genreReconciliationRepository";

// SQL shape and parameter mapping only. What Postgres actually accepts is
// checked by genreReconciliation.integration.test.ts (just genres-test).
beforeEach(() => {
  dbQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
});

const options = { ai: true, new_genre_min_tracks: 5, limit: null, refresh: false };

describe("genreReconciliationRepository", () => {
  it("lists live tagged tracks through the pool or a transaction client", async () => {
    dbQuery.mockResolvedValue({ rows: [{ track_id: "1" }] });
    await expect(repo.listLocalTagTracks()).resolves.toEqual([{ track_id: "1" }]);
    expect(dbQuery.mock.calls[0][0]).toContain("t.deleted_at IS NULL");

    const client = { query: vi.fn().mockResolvedValue({ rows: [{ track_id: "2" }] }) };
    await expect(repo.listLocalTagTracks(client as never)).resolves.toEqual([{ track_id: "2" }]);
  });

  it("lists the taxonomy with parent names", async () => {
    dbQuery.mockResolvedValue({ rows: [{ id: "g", name: "Cumbia", parent_name: "Latin" }] });
    await expect(repo.listTaxonomy()).resolves.toHaveLength(1);
  });

  it("resolves exact values to genre ids", async () => {
    dbQuery.mockResolvedValue({ rows: [{ value: "cumbia", genre_id: "g" }] });
    await expect(repo.resolveExactValues(["cumbia", "nope"])).resolves.toEqual(new Map([["cumbia", "g"]]));
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("unnest($1::text[])"), [["cumbia", "nope"]]);
  });

  it("maps proposal states by value", async () => {
    dbQuery.mockResolvedValue({ rows: [{ value_normalized: "cumbia", status: "accepted", method: "exact", action: "map" }] });
    const states = await repo.listProposalStates();
    expect(states.get("cumbia")).toEqual({ status: "accepted", method: "exact", action: "map" });
  });

  it("upserts drafts as JSON, protecting reviewed rows, and skips an empty batch", async () => {
    await repo.upsertProposals([], "run");
    expect(dbQuery).not.toHaveBeenCalled();
    const draft = { value_normalized: "x", raw_examples: ["X"], track_count: 1, action: "drop" as const, target_genre_ids: [], proposed_genre_name: null, proposed_parent_id: null, confidence: 0.5, method: "ai" as const };
    await repo.upsertProposals([draft], "run");
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("CASE WHEN p.status = 'pending'");
    expect(params).toEqual([JSON.stringify([draft]), "run"]);
  });

  it("refreshes stats for every proposal", async () => {
    await repo.refreshProposalStats([{ value_normalized: "x", raw_examples: ["X"], track_count: 2 }]);
    expect(dbQuery.mock.calls[0][1]).toEqual([JSON.stringify([{ value_normalized: "x", raw_examples: ["X"], track_count: 2 }])]);
  });

  it("manages runs", async () => {
    await repo.failStaleRuns(15);
    expect(dbQuery).toHaveBeenLastCalledWith(expect.stringContaining("make_interval"), [15]);

    dbQuery.mockResolvedValueOnce({ rows: [{ id: "run" }] }).mockResolvedValueOnce({ rows: [] });
    await expect(repo.createRun(options, "m")).resolves.toEqual({ id: "run" });
    expect(dbQuery).toHaveBeenLastCalledWith(expect.stringContaining("ON CONFLICT (status) WHERE status = 'running'"), [JSON.stringify(options), "m"]);
    await expect(repo.createRun(options, null)).resolves.toBeNull();

    dbQuery.mockResolvedValueOnce({ rows: [{ id: "running" }] }).mockResolvedValueOnce({ rows: [] });
    await expect(repo.getRunningRun()).resolves.toEqual({ id: "running" });
    await expect(repo.getRunningRun()).resolves.toBeNull();

    dbQuery.mockResolvedValueOnce({ rows: [{ id: "run" }] }).mockResolvedValueOnce({ rows: [] });
    await expect(repo.getRun("run")).resolves.toEqual({ id: "run" });
    await expect(repo.getRun("gone")).resolves.toBeNull();

    await repo.updateRun("run", { exact_matches: 3, cost_usd: 0.5, kept: undefined });
    expect(dbQuery).toHaveBeenLastCalledWith(
      expect.stringContaining("SET exact_matches = $2, cost_usd = $3, updated_at = now()"),
      ["run", 3, 0.5]
    );

    await repo.finishRun("run", "completed");
    expect(dbQuery).toHaveBeenLastCalledWith(expect.stringContaining("finished_at = now()"), ["run", "completed", null]);
  });

  it("lists proposals with filters and paging", async () => {
    dbQuery
      .mockResolvedValueOnce({ rows: [{ id: "p" }] })
      .mockResolvedValueOnce({ rows: [{ total: 7 }] });
    await expect(repo.listProposals({ status: "pending", method: "ai", limit: 10, offset: 20 }))
      .resolves.toEqual({ proposals: [{ id: "p" }], total: 7 });
    const [listSql, listParams] = dbQuery.mock.calls[0];
    expect(listSql).toContain("WHERE p.status = $1 AND p.method = $2");
    expect(listSql).toContain("LIMIT $3 OFFSET $4");
    expect(listParams).toEqual(["pending", "ai", 10, 20]);
    expect(dbQuery.mock.calls[1][1]).toEqual(["pending", "ai"]);

    dbQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ total: 0 }] });
    await repo.listProposals({ limit: 50, offset: 0 });
    expect(dbQuery.mock.calls[2][0]).not.toContain("WHERE p.");
  });

  it("gets and updates a proposal", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: "p" }] }).mockResolvedValueOnce({ rows: [] });
    await expect(repo.getProposal("p")).resolves.toEqual({ id: "p" });
    await expect(repo.getProposal("gone")).resolves.toBeNull();

    dbQuery.mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({});
    await expect(repo.updateProposal("p", { status: "edited", target_genre_ids: ["g"] })).resolves.toBe(true);
    expect(dbQuery.mock.calls[2]).toEqual([
      expect.stringContaining("SET status = $2, target_genre_ids = $3::uuid[], updated_at = now()"),
      ["p", "edited", ["g"]],
    ]);
    await expect(repo.updateProposal("gone", {})).resolves.toBe(false);
  });

  it("locks the approved proposals it applies", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ id: "p" }] }) };
    await expect(repo.listApprovedProposals(client as never, ["p"])).resolves.toEqual([{ id: "p" }]);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("FOR UPDATE OF p"), [["p"]]);
    await repo.listApprovedProposals(client as never);
    expect(client.query).toHaveBeenLastCalledWith(expect.any(String), [null]);
  });

  it("reads which tracks have links and descriptors", async () => {
    dbQuery
      .mockResolvedValueOnce({ rows: [{ key: "1:6" }] })
      .mockResolvedValueOnce({ rows: [{ key: "2:6" }] });
    const state = await repo.listTrackGenreState();
    expect([...state.linked]).toEqual(["1:6"]);
    expect([...state.described]).toEqual(["2:6"]);
  });
});

/**
 * The SQL shape of set derivation reads and writes (#282). What these
 * statements do against a real Postgres is `setDerivationRepository
 * .integration.test.ts` (`just set-derivation-test`); this pins the
 * parameters each method binds.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({ dbQuery }));

import { SetDerivationRepository } from "../setDerivationRepository";

const repo = () => new SetDerivationRepository();
const SHA = "a".repeat(64);
const ENGINE = { fingerprint_type: "chromaprint", fingerprint_version: "1" };
const KEY = { recording_sha256: SHA, ...ENGINE, window_seconds: 15, step_seconds: 15 };

beforeEach(() => {
  vi.resetAllMocks();
  dbQuery.mockResolvedValue({ rows: [] });
});

describe("runs", () => {
  it("creates a run from its key", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: "d1" }] });
    expect(await repo().create(KEY)).toEqual({ id: "d1" });
    expect(dbQuery.mock.calls[0][0]).toMatch(/INSERT INTO set_derivations/);
    expect(dbQuery.mock.calls[0][1]).toEqual([SHA, "chromaprint", "1", 15, 15]);
  });

  it("finds a run by id, or null", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: "d1" }] });
    expect(await repo().findById("d1")).toEqual({ id: "d1" });
    expect(await repo().findById("d2")).toBeNull();
  });

  it("looks for the newest non-failed run with the same key", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: "d1" }] });
    expect(await repo().findReusable(KEY)).toEqual({ id: "d1" });
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/status <> 'failed'/);
    expect(sql).toMatch(/ORDER BY created_at DESC/);
    expect(params).toEqual([SHA, "chromaprint", "1", 15, 15]);
    expect(await repo().findReusable(KEY)).toBeNull();
  });

  it.each([
    ["processing", false],
    ["processed", true],
    ["failed", true],
  ] as const)("transitions to %s, completing the run: %s", async (to, terminal) => {
    await repo().transitionStatus("d1", to, ["queued"], null);
    expect(dbQuery.mock.calls[0][1]).toEqual(["d1", to, null, ["queued"], terminal]);
  });

  it("returns the transitioned row, or null when the guard did not match", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: "d1", status: "processing" }] });
    expect(await repo().transitionStatus("d1", "processing", ["queued"])).toEqual({ id: "d1", status: "processing" });
    expect(await repo().transitionStatus("d1", "processing", ["queued"])).toBeNull();
    expect(dbQuery.mock.calls[1][1][2]).toBeNull();
  });

  it("completes a run with its windows as JSON, guarded against terminal runs", async () => {
    const windows = [{ start_seconds: 0, duration_seconds: 15, candidates: [] }];
    dbQuery.mockResolvedValueOnce({ rows: [{ id: "d1" }] });

    expect(await repo().complete("d1", { status: "processed", error: null, duration_seconds: 15, windows })).toEqual({ id: "d1" });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/status IN \('queued', 'processing'\)/);
    expect(params).toEqual(["d1", "processed", null, 15, JSON.stringify(windows)]);
    expect(await repo().complete("d1", { status: "failed", error: "x", duration_seconds: null, windows: [] })).toBeNull();
  });
});

describe("reads for the view", () => {
  it("resolves track refs through parallel arrays, skipping the query when empty", async () => {
    expect(await repo().findTracks([])).toEqual([]);
    expect(dbQuery).not.toHaveBeenCalled();

    dbQuery.mockResolvedValueOnce({ rows: [{ track_id: "1-A1" }] });
    expect(await repo().findTracks([{ track_id: "1-A1", friend_id: 1 }, { track_id: "2-B1", friend_id: 2 }])).toEqual([
      { track_id: "1-A1" },
    ]);
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/unnest\(\$1::text\[\], \$2::int\[\]\)/);
    expect(params).toEqual([["1-A1", "2-B1"], [1, 2]]);
  });

  it("numbers planned entries in playlist order", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [{ track_id: "1-A1", fingerprinted: true }, { track_id: "2-B1", fingerprinted: false }],
    });
    expect(await repo().listPlannedEntries(176, ENGINE)).toEqual([
      { track_id: "1-A1", fingerprinted: true, index: 0 },
      { track_id: "2-B1", fingerprinted: false, index: 1 },
    ]);
    expect(dbQuery.mock.calls[0][1]).toEqual([176, "chromaprint", "1"]);
  });

  it("lists unindexed tracks on releases, skipping the query when there are none", async () => {
    expect(await repo().listUnindexedOnReleases([], ENGINE)).toEqual([]);
    expect(dbQuery).not.toHaveBeenCalled();

    dbQuery.mockResolvedValueOnce({ rows: [{ track_id: "1-A2" }] });
    expect(await repo().listUnindexedOnReleases(["1"], ENGINE)).toEqual([{ track_id: "1-A2" }]);
    expect(dbQuery.mock.calls[0][1]).toEqual([["1"], "chromaprint", "1"]);
  });

  it("resolves a live set to its playlist, or null", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ playlist_id: 176 }] });
    expect(await repo().findPlaylistIdForLiveSet(3)).toBe(176);
    expect(await repo().findPlaylistIdForLiveSet(4)).toBeNull();
  });

  it("checks a playlist exists", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{}] });
    expect(await repo().playlistExists(176)).toBe(true);
    expect(await repo().playlistExists(9)).toBe(false);
  });

  it("attaches a recording to a live set only if it is not already there", async () => {
    await repo().attachToLiveSet(3, `/api/set-recordings/${SHA}`, "set.mp3");
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/WHERE NOT EXISTS/);
    expect(params).toEqual([3, `/api/set-recordings/${SHA}`, "set.mp3"]);
  });
});

/**
 * The repository's branches with a mocked driver. The SQL itself (the one-
 * active index, SKIP LOCKED, the lease) is checked against real Postgres in
 * `discogsImportRepository.integration.test.ts` (`just discogs-imports-test`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ dbQuery: vi.fn() }));
vi.mock("@/lib/serverDb", () => db);

import { DiscogsImportRepository } from "../discogsImportRepository";

const repo = new DiscogsImportRepository();
const result = (rows: unknown[] = [], rowCount = rows.length) => ({ rows, rowCount });

beforeEach(() => {
  db.dbQuery.mockReset();
});

describe("DiscogsImportRepository", () => {
  it("returns the row it inserted as created", async () => {
    db.dbQuery.mockResolvedValueOnce(result([{ id: 1 }]));
    expect(await repo.create("dj")).toEqual({ row: { id: 1 }, created: true });
    expect(db.dbQuery.mock.calls[0][0]).toContain("ON CONFLICT (lower(username))");
  });

  it("returns the active row when the insert lost to it", async () => {
    db.dbQuery.mockResolvedValueOnce(result()).mockResolvedValueOnce(result([{ id: 2 }]));
    expect(await repo.create("dj")).toEqual({ row: { id: 2 }, created: false });
  });

  it("tries again when the winner finished before it could be read, then gives up", async () => {
    db.dbQuery
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce(result([{ id: 3 }]));
    expect(await repo.create("dj")).toEqual({ row: { id: 3 }, created: true });

    db.dbQuery.mockResolvedValue(result());
    await expect(repo.create("dj")).rejects.toThrow("Could not queue a Discogs import for dj");
  });

  it("reads one import, the active one and the latest per username", async () => {
    db.dbQuery.mockResolvedValueOnce(result([{ id: 1 }])).mockResolvedValueOnce(result());
    expect(await repo.get(1)).toEqual({ id: 1 });
    expect(await repo.get(2)).toBeNull();

    db.dbQuery.mockResolvedValueOnce(result());
    expect(await repo.findActive("dj")).toBeNull();

    db.dbQuery.mockResolvedValueOnce(result([{ id: 4 }]));
    expect(await repo.listLatest({ activeOnly: true })).toEqual([{ id: 4 }]);
    expect(db.dbQuery.mock.calls.at(-1)![0]).toContain("WHERE status IN ('queued', 'running')");
    db.dbQuery.mockResolvedValueOnce(result());
    await repo.listLatest();
    expect(db.dbQuery.mock.calls.at(-1)![0]).not.toContain("WHERE status IN");
  });

  it("claims with the owner and lease, or returns null", async () => {
    db.dbQuery.mockResolvedValueOnce(result([{ id: 1 }])).mockResolvedValueOnce(result());
    expect(await repo.claimNext("me", 60)).toEqual({ id: 1 });
    expect(db.dbQuery.mock.calls[0][0]).toContain("FOR UPDATE SKIP LOCKED");
    expect(db.dbQuery.mock.calls[0][1]).toEqual(["me", 60]);
    expect(await repo.claimNext("me", 60)).toBeNull();
  });

  it("says whether the owner still held the row for a heartbeat, a progress write or finishing", async () => {
    db.dbQuery.mockResolvedValueOnce(result([], 1)).mockResolvedValueOnce({ rows: [] });
    expect(await repo.heartbeat(1, "me", 60)).toBe(true);
    expect(await repo.heartbeat(1, "me", 60)).toBe(false);

    db.dbQuery.mockResolvedValueOnce(result([], 1)).mockResolvedValueOnce(result([], 0));
    expect(await repo.finish(1, "me", "completed", null)).toBe(true);
    expect(await repo.finish(1, "me", "failed", "x")).toBe(false);
  });

  it("writes only the progress fields given, and nothing for none", async () => {
    expect(await repo.updateProgress(1, "me", {})).toBe(true);
    expect(db.dbQuery).not.toHaveBeenCalled();

    db.dbQuery.mockResolvedValueOnce(result([], 1)).mockResolvedValueOnce({ rows: [] });
    expect(await repo.updateProgress(1, "me", { phase: "fetching", fetched: 3 })).toBe(true);
    const [sql, values] = db.dbQuery.mock.calls[0];
    expect(sql).toContain("phase = $3, fetched = $4");
    expect(values).toEqual([1, "me", "fetching", 3]);
    expect(await repo.updateProgress(1, "me", { total: 0 })).toBe(false);
  });

  it("appends log lines in one statement, and reads them back with numeric ids", async () => {
    await repo.appendLog(1, []);
    expect(db.dbQuery).not.toHaveBeenCalled();
    db.dbQuery.mockResolvedValueOnce(result());
    await repo.appendLog(1, ["a", "b"]);
    expect(db.dbQuery.mock.calls[0][1]).toEqual([1, ["a", "b"]]);

    db.dbQuery.mockResolvedValueOnce(result([{ id: "12", line: "a" }]));
    expect(await repo.readLog(1, 0, 10)).toEqual([{ id: 12, line: "a" }]);
  });

  it("treats a missing row count as the import no longer being the owner's", async () => {
    db.dbQuery.mockResolvedValueOnce({ rows: [], rowCount: null });
    expect(await repo.finish(1, "me", "completed", null)).toBe(false);
  });

  it("prunes a username's old finished imports", async () => {
    db.dbQuery.mockResolvedValueOnce(result());
    await repo.prune("dj", 10);
    expect(db.dbQuery.mock.calls[0][1]).toEqual(["dj", 10]);
  });
});

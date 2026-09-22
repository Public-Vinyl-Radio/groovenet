import { beforeEach, describe, expect, it, vi } from "vitest";

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({ dbQuery }));

import { PlayDetectionRepository, playDetectionRetentionDays } from "../playDetectionRepository";

const repo = () => new PlayDetectionRepository();

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.PLAY_DETECTIONS_RETENTION_DAYS;
});

describe("PlayDetectionRepository.create", () => {
  it("persists every candidate for one window independently", async () => {
    dbQuery.mockResolvedValue({ rows: [{ id: "detection-id" }] });
    const input = {
      ingest_id: "ingest-id", source_id: "listener-1", session_id: "session-1",
      track_id: "track-a", friend_id: 2, confidence: 0.87, offset_seconds: 12.5,
      window_start_at: "2026-09-20T12:00:00Z", fingerprint_type: "chromaprint",
      fingerprint_version: "1",
    };

    await expect(repo().create(input)).resolves.toEqual({ id: "detection-id" });
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO play_detections/);
    expect(params[0]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(params.slice(1)).toEqual([
      "ingest-id", "listener-1", "session-1", "track-a", 2, 0.87, 12.5,
      "2026-09-20T12:00:00Z", "chromaprint", "1",
    ]);
  });

  it("persists a no-match window with a null track", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: "no-match" }] });
    await repo().create({ id: "no-match", ingest_id: "ingest-id", source_id: "listener-1" });
    expect(dbQuery.mock.calls[0][1][0]).toBe("no-match");
    expect(dbQuery.mock.calls[0][1].slice(3)).toEqual(Array(8).fill(null));
  });
});

describe("PlayDetectionRepository lookups and retention", () => {
  it("uses the source and recent-window query shape needed by aggregation", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: "detection-id" }] });
    await expect(repo().listRecentBySource("listener-1", "2026-09-20T12:00:00Z")).resolves.toEqual([
      { id: "detection-id" },
    ]);
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/source_id = \$1 AND window_start_at >= \$2/);
    expect(sql).toMatch(/ORDER BY window_start_at ASC, id ASC/);
    expect(params).toEqual(["listener-1", "2026-09-20T12:00:00Z"]);
  });

  it("prunes rows using the configured retention period", async () => {
    dbQuery.mockResolvedValueOnce({ rowCount: 4 });
    await expect(repo().pruneExpired(7)).resolves.toBe(4);
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/created_at < current_timestamp/);
    expect(params).toEqual([7]);
  });

  it("returns zero when the database reports no affected-row count", async () => {
    dbQuery.mockResolvedValueOnce({ rowCount: null });
    await expect(repo().pruneExpired(7)).resolves.toBe(0);
  });

  it("reads retention days from configuration and allows pruning to be disabled", async () => {
    expect(playDetectionRetentionDays()).toBe(30);
    process.env.PLAY_DETECTIONS_RETENTION_DAYS = "0";
    expect(playDetectionRetentionDays()).toBe(0);
    await expect(repo().pruneExpired()).resolves.toBe(0);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("rejects an invalid retention setting", () => {
    process.env.PLAY_DETECTIONS_RETENTION_DAYS = "one-week";
    expect(playDetectionRetentionDays).toThrow(
      "PLAY_DETECTIONS_RETENTION_DAYS must be a non-negative integer"
    );
  });
});

// ─── debug reads (#299) ───────────────────────────────────────────────────────

describe("listRecent()", () => {
  it("left joins the track so a no-match row survives", async () => {
    // An inner join would silently drop every no-match window.
    dbQuery.mockResolvedValue({ rows: [] });
    await new PlayDetectionRepository().listRecent();
    expect(dbQuery.mock.calls[0][0]).toContain("LEFT JOIN tracks");
  });

  it("joins on the compound track key", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    await new PlayDetectionRepository().listRecent();
    const sql = dbQuery.mock.calls[0][0] as string;
    expect(sql).toContain("t.track_id = d.track_id");
    expect(sql).toContain("t.friend_id = d.friend_id");
  });

  it("returns the newest window first", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    await new PlayDetectionRepository().listRecent();
    expect(dbQuery.mock.calls[0][0]).toContain("ORDER BY d.window_start_at DESC");
  });

  it("filters to matches", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    await new PlayDetectionRepository().listRecent({ matched: true });
    expect(dbQuery.mock.calls[0][0]).toContain("d.track_id IS NOT NULL");
  });

  it("filters to no-match windows", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    await new PlayDetectionRepository().listRecent({ matched: false });
    expect(dbQuery.mock.calls[0][0]).toContain("d.track_id IS NULL");
  });

  it("applies neither filter when matched is unset", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    await new PlayDetectionRepository().listRecent({});
    const sql = dbQuery.mock.calls[0][0] as string;
    expect(sql).not.toContain("d.track_id IS NULL");
    expect(sql).not.toContain("d.track_id IS NOT NULL");
  });

  it("binds source, session, since and paging", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    await new PlayDetectionRepository().listRecent({
      source_id: "aswitch", session_id: "s1", since: "2026-09-21T00:00:00Z",
      limit: 10, offset: 20,
    });
    expect(dbQuery.mock.calls[0][1]).toEqual([
      "aswitch", "s1", "2026-09-21T00:00:00Z", 10, 20,
    ]);
  });
});

// ─── active sources (#304) ──────────────────────────────────────────────────

describe("listActiveSourceIds()", () => {
  it("returns the distinct sources with recent activity", async () => {
    dbQuery.mockResolvedValue({
      rows: [{ source_id: "listener-1" }, { source_id: "listener-2" }],
    });

    const result = await repo().listActiveSourceIds("2026-09-20T12:00:00Z");

    expect(result).toEqual(["listener-1", "listener-2"]);
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/SELECT DISTINCT source_id/);
    expect(sql).toMatch(/window_start_at >= \$1/);
    expect(params).toEqual(["2026-09-20T12:00:00Z"]);
  });

  it("returns an empty list rather than throwing when nothing is active", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    expect(await repo().listActiveSourceIds(new Date())).toEqual([]);
  });
});

describe("statsSince()", () => {
  it("counts matched and unmatched separately", async () => {
    dbQuery
      .mockResolvedValueOnce({ rows: [{ windows: "10", matched: "8", no_match: "2" }] })
      .mockResolvedValueOnce({ rows: [{ band: "0.90-1.00", count: "8" }] });

    const s = await new PlayDetectionRepository().statsSince(new Date());

    expect(s).toMatchObject({ windows: 10, matched: 8, noMatch: 2 });
    expect(s.bands).toEqual([{ band: "0.90-1.00", count: 8 }]);
  });

  it("returns zeroes for a quiet window rather than NaN", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    const s = await new PlayDetectionRepository().statsSince(new Date());
    expect(s).toMatchObject({ windows: 0, matched: 0, noMatch: 0, bands: [] });
  });

  it("scopes to a source", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    const since = new Date();
    await new PlayDetectionRepository().statsSince(since, "aswitch");
    expect(dbQuery.mock.calls[0][1]).toEqual([since, "aswitch"]);
  });
});

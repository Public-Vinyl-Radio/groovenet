import { describe, expect, it, vi } from "vitest";

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({ dbQuery }));
import { TrackSpinEventRepository } from "../trackSpinEventRepository";

describe("TrackSpinEventRepository edits", () => {
  const repo = new TrackSpinEventRepository();

  it("deletes a session's events", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await repo.deleteEventsBySessionId({ query }, 7);
    expect(query).toHaveBeenCalledWith("DELETE FROM track_spin_events WHERE session_id = $1", [7]);
  });

  it("moves a session's events to a new time, returned in play order", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { id: 2, ordinal: 1 },
        { id: 1, ordinal: 0 },
      ],
    });

    const rows = await repo.setPlayedAtForSession({ query }, 7, "2026-09-20T20:00:00.000Z");

    expect(query.mock.calls[0][0]).toMatch(/UPDATE track_spin_events SET played_at = \$2 WHERE session_id = \$1/);
    expect(query.mock.calls[0][1]).toEqual([7, "2026-09-20T20:00:00.000Z"]);
    expect(rows.map((row) => row.ordinal)).toEqual([0, 1]);
  });
});

describe("TrackSpinEventRepository.listTopTracks", () => {
  const repo = new TrackSpinEventRepository();

  it("includes hasVectors, correlated on the aggregated row (#468)", async () => {
    dbQuery.mockReset().mockResolvedValue({ rows: [] });

    await repo.listTopTracks({ friend_id: 6, limit: 12, offset: 0 });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain('AS "hasVectors"');
    expect(sql).toContain("te.track_id = aggregated.track_id");
    expect(sql).toContain("te.friend_id = aggregated.friend_id");
    expect(params).toEqual([6, 12, 0]);
  });

  it("scopes to a release when given one", async () => {
    dbQuery.mockReset().mockResolvedValue({ rows: [] });

    await repo.listTopTracks({ friend_id: 6, release_id: "r1", limit: 5, offset: 10 });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("tse.release_id = $2");
    expect(params).toEqual([6, "r1", 5, 10]);
  });

  it("includes track_genres and styles, correlated on the aggregated row (#470)", async () => {
    dbQuery.mockReset().mockResolvedValue({ rows: [] });

    await repo.listTopTracks({ friend_id: 6, limit: 12, offset: 0 });

    const [sql] = dbQuery.mock.calls[0];
    expect(sql).toContain("AS track_genres");
    expect(sql).toContain("tg.track_id = aggregated.track_id");
    expect(sql).toContain("tg.friend_id = aggregated.friend_id");
    expect(sql).toContain("COALESCE(t.styles, '{}') AS styles");
  });
});

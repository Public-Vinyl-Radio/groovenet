import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/serverDb", () => ({ dbQuery: vi.fn() }));
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

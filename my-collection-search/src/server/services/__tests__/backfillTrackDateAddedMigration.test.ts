import { describe, expect, it, vi } from "vitest";
import { up, down } from "../../../../migrations/1793200000000_backfill-track-date-added.js";

describe("track date_added backfill migration (#847)", () => {
  it("copies the album's date onto tracks that have none, matched by release and friend", () => {
    const pgm = { sql: vi.fn() };
    up(pgm as never);
    const sql: string = pgm.sql.mock.calls[0][0];
    expect(sql).toContain("SET date_added = a.date_added");
    expect(sql).toContain("t.release_id = a.release_id");
    expect(sql).toContain("t.friend_id = a.friend_id");
    expect(sql).toContain("t.date_added IS NULL");
    expect(sql).toContain("a.date_added IS NOT NULL");
  });

  it("rolls back as a no-op", () => {
    expect(down()).toBeUndefined();
  });
});

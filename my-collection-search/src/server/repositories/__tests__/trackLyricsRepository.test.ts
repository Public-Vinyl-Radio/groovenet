import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrackLyricsRepository } from "../trackLyricsRepository";

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({ dbQuery }));

const repo = new TrackLyricsRepository();

beforeEach(() => {
  vi.resetAllMocks();
});

describe("findTrackLibrary()", () => {
  it("returns the username of the library holding the track", async () => {
    dbQuery.mockResolvedValue({ rows: [{ username: "owner" }] });
    expect(await repo.findTrackLibrary("t1", 1)).toBe("owner");
    const [sql, values] = dbQuery.mock.calls[0];
    expect(sql).toContain("JOIN friends f ON f.id = t.friend_id");
    expect(values).toEqual(["t1", 1]);
  });

  it("returns null for an unknown track", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    expect(await repo.findTrackLibrary("t1", 1)).toBeNull();
  });
});

describe("find()", () => {
  it("returns the row, or null when there is none", async () => {
    const row = { text: "verse", source: "embedded", updated_at: new Date() };
    dbQuery.mockResolvedValueOnce({ rows: [row] }).mockResolvedValueOnce({ rows: [] });
    expect(await repo.find("t1", 1)).toEqual(row);
    expect(await repo.find("t1", 1)).toBeNull();
    expect(dbQuery.mock.calls[0][0]).toContain("FROM track_lyrics");
  });
});

describe("saveUserLyrics()", () => {
  it("upserts as source 'user', taking over an embedded row", async () => {
    const row = { text: "mine", source: "user", updated_at: new Date() };
    dbQuery.mockResolvedValue({ rows: [row] });
    expect(await repo.saveUserLyrics("t1", 1, "mine")).toEqual(row);
    const [sql, values] = dbQuery.mock.calls[0];
    expect(sql).toContain("VALUES ($1, $2, $3, 'user')");
    expect(sql).toContain("source = 'user'");
    expect(values).toEqual(["t1", 1, "mine"]);
  });
});

describe("delete()", () => {
  it("drops the row whatever its source and reports whether one went", async () => {
    dbQuery
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: null });
    expect(await repo.delete("t1", 1)).toBe(true);
    expect(await repo.delete("t1", 1)).toBe(false);
    expect(await repo.delete("t1", 1)).toBe(false);
    expect(dbQuery.mock.calls[0][0]).not.toContain("source");
  });
});

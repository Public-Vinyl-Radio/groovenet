import { beforeEach, describe, expect, it, vi } from "vitest";

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({ dbQuery }));

import { GenrePageRepository } from "../genrePageRepository";

const filter = { ids: ["g1", "g2"], keys: ["cumbia", "chicha"] };
const repo = new GenrePageRepository();
const lastCall = () => dbQuery.mock.calls.at(-1) as [string, unknown[]];

describe("GenrePageRepository", () => {
  beforeEach(() => {
    dbQuery.mockReset().mockResolvedValue({ rows: [{ tracks: 1, albums: 2, albums_total: 3 }] });
  });

  it("counts in one query, binding the genre, its own keys and the expanded filter", async () => {
    const counts = await repo.counts({ genreId: "g1", ownKeys: ["cumbia"], filter, friendId: 6 });

    expect(counts).toEqual({ tracks: 1, albums: 2, albums_total: 3 });
    const [sql, params] = lastCall();
    expect(params).toEqual([6, "g1", ["cumbia"], ["cumbia", "chicha"], ["g1", "g2"]]);
    expect(sql).toContain("AND t.friend_id = $1");
    expect(sql).toContain("AND a.friend_id = $1");
  });

  it("counts every collection without a friend", async () => {
    await repo.counts({ genreId: "g1", ownKeys: ["cumbia"], filter });

    const [sql, params] = lastCall();
    expect(params[0]).toBe("g1");
    expect(sql).not.toContain("friend_id = $");
  });

  it("lists tracks by plays, then newest, scoped and limited", async () => {
    dbQuery.mockResolvedValue({ rows: [{ track_id: "t1", play_count: 2 }] });
    expect(await repo.topTracks(filter, 6, 10)).toEqual([{ track_id: "t1", play_count: 2 }]);

    const [sql, params] = lastCall();
    expect(sql).toContain("ORDER BY play_count DESC, t.date_added DESC NULLS LAST");
    expect(sql).toContain("t.friend_id = $3");
    expect(params).toEqual([["g1", "g2"], ["cumbia", "chicha"], 6, 10]);

    await repo.topTracks(filter, undefined, 5);
    expect(lastCall()[0]).not.toContain("t.friend_id = $");
    expect(lastCall()[1]).toEqual([["g1", "g2"], ["cumbia", "chicha"], 5]);
  });

  it("includes hasVectors, so top tracks don't show a false 'No embedding' badge on a fresh load (#468)", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    await repo.topTracks(filter, 6, 10);

    expect(lastCall()[0]).toContain('AS "hasVectors"');
  });

  it("lists albums by plays of their tracks, then newest, scoped and limited", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    expect(await repo.topAlbums(filter, 6, 8)).toEqual([]);

    const [sql, params] = lastCall();
    expect(sql).toContain("GROUP BY release_id, friend_id");
    expect(sql).toContain("a.friend_id = $3");
    expect(params).toEqual([["cumbia", "chicha"], ["g1", "g2"], 6, 8]);

    await repo.topAlbums(filter, undefined, 8);
    expect(lastCall()[0]).not.toContain("a.friend_id = $");
  });
});

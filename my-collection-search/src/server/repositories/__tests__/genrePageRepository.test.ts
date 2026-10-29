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
    expect(lastCall()[0]).toContain("COALESCE(t.album, '') AS album");
    expect(lastCall()[0]).toContain("COALESCE(t.duration, '') AS duration");
    expect(lastCall()[0]).toContain("COALESCE(t.position, '') AS position");
    expect(lastCall()[0]).toContain("COALESCE(t.genres, '{}'::text[]) AS genres");
    expect(lastCall()[0]).toContain("COALESCE(t.styles, '{}'::text[]) AS styles");
    expect(lastCall()[0]).toContain(
      "CASE WHEN t.bpm > 0 AND t.bpm < 'Infinity'::real THEN t.bpm ELSE NULL END AS bpm",
    );
  });

  it("lists albums by plays of their tracks, then newest, scoped and limited", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    expect(await repo.topAlbums(filter, 6, 8)).toEqual([]);

    const [sql, params] = lastCall();
    expect(sql).toContain("GROUP BY release_id, friend_id");
    // pg returns NUMERIC as a string; the wire album contract requires a number.
    expect(sql).toContain("a.purchase_price::double precision AS purchase_price");
    expect(sql).toContain("a.friend_id = $3");
    expect(params).toEqual([["cumbia", "chicha"], ["g1", "g2"], 6, 8]);

    await repo.topAlbums(filter, undefined, 8);
    expect(lastCall()[0]).not.toContain("a.friend_id = $");
  });

  it("counts vinyl spins only for tracks and albums (#653)", async () => {
    await repo.topTracks(filter, 6, 10);
    await repo.topAlbums(filter, 6, 10);

    for (const [sql] of dbQuery.mock.calls as [string][]) {
      expect(sql).toContain("session_id IN (SELECT id FROM spin_sessions WHERE medium = 'vinyl')");
    }
  });
});

describe("full genre statistics", () => {
  it("uses search's deduplicating filter, scoped to live tracks, with explicit calendar-year bounds", async () => {
    const stats = {
      bpm_min: 90,
      bpm_max: 120.5,
      added_this_year: 4,
      playable_tracks: 3,
      bpm_histogram: [{ min: 90, max: 100, count: 1 }],
    };
    dbQuery.mockResolvedValue({ rows: [stats] });
    expect(await repo.stats(filter, 6, 2026)).toEqual({ ...stats, year: 2026 });
    const [sql, params] = lastCall();
    expect(params).toEqual([filter.ids, filter.keys, 6, "2026-01-01", "2027-01-01"]);
    expect(sql).toContain("t.deleted_at IS NULL");
    expect(sql).toContain("t.friend_id = $3");
    expect(sql).toContain("EXISTS (SELECT 1 FROM track_genres");
    expect(sql).toContain("date_added >= $4::timestamp AND date_added < $5::timestamp");
    expect(sql).toContain("bpm > 0 AND bpm < 'Infinity'::real");
    expect(sql).toContain("NULLIF(btrim(local_audio_url), '') IS NOT NULL");
    expect(sql).not.toContain("LIMIT");
  });

  it("also supports all collections and an empty BPM range", async () => {
    const stats = {
      bpm_min: null,
      bpm_max: null,
      added_this_year: 0,
      playable_tracks: 0,
      bpm_histogram: [],
    };
    dbQuery.mockResolvedValue({ rows: [stats] });
    expect(await repo.stats(filter, undefined, 2027)).toEqual({ ...stats, year: 2027 });
    expect(lastCall()[1]).toEqual([filter.ids, filter.keys, "2027-01-01", "2028-01-01"]);
  });
});

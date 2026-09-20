import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaylistTrackInput } from "@/api-contract/schemas";

const dbQuery = vi.hoisted(() => vi.fn());
const dbPool = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock("@/lib/serverDb", () => ({ dbQuery, dbPool }));

import { PlaylistRepository } from "../playlistRepository";

function repo() {
  return new PlaylistRepository();
}

/** A fake pg client whose query() is a mock. */
function fakeClient(rowCount = 0, rows: unknown[] = []) {
  return { query: vi.fn().mockResolvedValue({ rowCount, rows }) };
}

beforeEach(() => {
  vi.resetAllMocks();
  dbQuery.mockResolvedValue({ rows: [] });
});

// ─── Friend lookups ───────────────────────────────────────────────────────────

describe("PlaylistRepository — friend lookups", () => {
  it("getDefaultFriendId returns the lowest friend id", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: 3 }] });
    await expect(repo().getDefaultFriendId()).resolves.toBe(3);
  });

  it("getDefaultFriendId throws when there are no friends", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });
    await expect(repo().getDefaultFriendId()).rejects.toThrow(/no friends/i);
  });

  it("findFriendIdByUsername returns id or null", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: 9 }] });
    await expect(repo().findFriendIdByUsername("alice")).resolves.toBe(9);
    dbQuery.mockResolvedValueOnce({ rows: [] });
    await expect(repo().findFriendIdByUsername("nobody")).resolves.toBeNull();
  });

  it("findFriendUsernameById returns username or null", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ username: "bob" }] });
    await expect(repo().findFriendUsernameById(1)).resolves.toBe("bob");
    dbQuery.mockResolvedValueOnce({ rows: [] });
    await expect(repo().findFriendUsernameById(2)).resolves.toBeNull();
  });
});

// ─── Playlist reads ─────────────────────────────────────────────────────────

describe("PlaylistRepository — reads", () => {
  it("short-circuits live set summaries for no playlists", async () => {
    await expect(repo().listLiveSetSummariesByPlaylistIds([])).resolves.toEqual({});
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("maps live set summaries back to their playlist ids", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [{
        playlist_id: 1,
        id: 7,
        title: "Late night",
        status: "performed",
        cover_image_url: null,
        last_performed_at: "2026-09-01T00:00:00.000Z",
        venue_name: "The Room",
        location_city: "Seattle",
        collaborators: [{ friend_id: 2, username: "alex", role: "DJ" }],
      }],
    });
    await expect(repo().listLiveSetSummariesByPlaylistIds([1, 2])).resolves.toEqual({
      1: {
        id: 7, title: "Late night", status: "performed", cover_image_url: null,
        last_performed_at: "2026-09-01T00:00:00.000Z", venue_name: "The Room",
        location_city: "Seattle", collaborators: [{ friend_id: 2, username: "alex", role: "DJ" }],
      },
    });
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/live_sets/);
    expect(sql).toMatch(/json_agg/);
    expect(params).toEqual([[1, 2]]);
  });

  it("returns an empty duration map when no tracks have timing", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });
    await expect(repo().listPlaylistDurationsByPlaylistIds([1])).resolves.toEqual({});
  });

  it("aggregates known track durations in one query", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ playlist_id: 1, total_duration_seconds: "3720" }] });
    await expect(repo().listPlaylistDurationsByPlaylistIds([1, 2])).resolves.toEqual({ 1: 3720 });
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/SUM\(t\.duration_seconds\)/);
    expect(params).toEqual([[1, 2]]);
  });

  it("does not query duration aggregation for no playlists", async () => {
    await expect(repo().listPlaylistDurationsByPlaylistIds([])).resolves.toEqual({});
    expect(dbQuery).not.toHaveBeenCalled();
  });
  it("listPlaylistTracksByPlaylistIds short-circuits on empty input", async () => {
    await expect(repo().listPlaylistTracksByPlaylistIds([])).resolves.toEqual([]);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("listPlaylistTracksByPlaylistIds queries with ANY($1)", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ playlist_id: 1, track_id: "t1", friend_id: 1, position: 0 }] });
    const rows = await repo().listPlaylistTracksByPlaylistIds([1, 2]);
    expect(rows).toHaveLength(1);
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/= ANY\(\$1\)/);
    expect(params).toEqual([[1, 2]]);
  });

  it("findPlaylistById returns null when not found", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });
    await expect(repo().findPlaylistById(5)).resolves.toBeNull();
  });

  it("deletePlaylistById returns the deleted row or null", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: 5, name: "gone" }] });
    await expect(repo().deletePlaylistById(5)).resolves.toEqual({ id: 5, name: "gone" });
    const [sql] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM playlists WHERE id = \$1 RETURNING/);
  });
});

// ─── insertPlaylistTracks ─────────────────────────────────────────────────────

describe("PlaylistRepository.insertPlaylistTracks", () => {
  it("does nothing for an empty track list", async () => {
    const client = fakeClient();
    await repo().insertPlaylistTracks(client, 1, []);
    expect(client.query).not.toHaveBeenCalled();
  });

  it("builds parameterized value tuples and flat params", async () => {
    const client = fakeClient();
    await repo().insertPlaylistTracks(client, 7, [
      { track_id: "t1", friend_id: 1, position: 0 },
      { track_id: "t2", friend_id: 2, position: 1 },
    ]);
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toMatch(/\(\$1, \$2, \$3, \$4\),\(\$1, \$5, \$6, \$7\)/);
    expect(sql).not.toMatch(/ON CONFLICT/);
    expect(params).toEqual([7, "t1", 1, 0, "t2", 2, 1]);
  });

  it("adds ON CONFLICT DO NOTHING when requested", async () => {
    const client = fakeClient();
    await repo().insertPlaylistTracks(client, 7, [{ track_id: "t1", friend_id: 1, position: 0 }], true);
    const [sql] = client.query.mock.calls[0];
    expect(sql).toMatch(/ON CONFLICT DO NOTHING/);
  });
});

// ─── upsertTracksWithMetadata ─────────────────────────────────────────────────

function ptrack(overrides: Record<string, unknown> = {}): PlaylistTrackInput {
  return { track_id: "t1", friend_id: 1, ...overrides } as PlaylistTrackInput;
}

describe("PlaylistRepository.upsertTracksWithMetadata", () => {
  it("does nothing for an empty list", async () => {
    const client = fakeClient();
    await repo().upsertTracksWithMetadata([], client);
    expect(client.query).not.toHaveBeenCalled();
  });

  it("skips tracks missing track_id or friend_id", async () => {
    const client = fakeClient();
    await repo().upsertTracksWithMetadata(
      [ptrack({ track_id: "" }), ptrack({ friend_id: 0 })],
      client
    );
    expect(client.query).not.toHaveBeenCalled();
  });

  it("updates with COALESCE and does not insert when a row is matched", async () => {
    const client = fakeClient(1); // UPDATE affected a row
    await repo().upsertTracksWithMetadata([ptrack({ title: "Song" })], client);
    expect(client.query).toHaveBeenCalledTimes(1);
    const [sql] = client.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE tracks/);
    expect(sql).toMatch(/title = COALESCE\(\$1, title\)/);
  });

  it("inserts when the update matches nothing, using provided username", async () => {
    const client = fakeClient(0); // UPDATE matched nothing
    await repo().upsertTracksWithMetadata([ptrack({ username: "alice", title: "Song" })], client);
    expect(client.query).toHaveBeenCalledTimes(2);
    const [insertSql, insertParams] = client.query.mock.calls[1];
    expect(insertSql).toMatch(/INSERT INTO tracks/);
    expect(insertSql).toMatch(/ON CONFLICT \(track_id\) DO NOTHING/);
    expect(insertParams[0]).toBe("t1"); // track_id
    expect(insertParams[1]).toBe(1); // friend_id
  });

  it("resolves username via friend lookup when not supplied", async () => {
    const client = fakeClient(0);
    dbQuery.mockResolvedValueOnce({ rows: [{ username: "resolved" }] }); // findFriendUsernameById
    await repo().upsertTracksWithMetadata([ptrack({ title: "Song" })], client);
    expect(dbQuery).toHaveBeenCalledWith(
      expect.stringMatching(/SELECT username FROM friends/),
      [1]
    );
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it("throws when no username can be resolved for an insert", async () => {
    const client = fakeClient(0);
    dbQuery.mockResolvedValueOnce({ rows: [] }); // no username found
    await expect(
      repo().upsertTracksWithMetadata([ptrack({ title: "Song" })], client)
    ).rejects.toThrow(/username is required/i);
  });

  it("falls back to track_id/'Unknown Artist' for blank title/artist on insert", async () => {
    const client = fakeClient(0);
    await repo().upsertTracksWithMetadata(
      [ptrack({ username: "alice", title: "   ", artist: "" })],
      client
    );
    const insertParams = client.query.mock.calls[1][1];
    // insert column order: track_id, friend_id, then columns[] starting with title, artist
    expect(insertParams[2]).toBe("t1"); // title falls back to track_id
    expect(insertParams[3]).toBe("Unknown Artist");
  });

  it("coerces numeric strings and nulls out invalid numbers on update", async () => {
    const client = fakeClient(1);
    await repo().upsertTracksWithMetadata(
      [ptrack({ bpm: "128", duration_seconds: "abc", star_rating: "4" })],
      client
    );
    const updateParams = client.query.mock.calls[0][1];
    // columns order: ... bpm is index 13, duration_seconds 16, star_rating 19 (0-based)
    const columns = [
      "title", "artist", "album", "year", "styles", "genres", "duration",
      "discogs_url", "apple_music_url", "youtube_url", "soundcloud_url",
      "album_thumbnail", "local_tags", "bpm", "key", "danceability",
      "duration_seconds", "notes", "local_audio_url", "star_rating",
    ];
    expect(updateParams[columns.indexOf("bpm")]).toBe(128);
    expect(updateParams[columns.indexOf("duration_seconds")]).toBeNull();
    expect(updateParams[columns.indexOf("star_rating")]).toBe(4);
  });
});

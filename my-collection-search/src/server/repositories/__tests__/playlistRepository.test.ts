import { coverUrlSql } from "../coverUrlSql";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaylistTrackInput } from "@/api-contract/schemas";

const dbQuery = vi.hoisted(() => vi.fn());
const dbPool = vi.hoisted(() => ({ connect: vi.fn() }));

const withDbTransaction = vi.hoisted(() => vi.fn());

vi.mock("@/lib/serverDb", () => ({ dbQuery, dbPool, withDbTransaction }));

import { PlaylistRepository, playlistVisibleSql } from "../playlistRepository";

const VIEWER = "00000000-0000-4000-8000-000000000002";
const VISIBLE = /p\.visibility = 'household' OR p\.owner_id = \$\d/;

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
      rows: [
        {
          playlist_id: 1,
          id: 7,
          title: "Late night",
          status: "performed",
          cover_image_url: null,
          last_performed_at: "2026-09-01T00:00:00.000Z",
          venue_name: "The Room",
          location_city: "Seattle",
          collaborators: [{ friend_id: 2, username: "alex", role: "DJ" }],
          flyer_url: "/flyer.jpg",
          recording_url: "https://example.com/rec.mp3",
          post_url: null,
          youtube_url: null,
        },
      ],
    });
    await expect(repo().listLiveSetSummariesByPlaylistIds([1, 2])).resolves.toEqual({
      1: {
        id: 7,
        title: "Late night",
        status: "performed",
        cover_image_url: null,
        last_performed_at: "2026-09-01T00:00:00.000Z",
        venue_name: "The Room",
        location_city: "Seattle",
        collaborators: [{ friend_id: 2, username: "alex", role: "DJ" }],
        flyer_url: "/flyer.jpg",
        recording_url: "https://example.com/rec.mp3",
        post_url: null,
        youtube_url: null,
      },
    });
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/live_sets/);
    expect(sql).toMatch(/json_agg/);
    expect(sql).toMatch(/live_set_media/);
    expect(params).toEqual([[1, 2]]);
  });

  it("short-circuits cover urls for no playlists", async () => {
    await expect(repo().listCoverUrlsByPlaylistIds([])).resolves.toEqual({});
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("fetches the first four covers for all playlists in one query", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [{ playlist_id: 1, cover_urls: ["/a.jpg", "/b.jpg"] }],
    });
    await expect(repo().listCoverUrlsByPlaylistIds([1, 2])).resolves.toEqual({
      1: ["/a.jpg", "/b.jpg"],
    });
    expect(dbQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/rn <= 4/);
    expect(sql).toContain(`${coverUrlSql("t")} AS cover_url`);
    expect(sql).toContain(`COALESCE(${coverUrlSql("t")}, '') <> ''`);
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
    dbQuery.mockResolvedValueOnce({
      rows: [{ playlist_id: 1, track_id: "t1", friend_id: 1, position: 0 }],
    });
    const rows = await repo().listPlaylistTracksByPlaylistIds([1, 2]);
    expect(rows).toHaveLength(1);
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/= ANY\(\$1\)/);
    expect(params).toEqual([[1, 2]]);
  });

  it("findPlaylistById returns null when not found", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });
    await expect(repo().findPlaylistById(5, VIEWER)).resolves.toBeNull();
  });

  it("deletePlaylistById checks visibility, then deletes the tracks and the playlist in one transaction", async () => {
    const client = { query: vi.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 5, name: "gone" }] });
    withDbTransaction.mockImplementation((fn: (c: typeof client) => unknown) => fn(client));

    await expect(repo().deletePlaylistById(5, VIEWER)).resolves.toEqual({ id: 5, name: "gone" });
    expect(client.query.mock.calls[0][0]).toMatch(VISIBLE);
    expect(client.query.mock.calls[0][1]).toEqual([5, VIEWER]);
    expect(client.query.mock.calls[1]).toEqual([
      "DELETE FROM playlist_tracks WHERE playlist_id = $1",
      [5],
    ]);
    expect(client.query.mock.calls[2][0]).toMatch(/DELETE FROM playlists WHERE id = \$1 RETURNING/);
    expect(client.query.mock.calls[2][1]).toEqual([5]);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("deletePlaylistById deletes nothing when the playlist is missing or not visible", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    withDbTransaction.mockImplementation((fn: (c: typeof client) => unknown) => fn(client));
    await expect(repo().deletePlaylistById(404, VIEWER)).resolves.toBeNull();
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("lists only the playlists the viewer may see, with owner names", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: 1, owner_name: "Sam" }] });
    await expect(repo().listPlaylists(VIEWER)).resolves.toEqual([{ id: 1, owner_name: "Sam" }]);
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(VISIBLE);
    expect(sql).toMatch(/LEFT JOIN users u ON u\.id = p\.owner_id/);
    expect(params).toEqual([VIEWER]);
  });

  it("scopes single-playlist reads to the viewer", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: 2, name: "Mix" }] });
    await expect(repo().findPlaylistById(2, VIEWER)).resolves.toEqual({ id: 2, name: "Mix" });
    expect(dbQuery.mock.calls[0][0]).toMatch(VISIBLE);
    expect(dbQuery.mock.calls[0][1]).toEqual([2, VIEWER]);

    const header = {
      id: 2,
      name: "Mix",
      owner_id: VIEWER,
      owner_name: "Me",
      visibility: "private",
    };
    dbQuery.mockResolvedValueOnce({ rows: [header] });
    await expect(repo().findPlaylistHeaderById(2, VIEWER)).resolves.toEqual(header);
    dbQuery.mockResolvedValueOnce({ rows: [] });
    await expect(repo().findPlaylistHeaderById(3, VIEWER)).resolves.toBeNull();
    expect(dbQuery.mock.calls[2]).toEqual([expect.stringMatching(VISIBLE), [3, VIEWER]]);

    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await expect(repo().findPlaylistHeaderByIdWithClient(client, 3, VIEWER)).resolves.toBeNull();
    expect(client.query).toHaveBeenCalledWith(expect.stringMatching(VISIBLE), [3, VIEWER]);
  });

  it("creates a playlist for its owner, household by default", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ id: 9, owner_name: "Me" }] }) };
    await expect(repo().createPlaylistWithClient(client, "New", VIEWER)).resolves.toEqual({
      id: 9,
      owner_name: "Me",
    });
    expect(client.query.mock.calls[0][0]).toMatch(
      /INSERT INTO playlists \(name, owner_id, visibility\)/,
    );
    expect(client.query.mock.calls[0][1]).toEqual(["New", VIEWER, "household"]);
    await repo().createPlaylistWithClient(client, "Mine", VIEWER, "private");
    expect(client.query.mock.calls[1][1]).toEqual(["Mine", VIEWER, "private"]);
  });

  it("updates visibility", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await repo().updatePlaylistVisibility(client, 4, "private");
    expect(client.query).toHaveBeenCalledWith(
      "UPDATE playlists SET visibility = $1 WHERE id = $2",
      ["private", 4],
    );
  });

  it("builds the visibility predicate", () => {
    expect(playlistVisibleSql("x", "$7")).toBe("(x.visibility = 'household' OR x.owner_id = $7)");
  });

  it("lists playlist entries with the snapshots needed for spins", async () => {
    const entry = { track_id: "t1", friend_id: 2, playlist_position: 0, release_id: "r1" };
    dbQuery.mockResolvedValueOnce({ rows: [entry] });
    await expect(repo().listSpinEntries(7)).resolves.toEqual([entry]);
    expect(dbQuery).toHaveBeenCalledWith(
      expect.stringMatching(/LEFT JOIN tracks[\s\S]*ORDER BY pt\.position/),
      [7],
    );
  });

  it("finds the latest or a specified playlist performance", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: 4, performed_at: "2026-10-01" }] });
    await expect(repo().findPerformance(7)).resolves.toMatchObject({ id: 4 });
    expect(dbQuery.mock.calls[0][1]).toEqual([7]);
    expect(dbQuery.mock.calls[0][0]).not.toContain("p.id = $2");

    dbQuery.mockResolvedValueOnce({ rows: [] });
    await expect(repo().findPerformance(7, 9)).resolves.toBeNull();
    expect(dbQuery.mock.calls[1][0]).toContain("p.id = $2");
    expect(dbQuery.mock.calls[1][1]).toEqual([7, 9]);
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
    await repo().insertPlaylistTracks(
      client,
      7,
      [{ track_id: "t1", friend_id: 1, position: 0 }],
      true,
    );
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
      client,
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
      [1],
    );
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it("throws when no username can be resolved for an insert", async () => {
    const client = fakeClient(0);
    dbQuery.mockResolvedValueOnce({ rows: [] }); // no username found
    await expect(
      repo().upsertTracksWithMetadata([ptrack({ title: "Song" })], client),
    ).rejects.toThrow(/username is required/i);
  });

  it("falls back to track_id/'Unknown Artist' for blank title/artist on insert", async () => {
    const client = fakeClient(0);
    await repo().upsertTracksWithMetadata(
      [ptrack({ username: "alice", title: "   ", artist: "" })],
      client,
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
      client,
    );
    const updateParams = client.query.mock.calls[0][1];
    // columns order: ... bpm is index 13, duration_seconds 16 (0-based)
    const columns = [
      "title",
      "artist",
      "album",
      "year",
      "styles",
      "genres",
      "duration",
      "discogs_url",
      "apple_music_url",
      "youtube_url",
      "soundcloud_url",
      "album_thumbnail",
      "local_tags",
      "bpm",
      "key",
      "danceability",
      "duration_seconds",
      "notes",
      "local_audio_url",
    ];
    expect(updateParams[columns.indexOf("bpm")]).toBe(128);
    expect(updateParams[columns.indexOf("duration_seconds")]).toBeNull();
  });

  it("never writes a playlist's star_rating: ratings are per profile (#1283)", async () => {
    const client = fakeClient(0);
    await repo().upsertTracksWithMetadata([ptrack({ star_rating: 4, username: "alice" })], client);
    for (const [sql, params] of client.query.mock.calls) {
      expect(sql).not.toContain("star_rating");
      expect(params).not.toContain(4);
    }
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AlbumRepository } from "../albumRepository";
import type { Album, Track } from "@/types/track";

const dbQuery = vi.hoisted(() => vi.fn());

vi.mock("@/lib/serverDb", () => ({ dbQuery }));

beforeEach(() => {
  vi.resetAllMocks();
});

function makeRepo() {
  return new AlbumRepository();
}

function makeAlbum(overrides: Partial<Album> = {}): Album {
  return {
    release_id: "r1",
    friend_id: 1,
    title: "Test Album",
    artist: "Test Artist",
    track_count: 2,
    ...overrides,
  } as Album;
}

function makeClient() {
  return { query: vi.fn() };
}

// ─── getFriendUsernamesByIds ──────────────────────────────────────────────────

describe("getFriendUsernamesByIds()", () => {
  it("returns an empty map without querying for an empty input", async () => {
    const result = await makeRepo().getFriendUsernamesByIds([]);

    expect(result).toEqual(new Map());
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("returns a map of id → username for found rows", async () => {
    dbQuery.mockResolvedValue({
      rows: [
        { id: 1, username: "alice" },
        { id: 2, username: "bob" },
      ],
    });

    const result = await makeRepo().getFriendUsernamesByIds([1, 2]);

    expect(result.get(1)).toBe("alice");
    expect(result.get(2)).toBe("bob");
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("friends"), [[1, 2]]);
  });
});

// ─── getFirstAudioCoverByAlbumRefs ────────────────────────────────────────────

describe("getFirstAudioCoverByAlbumRefs()", () => {
  it("returns an empty map without querying for empty refs", async () => {
    const result = await makeRepo().getFirstAudioCoverByAlbumRefs([]);

    expect(result).toEqual(new Map());
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("keys results as release_id:friend_id", async () => {
    dbQuery.mockResolvedValue({
      rows: [{ release_id: "r1", friend_id: 7, audio_file_album_art_url: "https://img/art.jpg" }],
    });

    const result = await makeRepo().getFirstAudioCoverByAlbumRefs([
      { release_id: "r1", friend_id: 7 },
    ]);

    expect(result.get("r1:7")).toBe("https://img/art.jpg");
  });

  it("builds parameterised values for multiple refs", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().getFirstAudioCoverByAlbumRefs([
      { release_id: "r1", friend_id: 1 },
      { release_id: "r2", friend_id: 2 },
    ]);

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("$1");
    expect(sql).toContain("$3");
    expect(params).toEqual(["r1", 1, "r2", 2]);
  });
});

// ─── getAlbumByReleaseAndFriend ───────────────────────────────────────────────

describe("getAlbumByReleaseAndFriend()", () => {
  it("returns the album when found", async () => {
    const album = makeAlbum();
    dbQuery.mockResolvedValue({ rows: [album] });

    const result = await makeRepo().getAlbumByReleaseAndFriend("r1", 1);

    expect(result).toEqual(album);
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("albums"), ["r1", 1]);
  });

  it("returns null when not found", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    const result = await makeRepo().getAlbumByReleaseAndFriend("missing", 1);

    expect(result).toBeNull();
  });
});

// ─── getTracksByReleaseAndFriend ──────────────────────────────────────────────

describe("getTracksByReleaseAndFriend()", () => {
  it("returns tracks for the given release and friend", async () => {
    const rows = [{ track_id: "t1" }, { track_id: "t2" }] as Track[];
    dbQuery.mockResolvedValue({ rows });

    const result = await makeRepo().getTracksByReleaseAndFriend("r1", 1);

    expect(result).toEqual(rows);
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("tracks"), ["r1", 1]);
  });

  it("includes hasVectors, so album detail doesn't shadow a track's real embedding state (#468)", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().getTracksByReleaseAndFriend("r1", 1);

    const [sql] = dbQuery.mock.calls[0];
    expect(sql).toContain('AS "hasVectors"');
  });
});

// ─── getFriendUsernameById ────────────────────────────────────────────────────

describe("getFriendUsernameById()", () => {
  it("returns username when found", async () => {
    dbQuery.mockResolvedValue({ rows: [{ username: "alice" }] });

    const result = await makeRepo().getFriendUsernameById(1);

    expect(result).toBe("alice");
  });

  it("returns null when not found", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    const result = await makeRepo().getFriendUsernameById(99);

    expect(result).toBeNull();
  });
});

// ─── ensureFriendIdByUsername ─────────────────────────────────────────────────

describe("ensureFriendIdByUsername()", () => {
  it("returns existing id without inserting when friend already exists", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] });

    const result = await makeRepo().ensureFriendIdByUsername("alice");

    expect(result).toBe(5);
    expect(dbQuery).toHaveBeenCalledTimes(1);
  });

  it("inserts and returns new id when friend does not exist", async () => {
    dbQuery
      .mockResolvedValueOnce({ rows: [] }) // SELECT - not found
      .mockResolvedValueOnce({ rows: [{ id: 9 }] }); // INSERT RETURNING

    const result = await makeRepo().ensureFriendIdByUsername("newuser");

    expect(result).toBe(9);
    expect(dbQuery).toHaveBeenCalledTimes(2);
  });
});

// ─── upsertAlbumRecord ────────────────────────────────────────────────────────

describe("upsertAlbumRecord()", () => {
  it("uses COALESCE logic when preserveManualFields is false (default)", async () => {
    const client = makeClient();
    const saved = makeAlbum();
    client.query.mockResolvedValue({ rows: [saved] });

    const album = {
      release_id: "r1", friend_id: 1, title: "T", artist: "A", track_count: 0,
      genres: [], styles: [],
    };

    const result = await makeRepo().upsertAlbumRecord(client as any, album as any);

    expect(result).toEqual(saved);
    const sql: string = client.query.mock.calls[0][0];
    expect(sql).toContain("COALESCE(EXCLUDED.album_notes");
    expect(sql).not.toContain("albums.album_notes,\n");
  });

  it("uses direct-copy logic when preserveManualFields is true", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [makeAlbum()] });

    const album = {
      release_id: "r1", friend_id: 1, title: "T", artist: "A", track_count: 0,
      genres: [], styles: [],
    };

    await makeRepo().upsertAlbumRecord(client as any, album as any, { preserveManualFields: true });

    const sql: string = client.query.mock.calls[0][0];
    expect(sql).toContain("albums.album_notes");
    expect(sql).not.toContain("COALESCE(EXCLUDED.album_notes");
  });

  it("passes all 21 values in the correct order", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [makeAlbum()] });

    const album = {
      release_id: "r1",
      friend_id: 2,
      title: "Title",
      artist: "Artist",
      year: "2000",
      genres: ["Electronic"],
      styles: ["House"],
      album_thumbnail: "https://img/thumb.jpg",
      discogs_url: "https://discogs.com/r/1",
      date_added: "2024-01-01",
      date_changed: "2024-01-02",
      track_count: 4,
      label: "Warp",
      catalog_number: "WARP001",
      country: "UK",
      format: "Vinyl",
      album_notes: "notes",
      album_rating: 5,
      purchase_price: 12.5,
      condition: "VG+",
      library_identifier: "LP001",
    };

    await makeRepo().upsertAlbumRecord(client as any, album as any);

    const params = client.query.mock.calls[0][1];
    expect(params).toHaveLength(21);
    expect(params[0]).toBe("r1");
    expect(params[1]).toBe(2);
    expect(params[11]).toBe(4);
  });
});

// ─── updateAlbumFields ────────────────────────────────────────────────────────

describe("updateAlbumFields()", () => {
  it("returns null when no optional fields are provided", async () => {
    const client = makeClient();

    const result = await makeRepo().updateAlbumFields(client as any, {
      release_id: "r1",
      friend_id: 1,
    });

    expect(result).toBeNull();
    expect(client.query).not.toHaveBeenCalled();
  });

  it("builds a SET clause for each provided field", async () => {
    const client = makeClient();
    const saved = makeAlbum({ album_rating: 4 });
    client.query.mockResolvedValue({ rows: [saved] });

    const result = await makeRepo().updateAlbumFields(client as any, {
      release_id: "r1",
      friend_id: 1,
      album_rating: 4,
      album_notes: "great record",
    });

    expect(result).toEqual(saved);
    const sql: string = client.query.mock.calls[0][0];
    expect(sql).toContain("album_rating");
    expect(sql).toContain("album_notes");
    const params = client.query.mock.calls[0][1];
    expect(params).toContain(4);
    expect(params).toContain("great record");
  });

  it("returns null when db returns no rows", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [] });

    const result = await makeRepo().updateAlbumFields(client as any, {
      release_id: "r1",
      friend_id: 1,
      album_rating: 3,
    });

    expect(result).toBeNull();
  });

  it("includes updated_at = current_timestamp in the SET clause", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [] });

    await makeRepo().updateAlbumFields(client as any, {
      release_id: "r1",
      friend_id: 1,
      condition: "VG",
    });

    const sql: string = client.query.mock.calls[0][0];
    expect(sql).toContain("updated_at = current_timestamp");
  });
});

// ─── getAlbumThumbnail ────────────────────────────────────────────────────────

describe("getAlbumThumbnail()", () => {
  it("returns the thumbnail url when found", async () => {
    dbQuery.mockResolvedValue({ rows: [{ album_thumbnail: "https://img/thumb.jpg" }] });

    const result = await makeRepo().getAlbumThumbnail("r1", 1);

    expect(result).toBe("https://img/thumb.jpg");
  });

  it("returns null when no album is found", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    const result = await makeRepo().getAlbumThumbnail("missing", 1);

    expect(result).toBeNull();
  });
});

// ─── listTrackIdsForAlbum ─────────────────────────────────────────────────────

describe("listTrackIdsForAlbum()", () => {
  it("returns track ids for the given album", async () => {
    dbQuery.mockResolvedValue({ rows: [{ track_id: "t1" }, { track_id: "t2" }] });

    const result = await makeRepo().listTrackIdsForAlbum("r1", 1);

    expect(result).toEqual(["t1", "t2"]);
  });
});

// ─── deleteTracksByIds ────────────────────────────────────────────────────────

describe("deleteTracksByIds()", () => {
  it("does not query when given an empty id list", async () => {
    const client = makeClient();

    await makeRepo().deleteTracksByIds(client as any, [], 1);

    expect(client.query).not.toHaveBeenCalled();
  });

  it("issues a DELETE when given track ids", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [] });

    await makeRepo().deleteTracksByIds(client as any, ["t1", "t2"], 1);

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE"),
      [["t1", "t2"], 1]
    );
  });
});

// ─── deleteAlbumsByFriendAndReleaseIds ────────────────────────────────────────

describe("deleteAlbumsByFriendAndReleaseIds()", () => {
  it("returns 0 without querying when given an empty release list", async () => {
    const result = await makeRepo().deleteAlbumsByFriendAndReleaseIds(1, []);

    expect(result).toBe(0);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("returns the rowCount when albums are deleted", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: 3 });

    const result = await makeRepo().deleteAlbumsByFriendAndReleaseIds(1, ["r1", "r2", "r3"]);

    expect(result).toBe(3);
    expect(dbQuery).toHaveBeenCalledWith(
      expect.stringContaining("DELETE"),
      [1, ["r1", "r2", "r3"]]
    );
  });

  it("returns 0 when rowCount is null", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: null });

    const result = await makeRepo().deleteAlbumsByFriendAndReleaseIds(1, ["r1"]);

    expect(result).toBe(0);
  });
});

// ─── deleteAlbumByReleaseAndFriend ────────────────────────────────────────────

describe("deleteAlbumByReleaseAndFriend()", () => {
  it("issues DELETE with the correct parameters", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [] });

    await makeRepo().deleteAlbumByReleaseAndFriend(client as any, "r1", 5);

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM albums"),
      ["r1", 5]
    );
  });
});

// ─── updateAlbumCoverForRelease ───────────────────────────────────────────────

describe("updateAlbumCoverForRelease()", () => {
  it("returns the rowCount of updated tracks", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: 5 });

    const result = await makeRepo().updateAlbumCoverForRelease(1, "r1", "https://img/art.jpg");

    expect(result).toBe(5);
    expect(dbQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE tracks"),
      ["https://img/art.jpg", 1, "r1"]
    );
  });

  it("returns 0 when rowCount is falsy", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const result = await makeRepo().updateAlbumCoverForRelease(1, "r1", "url");

    expect(result).toBe(0);
  });
});

// ─── insertTrack ──────────────────────────────────────────────────────────────

describe("insertTrack()", () => {
  it("returns the inserted track", async () => {
    const client = makeClient();
    const track = { track_id: "t1" } as Track;
    client.query.mockResolvedValue({ rows: [track] });

    const result = await makeRepo().insertTrack(client as any, ["t1", 1, "alice"]);

    expect(result).toEqual(track);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO tracks"),
      ["t1", 1, "alice"]
    );
  });
});

// ─── upsertTrackByTrackIdUsername ──────────────────────────────────────────────

describe("upsertTrackByTrackIdUsername()", () => {
  it("returns the upserted track", async () => {
    const client = makeClient();
    const track = { track_id: "t1" } as Track;
    client.query.mockResolvedValue({ rows: [track] });

    const result = await makeRepo().upsertTrackByTrackIdUsername(client as any, ["t1", 1]);

    expect(result).toEqual(track);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT"),
      ["t1", 1]
    );
  });
});

// ─── listAlbumsWithTrackCountZero ─────────────────────────────────────────────

describe("listAlbumsWithTrackCountZero()", () => {
  it("returns albums with track_count = 0", async () => {
    const rows = [{ release_id: "r1", friend_id: 1, title: "T", artist: "A", track_count: 0 }];
    dbQuery.mockResolvedValue({ rows });

    const result = await makeRepo().listAlbumsWithTrackCountZero();

    expect(result).toEqual(rows);
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("track_count = 0"));
  });
});

// ─── listOrphanedAlbums ───────────────────────────────────────────────────────

describe("listOrphanedAlbums()", () => {
  it("returns orphaned albums (no matching tracks)", async () => {
    const rows = [{ release_id: "r1", friend_id: 1, title: "T", artist: "A" }];
    dbQuery.mockResolvedValue({ rows });

    const result = await makeRepo().listOrphanedAlbums();

    expect(result).toEqual(rows);
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("LEFT JOIN tracks"));
  });
});

// ─── Album artwork (#494) ─────────────────────────────────────────────────────

describe("upsertAlbumRecord() Discogs art", () => {
  it("records a remote thumbnail as the Discogs art and keeps it when an upload replaces it", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [makeAlbum()] });

    await makeRepo().upsertAlbumRecord(client as never, makeAlbum() as never);

    const [sql] = client.query.mock.calls[0];
    expect(sql).toContain("CASE WHEN $8::text ~ '^https?://' THEN $8::text END");
    expect(sql).toContain("discogs_art_url = COALESCE(EXCLUDED.discogs_art_url, albums.discogs_art_url)");
  });
});

describe("getAlbumArtwork()", () => {
  it("returns the artwork columns, or null", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ release_id: "r1" }] });
    expect(await makeRepo().getAlbumArtwork("r1", 7)).toEqual({ release_id: "r1" });
    expect(dbQuery.mock.calls[0][0]).toContain("album_art_source");
    expect(dbQuery.mock.calls[0][1]).toEqual(["r1", 7]);

    dbQuery.mockResolvedValueOnce({ rows: [] });
    expect(await makeRepo().getAlbumArtwork("r1", 7)).toBeNull();
  });
});

describe("setAlbumDisplayArt()", () => {
  it("updates the album and its tracks in one statement", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().setAlbumDisplayArt("r1", 7, "/uploads/album-covers/a.jpg", "apple_music");

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("UPDATE albums");
    expect(sql).toContain("UPDATE tracks");
    expect(params).toEqual(["/uploads/album-covers/a.jpg", "apple_music", "r1", 7]);
  });
});

describe("setAppleMusicArtUrl()", () => {
  it("stores the extracted cover", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    await makeRepo().setAppleMusicArtUrl("r1", 7, "/uploads/album-covers/a.jpg");
    expect(dbQuery.mock.calls[0][1]).toEqual(["/uploads/album-covers/a.jpg", "r1", 7]);
  });
});

describe("recordArtMatch()", () => {
  it("stores the verdict and distance", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    await makeRepo().recordArtMatch("r1", 7, "mismatch", 23);
    expect(dbQuery.mock.calls[0][0]).toContain("art_matched_at = current_timestamp");
    expect(dbQuery.mock.calls[0][1]).toEqual(["mismatch", 23, "r1", 7]);
  });
});

describe("listArtworkReview()", () => {
  it("lists flagged albums nobody has chosen art for, optionally for one friend", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().listArtworkReview(null, 50);
    let [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("art_match_status IN ('mismatch', 'no_reference')");
    expect(sql).toContain("album_art_source IS NULL");
    expect(sql).not.toContain("friend_id = $2");
    expect(params).toEqual([50]);

    await makeRepo().listArtworkReview(7, 10);
    [sql, params] = dbQuery.mock.calls[1];
    expect(sql).toContain("AND friend_id = $2");
    expect(params).toEqual([10, 7]);
  });
});

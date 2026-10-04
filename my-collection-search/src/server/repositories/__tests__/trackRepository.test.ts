import { describe, it, expect, vi, beforeEach } from "vitest";
import { TrackRepository } from "../trackRepository";
import type { Track } from "@/types/track";

const dbQuery = vi.hoisted(() => vi.fn());

vi.mock("@/lib/serverDb", () => ({ dbQuery }));

beforeEach(() => {
  vi.resetAllMocks();
});

function makeRepo() {
  return new TrackRepository();
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    track_id: "t1",
    friend_id: 1,
    username: "alice",
    title: "Test Track",
    artist: "Test Artist",
    album: "Test Album",
    year: "2000",
    styles: [],
    genres: [],
    duration: "5:00",
    duration_seconds: 300,
    position: "A1",
    discogs_url: null,
    apple_music_url: null,
    youtube_url: null,
    soundcloud_url: null,
    album_thumbnail: null,
    local_tags: "",
    bpm: null,
    key: null,
    notes: "",
    star_rating: 0,
    ...overrides,
  } as Track;
}

// ─── upsertDiscogsTrackByTrackIdUsername ──────────────────────────────────────

describe("upsertDiscogsTrackByTrackIdUsername()", () => {
  it("returns the upserted track on success", async () => {
    const track = makeTrack();
    dbQuery.mockResolvedValue({ rows: [track] });

    const result = await makeRepo().upsertDiscogsTrackByTrackIdUsername(
      track as any,
      1
    );

    expect(result).toEqual(track);
    expect(dbQuery).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT"),
      expect.any(Array)
    );
  });

  it("returns null when the track is soft-deleted (upsert WHERE clause prevents update)", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    const result = await makeRepo().upsertDiscogsTrackByTrackIdUsername(
      makeTrack() as any,
      1
    );

    expect(result).toBeNull();
  });
});

// ─── softDeleteTrack ──────────────────────────────────────────────────────────

describe("softDeleteTrack()", () => {
  it("returns the updated track when it was active", async () => {
    const track = makeTrack();
    dbQuery.mockResolvedValue({ rows: [track] });

    const result = await makeRepo().softDeleteTrack("t1", 1);

    expect(result).toEqual(track);
    expect(dbQuery).toHaveBeenCalledWith(
      expect.stringContaining("deleted_at = NOW()"),
      ["t1", 1]
    );
  });

  it("returns null when the track does not exist or is already deleted", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    const result = await makeRepo().softDeleteTrack("missing", 1);

    expect(result).toBeNull();
  });
});

// ─── findTrackWithLocalAudio ──────────────────────────────────────────────────

describe("findTrackWithLocalAudio()", () => {
  it("returns the row when found", async () => {
    const row = { track_id: "t1", friend_id: 1, local_audio_url: "/audio/t1.m4a" };
    dbQuery.mockResolvedValue({ rows: [row] });

    const result = await makeRepo().findTrackWithLocalAudio("t1", 1);

    expect(result).toEqual(row);
  });

  it("returns null when not found", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    const result = await makeRepo().findTrackWithLocalAudio("missing", 1);

    expect(result).toBeNull();
  });
});

// ─── findTracksMissingDurationWithLocalM4a ─────────────────────────────────────

describe("findTracksMissingDurationWithLocalM4a()", () => {
  it("returns rows matching the filter criteria", async () => {
    const rows = [{ track_id: "t1", friend_id: 1, local_audio_url: "/a/t1.m4a" }];
    dbQuery.mockResolvedValue({ rows });

    const result = await makeRepo().findTracksMissingDurationWithLocalM4a();

    expect(result).toEqual(rows);
    const [sql] = dbQuery.mock.calls[0];
    expect(sql).toContain("duration_seconds IS NULL");
    expect(sql).toContain(".m4a");
  });
});

// ─── findTracksForEssentiaBackfill ────────────────────────────────────────────

describe("findTracksForEssentiaBackfill()", () => {
  it("passes no params when both friendId and limit are omitted", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().findTracksForEssentiaBackfill(null);

    const [, params] = dbQuery.mock.calls[0];
    expect(params).toEqual([]);
  });

  it("passes [friendId] when only friendId is provided", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().findTracksForEssentiaBackfill(5);

    const [sql, params] = dbQuery.mock.calls[0];
    expect(params).toEqual([5]);
    expect(sql).toContain("friend_id = $1");
  });

  it("passes [limit] when only limit is provided (no friendId)", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().findTracksForEssentiaBackfill(null, 50);

    const [sql, params] = dbQuery.mock.calls[0];
    expect(params).toEqual([50]);
    expect(sql).toContain("LIMIT $1");
  });

  it("passes [friendId, limit] when both are provided", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().findTracksForEssentiaBackfill(3, 25);

    const [, params] = dbQuery.mock.calls[0];
    expect(params).toEqual([3, 25]);
  });
});

// ─── findCoverArtBackfillCandidates ───────────────────────────────────────────

describe("findCoverArtBackfillCandidates()", () => {
  it("passes no params when friendId is null", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().findCoverArtBackfillCandidates(null);

    const [, params] = dbQuery.mock.calls[0];
    expect(params).toEqual([]);
  });

  it("passes [friendId] when a friendId is provided", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().findCoverArtBackfillCandidates(7);

    const [, params] = dbQuery.mock.calls[0];
    expect(params).toEqual([7]);
  });
});

// ─── getPlaylistCountsForTracks ───────────────────────────────────────────────

describe("getPlaylistCountsForTracks()", () => {
  it("returns empty object without querying for an empty input", async () => {
    const result = await makeRepo().getPlaylistCountsForTracks([]);

    expect(result).toEqual({});
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("returns a keyed count map from the query results", async () => {
    dbQuery.mockResolvedValue({
      rows: [
        { track_id: "t1", friend_id: 1, count: "3" },
        { track_id: "t2", friend_id: 1, count: "0" },
      ],
    });

    const result = await makeRepo().getPlaylistCountsForTracks([
      { track_id: "t1", friend_id: 1 },
      { track_id: "t2", friend_id: 1 },
    ]);

    expect(result["t1:1"]).toBe(3);
    expect(result["t2:1"]).toBe(0);
  });

  it("fills in 0 for any refs missing from the query result", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    const result = await makeRepo().getPlaylistCountsForTracks([
      { track_id: "t1", friend_id: 1 },
    ]);

    expect(result["t1:1"]).toBe(0);
  });

  it("coerces count from string to number", async () => {
    dbQuery.mockResolvedValue({
      rows: [{ track_id: "t1", friend_id: 1, count: "5" }],
    });

    const result = await makeRepo().getPlaylistCountsForTracks([
      { track_id: "t1", friend_id: 1 },
    ]);

    expect(typeof result["t1:1"]).toBe("number");
    expect(result["t1:1"]).toBe(5);
  });
});

// ─── listTrackIdsByFriendAndReleaseIds ────────────────────────────────────────

describe("listTrackIdsByFriendAndReleaseIds()", () => {
  it("returns empty array without querying for empty release ids", async () => {
    const result = await makeRepo().listTrackIdsByFriendAndReleaseIds(1, []);

    expect(result).toEqual([]);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("returns track ids from the query", async () => {
    dbQuery.mockResolvedValue({ rows: [{ track_id: "t1" }, { track_id: "t2" }] });

    const result = await makeRepo().listTrackIdsByFriendAndReleaseIds(1, ["r1"]);

    expect(result).toEqual(["t1", "t2"]);
  });
});

// ─── deleteTracksByFriendAndReleaseIds ────────────────────────────────────────

describe("deleteTracksByFriendAndReleaseIds()", () => {
  it("returns 0 without querying for empty release ids", async () => {
    const result = await makeRepo().deleteTracksByFriendAndReleaseIds(1, []);

    expect(result).toBe(0);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("returns the rowCount of deleted tracks", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: 4 });

    const result = await makeRepo().deleteTracksByFriendAndReleaseIds(1, ["r1", "r2"]);

    expect(result).toBe(4);
  });

  it("returns 0 when rowCount is null", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: null });

    const result = await makeRepo().deleteTracksByFriendAndReleaseIds(1, ["r1"]);

    expect(result).toBe(0);
  });
});

// ─── findTracksByRefsPreservingOrder ──────────────────────────────────────────

describe("findTracksByRefsPreservingOrder()", () => {
  it("returns empty array without querying for an empty input", async () => {
    const result = await makeRepo().findTracksByRefsPreservingOrder([]);

    expect(result).toEqual([]);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("returns tracks in the order specified by the refs", async () => {
    const rows = [{ track_id: "t1", friend_id: 1, ord: 0 }];
    dbQuery.mockResolvedValue({ rows });

    const result = await makeRepo().findTracksByRefsPreservingOrder([
      { track_id: "t1", friend_id: 1 },
    ]);

    expect(result).toEqual(rows);
    const [sql] = dbQuery.mock.calls[0];
    expect(sql).toContain("ORDER BY v.ord");
  });
});

// ─── findTrackByTrackIdAndFriendId ────────────────────────────────────────────

describe("findTrackByTrackIdAndFriendId()", () => {
  it("returns the track when found", async () => {
    const track = makeTrack();
    dbQuery.mockResolvedValue({ rows: [track] });

    const result = await makeRepo().findTrackByTrackIdAndFriendId("t1", 1);

    expect(result).toEqual(track);
  });

  it("returns null when not found", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    const result = await makeRepo().findTrackByTrackIdAndFriendId("missing", 1);

    expect(result).toBeNull();
  });
});

// ─── findTrackByTrackIdAndFriendIdWithLibraryFallback ─────────────────────────

describe("findTrackByTrackIdAndFriendIdWithLibraryFallback()", () => {
  it("returns the track with COALESCE library_identifier", async () => {
    const track = makeTrack({ library_identifier: "LP001" } as any);
    dbQuery.mockResolvedValue({ rows: [track] });

    const result = await makeRepo().findTrackByTrackIdAndFriendIdWithLibraryFallback("t1", 1);

    expect(result).toEqual(track);
    const [sql] = dbQuery.mock.calls[0];
    expect(sql).toContain("COALESCE");
  });

  it("returns null when not found", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    const result = await makeRepo().findTrackByTrackIdAndFriendIdWithLibraryFallback("x", 1);

    expect(result).toBeNull();
  });
});

// ─── listPlaylistsForTrack ────────────────────────────────────────────────────

describe("listPlaylistsForTrack()", () => {
  it("returns playlist membership rows for a track", async () => {
    const rows = [{ id: 1, name: "Playlist A", position: 0 }];
    dbQuery.mockResolvedValue({ rows });

    const result = await makeRepo().listPlaylistsForTrack("t1", 1);

    expect(result).toEqual(rows);
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("playlist_tracks"), ["t1", 1]);
  });
});

// ─── updateTrackFields ────────────────────────────────────────────────────────

describe("updateTrackFields()", () => {
  it("returns null when track_id is missing", async () => {
    const result = await makeRepo().updateTrackFields({
      track_id: "",
      friend_id: 1,
      title: "New",
    });

    expect(result).toBeNull();
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("returns null when friend_id is missing", async () => {
    const result = await makeRepo().updateTrackFields({
      track_id: "t1",
      friend_id: 0,
      title: "New",
    });

    expect(result).toBeNull();
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("falls through to findTrackByTrackIdAndFriendId when no valid fields are present", async () => {
    const track = makeTrack();
    dbQuery.mockResolvedValue({ rows: [track] });

    const result = await makeRepo().updateTrackFields({ track_id: "t1", friend_id: 1 });

    expect(result).toEqual(track);
    const [sql] = dbQuery.mock.calls[0];
    expect(sql).toContain("SELECT");
  });

  it("builds an UPDATE statement with valid updatable fields", async () => {
    // UPDATE call then SELECT call (findTrackByTrackIdAndFriendId)
    const updated = makeTrack({ notes: "updated" });
    dbQuery
      .mockResolvedValueOnce({ rows: [] }) // UPDATE
      .mockResolvedValueOnce({ rows: [updated] }); // SELECT

    const result = await makeRepo().updateTrackFields({
      track_id: "t1",
      friend_id: 1,
      notes: "updated",
      star_rating: 4,
    });

    expect(result).toEqual(updated);
    const [sql] = dbQuery.mock.calls[0];
    expect(sql).toContain("UPDATE tracks");
    expect(sql).toContain("notes");
    expect(sql).toContain("star_rating");
  });

  it("casts bpm and duration_seconds to integer in the SET clause", async () => {
    dbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [makeTrack()] });

    await makeRepo().updateTrackFields({
      track_id: "t1",
      friend_id: 1,
      bpm: "128",
      duration_seconds: 300,
    });

    const [sql] = dbQuery.mock.calls[0];
    expect(sql).toContain("bpm = $1::integer");
    expect(sql).toContain("duration_seconds = $2::integer");
  });
});

// ─── updateTrackAnalysisByTrackId ─────────────────────────────────────────────

describe("updateTrackAnalysisByTrackId()", () => {
  it("does nothing when no fields are provided", async () => {
    await makeRepo().updateTrackAnalysisByTrackId("t1", {});

    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("sets local_audio_url when provided as a string", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().updateTrackAnalysisByTrackId("t1", {
      local_audio_url: "/audio/t1.m4a",
    });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("local_audio_url");
    expect(params).toContain("/audio/t1.m4a");
  });

  it("sets bpm = null when bpm is explicitly null", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().updateTrackAnalysisByTrackId("t1", { bpm: null });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("bpm");
    expect(params).toContain(null);
  });

  it("sets key = null when key is explicitly null", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().updateTrackAnalysisByTrackId("t1", { key: null });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("key");
    expect(params).toContain(null);
  });

  it("sets danceability = null when danceability is explicitly null", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().updateTrackAnalysisByTrackId("t1", { danceability: null });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("danceability");
    expect(params).toContain(null);
  });

  it("sets multiple fields in one query", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().updateTrackAnalysisByTrackId("t1", {
      bpm: 130,
      key: "Gm",
      danceability: 0.85,
      duration_seconds: 360,
    });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("bpm");
    expect(sql).toContain("key");
    expect(sql).toContain("danceability");
    expect(sql).toContain("duration_seconds");
    expect(params).toContain(130);
    expect(params).toContain("Gm");
    expect(params).toContain(0.85);
    expect(params).toContain(360);
    expect(params[params.length - 1]).toBe("t1");
  });
});

// ─── findTrackByTrackIdAndFriendIdRaw ─────────────────────────────────────────

describe("findTrackByTrackIdAndFriendIdRaw()", () => {
  it("returns the track when found", async () => {
    const track = makeTrack();
    dbQuery.mockResolvedValue({ rows: [track] });

    const result = await makeRepo().findTrackByTrackIdAndFriendIdRaw("t1", 1);

    expect(result).toEqual(track);
  });

  it("returns null when not found", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    const result = await makeRepo().findTrackByTrackIdAndFriendIdRaw("x", 1);

    expect(result).toBeNull();
  });
});

// ─── findTrackWithAlbumMetadata ───────────────────────────────────────────────

describe("findTrackWithAlbumMetadata()", () => {
  it("returns the track with album metadata fields when found", async () => {
    const row = { ...makeTrack(), album_country: "DE", album_label: "Warp" };
    dbQuery.mockResolvedValue({ rows: [row] });

    const result = await makeRepo().findTrackWithAlbumMetadata("t1", 1);

    expect(result).toEqual(row);
    const [sql] = dbQuery.mock.calls[0];
    expect(sql).toContain("album_country");
    expect(sql).toContain("album_label");
  });

  it("returns null when not found", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    const result = await makeRepo().findTrackWithAlbumMetadata("x", 1);

    expect(result).toBeNull();
  });
});

// ─── findTrackAudioMetadata ───────────────────────────────────────────────────

describe("findTrackAudioMetadata()", () => {
  it("returns audio metadata row when found", async () => {
    const row = { track_id: "t1", friend_id: 1, local_audio_url: "/a.m4a",
      audio_file_album_art_url: null, year: "2000", composer: null, release_id: "r1" };
    dbQuery.mockResolvedValue({ rows: [row] });

    const result = await makeRepo().findTrackAudioMetadata("t1", 1);

    expect(result).toEqual(row);
  });

  it("returns null when not found", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    const result = await makeRepo().findTrackAudioMetadata("x", 1);

    expect(result).toBeNull();
  });
});

// ─── findTracksByTrackId ──────────────────────────────────────────────────────

describe("findTracksByTrackId()", () => {
  it("returns all tracks matching the track_id across users", async () => {
    const tracks = [makeTrack({ username: "alice" }), makeTrack({ username: "bob" })];
    dbQuery.mockResolvedValue({ rows: tracks });

    const result = await makeRepo().findTracksByTrackId("t1");

    expect(result).toEqual(tracks);
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("track_id = $1"), ["t1"]);
  });
});

// ─── updateTrackLocalAudioUrl ─────────────────────────────────────────────────

describe("updateTrackLocalAudioUrl()", () => {
  it("updates local_audio_url for the given track and friend", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().updateTrackLocalAudioUrl("t1", 1, "/new/path.m4a");

    expect(dbQuery).toHaveBeenCalledWith(
      expect.stringContaining("local_audio_url"),
      ["/new/path.m4a", "t1", 1]
    );
  });
});

// ─── listTracksForReindex ─────────────────────────────────────────────────────

describe("listTracksForReindex()", () => {
  it("returns all tracks joined with albums and friends", async () => {
    const rows = [{ track_id: "t1", username: "alice" }];
    dbQuery.mockResolvedValue({ rows });

    const result = await makeRepo().listTracksForReindex();

    expect(result).toEqual(rows);
    const [sql] = dbQuery.mock.calls[0];
    expect(sql).toContain("LEFT JOIN albums");
    expect(sql).toContain("LEFT JOIN friends");
  });
});

// ─── updateTrackNotesAndTagsByTrackId ─────────────────────────────────────────

describe("updateTrackNotesAndTagsByTrackId()", () => {
  it("updates local_tags and notes for the track", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().updateTrackNotesAndTagsByTrackId("t1", "techno", "Great track");

    expect(dbQuery).toHaveBeenCalledWith(
      expect.stringContaining("local_tags"),
      ["techno", "Great track", "t1"]
    );
  });
});

// ─── updateTrackAudioFileAlbumArtUrl ──────────────────────────────────────────

describe("updateTrackAudioFileAlbumArtUrl()", () => {
  it("updates audio_file_album_art_url for the given track", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().updateTrackAudioFileAlbumArtUrl("t1", 1, "https://img/art.jpg");

    expect(dbQuery).toHaveBeenCalledWith(
      expect.stringContaining("audio_file_album_art_url"),
      ["https://img/art.jpg", "t1", 1]
    );
  });
});

// ─── updateTrackYear ──────────────────────────────────────────────────────────

describe("updateTrackYear()", () => {
  it("updates year for the given track and friend", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().updateTrackYear("t1", 1, "2001");

    expect(dbQuery).toHaveBeenCalledWith(
      expect.stringContaining("year = $1"),
      ["2001", "t1", 1]
    );
  });
});

// ─── updateTrackComposer ──────────────────────────────────────────────────────

describe("updateTrackComposer()", () => {
  it("updates composer for the given track and friend", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().updateTrackComposer("t1", 1, "Bach");

    expect(dbQuery).toHaveBeenCalledWith(
      expect.stringContaining("composer = $1"),
      ["Bach", "t1", 1]
    );
  });
});

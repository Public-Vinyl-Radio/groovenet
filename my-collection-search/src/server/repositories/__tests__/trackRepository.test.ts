import { describe, it, expect, vi, beforeEach } from "vitest";
import { TrackRepository } from "../trackRepository";
import type { Track } from "@/types/track";

const inspectLocalAudio = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/trackAudioMetadataService", () => ({
  trackAudioMetadataService: { inspectLocalAudio },
  EMPTY_EMBEDDED_TAGS: { composer: null, genres: [], lyrics: null },
}));
const dbQuery = vi.hoisted(() => vi.fn());

vi.mock("@/lib/serverDb", () => ({ dbQuery }));

beforeEach(() => {
  vi.resetAllMocks();
  inspectLocalAudio.mockResolvedValue({ fields: {}, tags: null });
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

    const result = await makeRepo().upsertDiscogsTrackByTrackIdUsername(track as any, 1);

    expect(result).toEqual(track);
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("ON CONFLICT"), expect.any(Array));
  });

  it("writes the album's date_added, keeping a stored one when the import has none (#847)", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().upsertDiscogsTrackByTrackIdUsername(
      { ...makeTrack(), date_added: "2024-03-01T10:20:30-08:00" } as any,
      1,
    );
    await makeRepo().upsertDiscogsTrackByTrackIdUsername(makeTrack() as any, 1);

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("date_added       = COALESCE(EXCLUDED.date_added, tracks.date_added)");
    expect(params).toHaveLength(21);
    expect(params[20]).toBe("2024-03-01T10:20:30-08:00");
    expect(dbQuery.mock.calls[1][1][20]).toBeNull();
  });

  it("returns null when the track is soft-deleted (upsert WHERE clause prevents update)", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    const result = await makeRepo().upsertDiscogsTrackByTrackIdUsername(makeTrack() as any, 1);

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
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("deleted_at = NOW()"), ["t1", 1]);
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

// ─── findTracksWithKeyForRecompute ────────────────────────────────────────────

describe("findTracksWithKeyForRecompute() (#524)", () => {
  it("selects every track with a stored key, regardless of key_confidence", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().findTracksWithKeyForRecompute(null);

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("key IS NOT NULL");
    expect(sql).not.toContain("key_confidence IS NULL");
    expect(sql).toContain("key_confidence");
    expect(params).toEqual([]);
  });

  it("passes [friendId] when only friendId is provided", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().findTracksWithKeyForRecompute(5);

    const [sql, params] = dbQuery.mock.calls[0];
    expect(params).toEqual([5]);
    expect(sql).toContain("friend_id = $1");
  });

  it("passes [limit] when only limit is provided (no friendId)", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().findTracksWithKeyForRecompute(null, 50);

    const [sql, params] = dbQuery.mock.calls[0];
    expect(params).toEqual([50]);
    expect(sql).toContain("LIMIT $1");
  });

  it("passes [friendId, limit] when both are provided", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().findTracksWithKeyForRecompute(3, 25);

    const [, params] = dbQuery.mock.calls[0];
    expect(params).toEqual([3, 25]);
  });
});

// ─── findTracksWithBpmForConfidence ───────────────────────────────────────────

describe("findTracksWithBpmForConfidence() (#531)", () => {
  it("selects only tracks with a BPM and no confidence yet", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().findTracksWithBpmForConfidence(null);

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("bpm IS NOT NULL");
    expect(sql).toContain("bpm_confidence IS NULL");
    expect(params).toEqual([]);
  });

  it("passes [friendId] when only friendId is provided", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().findTracksWithBpmForConfidence(5);

    const [sql, params] = dbQuery.mock.calls[0];
    expect(params).toEqual([5]);
    expect(sql).toContain("friend_id = $1");
  });

  it("passes [limit] when only limit is provided", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().findTracksWithBpmForConfidence(null, 50);

    const [sql, params] = dbQuery.mock.calls[0];
    expect(params).toEqual([50]);
    expect(sql).toContain("LIMIT $1");
  });

  it("passes [friendId, limit] when both are provided", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().findTracksWithBpmForConfidence(3, 25);

    const [sql, params] = dbQuery.mock.calls[0];
    expect(params).toEqual([3, 25]);
    expect(sql).toContain("LIMIT $2");
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

  it("only picks albums whose art nobody has chosen or matched (#494)", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().findCoverArtBackfillCandidates(null);

    const [sql] = dbQuery.mock.calls[0];
    expect(sql).toContain("a.album_art_source IS NULL");
    expect(sql).toContain("a.art_match_status IS NULL");
    expect(sql).toContain("t.deleted_at IS NULL");
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

  it("only counts memberships whose playlist still exists", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().getPlaylistCountsForTracks([{ track_id: "t1", friend_id: 1 }]);

    expect(dbQuery.mock.calls[0][0]).toMatch(
      /EXISTS \(SELECT 1 FROM playlists p WHERE p\.id = pt\.playlist_id\)/,
    );
  });

  it("fills in 0 for any refs missing from the query result", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    const result = await makeRepo().getPlaylistCountsForTracks([{ track_id: "t1", friend_id: 1 }]);

    expect(result["t1:1"]).toBe(0);
  });

  it("coerces count from string to number", async () => {
    dbQuery.mockResolvedValue({
      rows: [{ track_id: "t1", friend_id: 1, count: "5" }],
    });

    const result = await makeRepo().getPlaylistCountsForTracks([{ track_id: "t1", friend_id: 1 }]);

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
  it("returns the track with its album label when found", async () => {
    const track = { ...makeTrack(), album_label: "Rham!" };
    dbQuery.mockResolvedValue({ rows: [track] });

    const result = await makeRepo().findTrackByTrackIdAndFriendId("t1", 1);

    expect(result).toEqual(track);
    expect(result?.album_label).toBe("Rham!");
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("a.label AS album_label"), [
      "t1",
      1,
    ]);
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

  it("strips null bytes from string values but leaves other types alone", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [makeTrack()] });

    await makeRepo().updateTrackFields({
      track_id: "t1",
      friend_id: 1,
      notes: "bad\u0000 note",
      star_rating: 4,
    });

    const [, values] = dbQuery.mock.calls[0];
    expect(values).toEqual(["bad note", 4, "t1", 1]);
  });

  it("includes key_confidence as an updatable field", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [makeTrack()] });

    await makeRepo().updateTrackFields({
      track_id: "t1",
      friend_id: 1,
      key: "F major",
      key_confidence: 0.42,
    });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("key_confidence");
    expect(params).toContain(0.42);
  });

  it("casts bpm and duration_seconds to integer in the SET clause", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [makeTrack()] });

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

  it("sets key_confidence when provided as a number", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().updateTrackAnalysisByTrackId("t1", { key_confidence: 0.618 });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("key_confidence");
    expect(params).toContain(0.618);
  });

  it("sets key_confidence = null when explicitly null", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().updateTrackAnalysisByTrackId("t1", { key_confidence: null });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("key_confidence");
    expect(params).toContain(null);
  });

  it("sets bpm_confidence when provided as a number (#531)", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().updateTrackAnalysisByTrackId("t1", { bpm_confidence: 0.258 });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("bpm_confidence");
    expect(params).toContain(0.258);
  });

  it("sets bpm_confidence = null when explicitly null (#531)", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().updateTrackAnalysisByTrackId("t1", { bpm_confidence: null });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("bpm_confidence");
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
      key_confidence: 0.42,
      danceability: 0.85,
      duration_seconds: 360,
    });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("bpm");
    expect(sql).toContain("key");
    expect(sql).toContain("key_confidence");
    expect(sql).toContain("danceability");
    expect(sql).toContain("duration_seconds");
    expect(params).toContain(130);
    expect(params).toContain("Gm");
    expect(params).toContain(0.42);
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
    const row = {
      track_id: "t1",
      friend_id: 1,
      local_audio_url: "/a.m4a",
      audio_file_album_art_url: null,
      year: "2000",
      composer: null,
      release_id: "r1",
    };
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

    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("local_audio_url"), [
      "/new/path.m4a",
      "t1",
      1,
    ]);
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

    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("local_tags"), [
      "techno",
      "Great track",
      "t1",
    ]);
  });
});

// ─── updateTrackAudioFileAlbumArtUrl ──────────────────────────────────────────

describe("updateTrackAudioFileAlbumArtUrl()", () => {
  it("updates audio_file_album_art_url for the given track", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().updateTrackAudioFileAlbumArtUrl("t1", 1, "https://img/art.jpg");

    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("audio_file_album_art_url"), [
      "https://img/art.jpg",
      "t1",
      1,
    ]);
  });
});

// ─── updateTrackYear ──────────────────────────────────────────────────────────

describe("updateTrackYear()", () => {
  it("updates year for the given track and friend", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().updateTrackYear("t1", 1, "2001");

    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("year = $1"), ["2001", "t1", 1]);
  });
});

// ─── updateTrackComposer ──────────────────────────────────────────────────────

describe("updateTrackComposer()", () => {
  it("updates composer for the given track and friend", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().updateTrackComposer("t1", 1, "Bach");

    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("composer = $1"), [
      "Bach",
      "t1",
      1,
    ]);
  });
});

describe("persisting local audio metadata", () => {
  it("writes probe fields and source atomically with the new filename", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    inspectLocalAudio.mockResolvedValue({
      fields: {
        audio_codec: "alac",
        audio_source: "apple_music",
        audio_sample_rate: 96000,
      },
      tags: null,
    });
    await makeRepo().updateTrackFields({
      track_id: "t1",
      friend_id: 1,
      local_audio_url: "new.m4a",
      audio_source: "apple_music",
      audio_codec: "wrong",
    });
    expect(inspectLocalAudio).toHaveBeenCalledWith("new.m4a", "apple_music");
    expect(dbQuery.mock.calls[0][0]).toContain("audio_sample_rate =");
    expect(dbQuery.mock.calls[0][1]).toEqual(["new.m4a", "apple_music", "alac", 96000, "t1", 1]);
  });
  it.each([null, ""])("clears stored metadata with a removed URL (%s)", async (url) => {
    dbQuery.mockResolvedValue({ rows: [] });
    inspectLocalAudio.mockResolvedValue({
      fields: {
        audio_source: null,
        audio_codec: null,
        audio_probed_at: null,
      },
      tags: null,
    });
    await makeRepo().updateTrackFields({
      track_id: "t1",
      friend_id: 1,
      local_audio_url: url,
      audio_source: "youtube",
    });
    expect(dbQuery.mock.calls[0][1]).toEqual([url, null, null, null, "t1", 1]);
  });
  it("writes upload metadata for every friend sharing the track", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    inspectLocalAudio.mockResolvedValue({
      fields: { audio_source: "upload", audio_codec: "aac" },
      tags: null,
    });
    await makeRepo().updateTrackAnalysisByTrackId("t1", {
      local_audio_url: "upload.m4a",
      audio_source: "upload",
    });
    expect(inspectLocalAudio).toHaveBeenCalledWith("upload.m4a", "upload");
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("audio_codec = $2"), [
      "upload",
      "aac",
      "upload.m4a",
      "t1",
    ]);
  });
  it("does not update the row when probing fails", async () => {
    inspectLocalAudio.mockRejectedValue(new Error("bad audio"));
    await expect(
      makeRepo().updateTrackFields({ track_id: "t1", friend_id: 1, local_audio_url: "broken" }),
    ).rejects.toThrow("bad audio");
    expect(dbQuery).not.toHaveBeenCalled();
  });
});

describe("listAudioBackfillCandidates()", () => {
  beforeEach(() => dbQuery.mockReset());

  it("lists live tracks with a file, optionally for one friend", async () => {
    dbQuery.mockResolvedValue({ rows: [{ track_id: "t1" }] });
    const repo = makeRepo();

    expect(await repo.listAudioBackfillCandidates(3)).toEqual([{ track_id: "t1" }]);
    expect(dbQuery).toHaveBeenLastCalledWith(expect.stringContaining("deleted_at IS NULL"), [3]);

    await repo.listAudioBackfillCandidates();
    expect(dbQuery).toHaveBeenLastCalledWith(expect.any(String), [null]);
  });
});

describe("TrackRepository.getStorageStats", () => {
  it("aggregates counts and sizes as numbers", async () => {
    dbQuery
      .mockResolvedValueOnce({ rows: [{ count: "9" }] })
      .mockResolvedValueOnce({ rows: [{ source: "upload", files: "2", size: "300" }] })
      .mockResolvedValueOnce({
        rows: [{ codec: "flac", lossless: true, files: "2", size: "300" }],
      });
    expect(await makeRepo().getStorageStats()).toEqual({
      tracks: 9,
      by_source: [{ source: "upload", files: 2, size_bytes: 300 }],
      by_codec: [{ codec: "flac", lossless: true, files: 2, size_bytes: 300 }],
    });
    expect(dbQuery.mock.calls[1][0]).toContain("deleted_at IS NULL");
  });

  it("defaults to zero tracks", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    expect((await makeRepo().getStorageStats()).tracks).toBe(0);
  });
});

describe("embedded tags (#673)", () => {
  const tags = { composer: "A, B", genres: ["House"], lyrics: "la la" };

  it("saveEmbeddedTags fills composer only while empty, refreshes genre, upserts embedded lyrics", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    await makeRepo().saveEmbeddedTags("t1", 2, tags);
    const [update, upsert] = dbQuery.mock.calls;
    // A user's or Discogs's composer is never replaced: the CASE keeps any non-empty value.
    expect(update[0]).toContain("WHEN COALESCE(composer, '') = ''");
    expect(update[0]).toContain("audio_file_genre = $4::text[]");
    expect(update[0]).not.toContain("local_tags");
    expect(update[1]).toEqual(["t1", 2, "A, B", ["House"]]);
    // A lyrics row a user wrote (source 'user') is never overwritten.
    expect(upsert[0]).toContain("WHERE track_lyrics.source = 'embedded'");
    expect(upsert[1]).toEqual(["t1", 2, "la la"]);
  });

  it("saveEmbeddedTags clears file-derived genre and lyrics when the tags are empty or the file is gone", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    await makeRepo().saveEmbeddedTags("t1", null, null);
    const [update, del] = dbQuery.mock.calls;
    expect(update[1]).toEqual(["t1", null, null, null]);
    expect(del[0]).toContain("DELETE FROM track_lyrics");
    expect(del[0]).toContain("source = 'embedded'");
    expect(del[1]).toEqual(["t1", null]);
  });

  it("saveEmbeddedTags strips null bytes and drops empty genres", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    await makeRepo().saveEmbeddedTags("t1", 1, {
      composer: "A\u0000B",
      genres: ["\u0000", "Dub\u0000"],
      lyrics: "l\u0000y",
    });
    expect(dbQuery.mock.calls[0][1]).toEqual(["t1", 1, "AB", ["Dub"]]);
    expect(dbQuery.mock.calls[1][1]).toEqual(["t1", 1, "ly"]);
  });

  it("stores tags after the track update when a file is attached", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    inspectLocalAudio.mockResolvedValue({ fields: { audio_codec: "aac" }, tags });
    await makeRepo().updateTrackFields({ track_id: "t1", friend_id: 1, local_audio_url: "a.m4a" });
    const sql = dbQuery.mock.calls.map((c) => c[0] as string);
    expect(sql[0]).toContain("UPDATE tracks");
    expect(sql.some((q) => q.includes("embedded_tags_read_at"))).toBe(true);
    expect(sql.some((q) => q.includes("INSERT INTO track_lyrics"))).toBe(true);
  });

  it("stores tags for every friend on the upload path", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    inspectLocalAudio.mockResolvedValue({ fields: { audio_codec: "aac" }, tags });
    await makeRepo().updateTrackAnalysisByTrackId("t1", { local_audio_url: "u.m4a" });
    expect(dbQuery.mock.calls[1][1]).toEqual(["t1", null, "A, B", ["House"]]);
  });

  it("does not touch tags when the local file is not being changed", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    await makeRepo().updateTrackFields({ track_id: "t1", friend_id: 1, notes: "n" });
    expect(inspectLocalAudio).not.toHaveBeenCalled();
    expect(dbQuery.mock.calls.every((c) => !String(c[0]).includes("embedded_tags_read_at"))).toBe(
      true,
    );
  });

  it("never fails the write over a tag-storage error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    inspectLocalAudio.mockResolvedValue({ fields: { audio_codec: "aac" }, tags });
    dbQuery
      .mockResolvedValueOnce({ rows: [] }) // the track UPDATE
      .mockRejectedValueOnce(new Error("lyrics table missing"))
      .mockResolvedValue({ rows: [] });
    await expect(
      makeRepo().updateTrackFields({ track_id: "t1", friend_id: 1, local_audio_url: "a.m4a" }),
    ).resolves.toBeDefined();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to store embedded tags"),
      expect.any(Error),
    );
    error.mockRestore();
  });

  it("lists candidates for one friend or all", async () => {
    dbQuery.mockResolvedValue({ rows: [{ track_id: "t1" }] });
    const repo = makeRepo();
    expect(await repo.listEmbeddedTagsCandidates(3)).toEqual([{ track_id: "t1" }]);
    expect(dbQuery).toHaveBeenLastCalledWith(expect.stringContaining("embedded_tags_read_at"), [3]);
    await repo.listEmbeddedTagsCandidates();
    expect(dbQuery).toHaveBeenLastCalledWith(expect.any(String), [null]);
  });
});

describe("ISRC (#1156)", () => {
  it("lists every live track for one friend or all", async () => {
    dbQuery.mockResolvedValue({ rows: [{ track_id: "t1" }] });
    const repo = makeRepo();
    expect(await repo.listIsrcCandidates(3)).toEqual([{ track_id: "t1" }]);
    expect(dbQuery).toHaveBeenLastCalledWith(expect.stringContaining("isrc_checked_at"), [3]);
    await repo.listIsrcCandidates();
    expect(dbQuery).toHaveBeenLastCalledWith(expect.any(String), [null]);
  });

  it("saves a batch in one statement, stamping null results as checked", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    await makeRepo().saveIsrcs([
      { track_id: "a", friend_id: 1, isrc: "USAB11800123" },
      { track_id: "b", friend_id: 2, isrc: null },
    ]);
    expect(dbQuery).toHaveBeenCalledTimes(1);
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("isrc_checked_at = now()"), [
      ["a", "b"],
      [1, 2],
      ["USAB11800123", null],
    ]);
  });

  it("does nothing for an empty batch", async () => {
    dbQuery.mockClear();
    await makeRepo().saveIsrcs([]);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("clears the ISRC and its check", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    await makeRepo().clearIsrc("a", 1);
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("isrc = NULL"), ["a", 1]);
  });

  it("updateTrackFields writes isrc as a column", async () => {
    dbQuery.mockResolvedValue({ rows: [{ track_id: "a", friend_id: 1 }] });
    await makeRepo().updateTrackFields({ track_id: "a", friend_id: 1, isrc: "USAB11800123" });
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("isrc = $1"), [
      "USAB11800123",
      "a",
      1,
    ]);
  });
});

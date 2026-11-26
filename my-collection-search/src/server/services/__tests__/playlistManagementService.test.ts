import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PlaylistForbiddenError,
  PlaylistManagementService,
  normalizePlaylistCreatedAt,
} from "../playlistManagementService";

// ─── mocks ────────────────────────────────────────────────────────────────────

// vi.hoisted ensures repo exists before vi.mock factories run
const repo = vi.hoisted(() => ({
  findPlaylistHeaderById: vi.fn(),
  findPlaylistHeaderByIdWithClient: vi.fn(),
  listTrackRefsForPlaylist: vi.fn(),
  listPlaylists: vi.fn(),
  listPlaylistTracksByPlaylistIds: vi.fn(),
  listPlaylistDurationsByPlaylistIds: vi.fn(),
  listLiveSetSummariesByPlaylistIds: vi.fn(),
  listCoverUrlsByPlaylistIds: vi.fn(),
  createPlaylistWithClient: vi.fn(),
  upsertTracksWithMetadata: vi.fn(),
  insertPlaylistTracks: vi.fn(),
  updatePlaylistName: vi.fn(),
  deletePlaylistTracks: vi.fn(),
  findFriendIdByUsername: vi.fn(),
  findAnyFriendIdForTrack: vi.fn(),
  getDefaultFriendId: vi.fn(),
  findPlaylistById: vi.fn(),
  updatePlaylistVisibility: vi.fn(),
}));

vi.mock("@/server/repositories/playlistRepository", () => ({
  playlistRepository: repo,
}));

// withDbTransaction just calls the callback with a dummy client
vi.mock("@/lib/serverDb", () => ({
  withDbTransaction: vi.fn((fn: (client: object) => unknown) => fn({})),
}));

// ─── helpers ──────────────────────────────────────────────────────────────────

const ME = "00000000-0000-4000-8000-000000000001";
const SAM = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.clearAllMocks();
  repo.listCoverUrlsByPlaylistIds.mockResolvedValue({});
});

function makeService() {
  return new PlaylistManagementService();
}

// ─── normalizePlaylistCreatedAt ───────────────────────────────────────────────

describe("normalizePlaylistCreatedAt()", () => {
  it("converts a Date object to an ISO string", () => {
    const date = new Date("2024-01-15T12:00:00.000Z");
    const result = normalizePlaylistCreatedAt({ created_at: date });
    expect(result.created_at).toBe("2024-01-15T12:00:00.000Z");
  });

  it("passes through an existing ISO string unchanged", () => {
    const result = normalizePlaylistCreatedAt({ created_at: "2024-01-15T12:00:00.000Z" });
    expect(result.created_at).toBe("2024-01-15T12:00:00.000Z");
  });

  it("converts a numeric timestamp to an ISO string", () => {
    const ts = new Date("2024-01-15T12:00:00.000Z").getTime();
    const result = normalizePlaylistCreatedAt({ created_at: ts });
    expect(result.created_at).toBe("2024-01-15T12:00:00.000Z");
  });

  it("merges extra fields onto the result", () => {
    const result = normalizePlaylistCreatedAt({
      created_at: "2024-01-01T00:00:00.000Z",
      name: "Mix",
    });
    expect(result.name).toBe("Mix");
  });
});

// ─── getPlaylistTrackDetails ──────────────────────────────────────────────────

describe("getPlaylistTrackDetails()", () => {
  it("returns notFound:true when the playlist does not exist", async () => {
    repo.findPlaylistHeaderById.mockResolvedValue(null);
    const result = await makeService().getPlaylistTrackDetails(99, ME);
    expect(result).toEqual({ notFound: true });
  });

  it("returns playlist detail with tracks when found", async () => {
    repo.findPlaylistHeaderById.mockResolvedValue({ id: 1, name: "Sunday Mix" });
    repo.listTrackRefsForPlaylist.mockResolvedValue([
      { track_id: "t1", friend_id: 1, position: 0 },
    ]);

    const result = await makeService().getPlaylistTrackDetails(1, ME);
    expect(result).toEqual({
      notFound: false,
      detail: {
        playlist_id: 1,
        playlist_name: "Sunday Mix",
        tracks: [{ track_id: "t1", friend_id: 1, position: 0 }],
      },
    });
  });

  it("returns an empty tracks array when the playlist has no tracks", async () => {
    repo.findPlaylistHeaderById.mockResolvedValue({ id: 2, name: "Empty" });
    repo.listTrackRefsForPlaylist.mockResolvedValue([]);

    const result = await makeService().getPlaylistTrackDetails(2, ME);
    expect(result).toMatchObject({ notFound: false, detail: { tracks: [] } });
  });
});

describe("getAllPlaylistsWithTracks(ME)", () => {
  it("enriches playlists with batched duration and optional set summaries", async () => {
    repo.listPlaylists.mockResolvedValue([
      { id: 1, name: "Set", created_at: "2026-01-01T00:00:00.000Z" },
    ]);
    repo.listPlaylistTracksByPlaylistIds.mockResolvedValue([
      { playlist_id: 1, track_id: "t1", friend_id: 1, position: 0 },
    ]);
    repo.listPlaylistDurationsByPlaylistIds.mockResolvedValue({ 1: 3600 });
    repo.listLiveSetSummariesByPlaylistIds.mockResolvedValue({
      1: { id: 7, status: "performed", collaborators: [] },
    });
    repo.listCoverUrlsByPlaylistIds.mockResolvedValue({ 1: ["/a.jpg"] });
    const result = await makeService().getAllPlaylistsWithTracks(ME);
    expect(result).toMatchObject([
      {
        id: 1,
        total_duration_seconds: 3600,
        cover_urls: ["/a.jpg"],
        set: { id: 7 },
        tracks: [{ track_id: "t1" }],
      },
    ]);
    expect(repo.listCoverUrlsByPlaylistIds).toHaveBeenCalledWith([1]);
    expect(repo.listPlaylistDurationsByPlaylistIds).toHaveBeenCalledWith([1]);
  });
});

// ─── getAllPlaylistsWithTracks ─────────────────────────────────────────────────

describe("getAllPlaylistsWithTracks(ME)", () => {
  it("returns an empty array when there are no playlists", async () => {
    repo.listPlaylists.mockResolvedValue([]);
    const result = await makeService().getAllPlaylistsWithTracks(ME);
    expect(result).toEqual([]);
    expect(repo.listPlaylistTracksByPlaylistIds).not.toHaveBeenCalled();
  });

  it("groups tracks by playlist and normalizes created_at", async () => {
    repo.listPlaylists.mockResolvedValue([
      { id: 1, name: "Mix A", created_at: new Date("2024-01-01T00:00:00.000Z") },
      { id: 2, name: "Mix B", created_at: new Date("2024-02-01T00:00:00.000Z") },
    ]);
    repo.listPlaylistTracksByPlaylistIds.mockResolvedValue([
      { playlist_id: 1, track_id: "t1", friend_id: 1, position: 0 },
      { playlist_id: 1, track_id: "t2", friend_id: 1, position: 1 },
      { playlist_id: 2, track_id: "t3", friend_id: 1, position: 0 },
    ]);

    const result = await makeService().getAllPlaylistsWithTracks(ME);

    expect(result).toHaveLength(2);
    expect(result[0].tracks).toHaveLength(2);
    expect(result[1].tracks).toHaveLength(1);
    expect(result[0].created_at).toBe("2024-01-01T00:00:00.000Z");
  });

  it("returns playlists with empty tracks array when none are linked", async () => {
    repo.listPlaylists.mockResolvedValue([
      { id: 1, name: "Empty Mix", created_at: "2024-01-01T00:00:00.000Z" },
    ]);
    repo.listPlaylistTracksByPlaylistIds.mockResolvedValue([]);

    const result = await makeService().getAllPlaylistsWithTracks(ME);
    expect(result[0].tracks).toEqual([]);
    expect(result[0].cover_urls).toEqual([]);
  });
});

// ─── createPlaylistWithTracks ─────────────────────────────────────────────────

describe("createPlaylistWithTracks()", () => {
  it("creates a playlist with no tracks", async () => {
    repo.createPlaylistWithClient.mockResolvedValue({
      id: 10,
      name: "Empty Playlist",
      created_at: "2024-01-01T00:00:00.000Z",
    });

    const result = await makeService().createPlaylistWithTracks({
      ownerId: ME,
      name: "Empty Playlist",
      tracks: [],
    });

    expect(result.id).toBe(10);
    expect(result.tracks).toEqual([]);
    expect(repo.upsertTracksWithMetadata).not.toHaveBeenCalled();
    expect(repo.insertPlaylistTracks).not.toHaveBeenCalled();
  });

  it("resolves friend_id via username and inserts tracks", async () => {
    repo.createPlaylistWithClient.mockResolvedValue({
      id: 11,
      name: "Mix",
      created_at: "2024-01-01T00:00:00.000Z",
    });
    repo.findFriendIdByUsername.mockResolvedValue(5);
    repo.upsertTracksWithMetadata.mockResolvedValue(undefined);
    repo.insertPlaylistTracks.mockResolvedValue(undefined);

    const result = await makeService().createPlaylistWithTracks({
      ownerId: ME,
      name: "Mix",
      tracks: [{ track_id: "t1", username: "alice" }],
    });

    expect(repo.findFriendIdByUsername).toHaveBeenCalledWith("alice");
    expect(repo.upsertTracksWithMetadata).toHaveBeenCalled();
    expect(repo.insertPlaylistTracks).toHaveBeenCalledWith(
      {},
      11,
      [{ track_id: "t1", friend_id: 5, position: 0 }],
      true,
    );
    expect(result.tracks[0]).toMatchObject({ track_id: "t1", friend_id: 5, position: 0 });
  });

  it("falls back to track owner when username lookup returns null", async () => {
    repo.createPlaylistWithClient.mockResolvedValue({
      id: 12,
      name: "Mix",
      created_at: "2024-01-01T00:00:00.000Z",
    });
    repo.findFriendIdByUsername.mockResolvedValue(null);
    repo.findAnyFriendIdForTrack.mockResolvedValue(7);
    repo.upsertTracksWithMetadata.mockResolvedValue(undefined);
    repo.insertPlaylistTracks.mockResolvedValue(undefined);

    const result = await makeService().createPlaylistWithTracks({
      ownerId: ME,
      name: "Mix",
      tracks: [{ track_id: "t2", username: "unknown" }],
    });

    expect(repo.findAnyFriendIdForTrack).toHaveBeenCalledWith("t2");
    expect(result.tracks[0].friend_id).toBe(7);
  });

  it("falls back to default friend when both lookups return null", async () => {
    repo.createPlaylistWithClient.mockResolvedValue({
      id: 13,
      name: "Mix",
      created_at: "2024-01-01T00:00:00.000Z",
    });
    repo.findFriendIdByUsername.mockResolvedValue(null);
    repo.findAnyFriendIdForTrack.mockResolvedValue(null);
    repo.getDefaultFriendId.mockResolvedValue(1);
    repo.upsertTracksWithMetadata.mockResolvedValue(undefined);
    repo.insertPlaylistTracks.mockResolvedValue(undefined);

    const result = await makeService().createPlaylistWithTracks({
      ownerId: ME,
      name: "Mix",
      tracks: [{ track_id: "t3" }],
    });

    expect(repo.getDefaultFriendId).toHaveBeenCalled();
    expect(result.tracks[0].friend_id).toBe(1);
  });

  it("assigns sequential positions to tracks", async () => {
    repo.createPlaylistWithClient.mockResolvedValue({
      id: 14,
      name: "Mix",
      created_at: "2024-01-01T00:00:00.000Z",
    });
    repo.findAnyFriendIdForTrack.mockResolvedValue(1);
    repo.upsertTracksWithMetadata.mockResolvedValue(undefined);
    repo.insertPlaylistTracks.mockResolvedValue(undefined);

    const result = await makeService().createPlaylistWithTracks({
      ownerId: ME,
      name: "Mix",
      tracks: [{ track_id: "t1" }, { track_id: "t2" }, { track_id: "t3" }],
    });

    expect(result.tracks.map((t) => t.position)).toEqual([0, 1, 2]);
  });
});

// ─── updatePlaylist ───────────────────────────────────────────────────────────

describe("updatePlaylist()", () => {
  it("returns notFound:true when the playlist does not exist", async () => {
    repo.findPlaylistHeaderByIdWithClient.mockResolvedValue(null);

    const result = await makeService().updatePlaylist({ id: 99 }, ME);
    expect(result).toEqual({ notFound: true });
  });

  it("updates the playlist name when provided", async () => {
    repo.findPlaylistHeaderByIdWithClient.mockResolvedValue({ id: 1, name: "Old" });
    repo.updatePlaylistName.mockResolvedValue(undefined);
    repo.findPlaylistById.mockResolvedValue({
      id: 1,
      name: "New Name",
      created_at: "2024-01-01T00:00:00.000Z",
    });
    repo.listTrackRefsForPlaylist.mockResolvedValue([]);

    const result = await makeService().updatePlaylist({ id: 1, name: "New Name" }, ME);

    expect(repo.updatePlaylistName).toHaveBeenCalledWith({}, 1, "New Name");
    expect(result).toMatchObject({ notFound: false, playlist: { name: "New Name" } });
  });

  it("does not call updatePlaylistName when name is not provided", async () => {
    repo.findPlaylistHeaderByIdWithClient.mockResolvedValue({ id: 1, name: "Mix" });
    repo.findPlaylistById.mockResolvedValue({
      id: 1,
      name: "Mix",
      created_at: "2024-01-01T00:00:00.000Z",
    });
    repo.listTrackRefsForPlaylist.mockResolvedValue([]);

    await makeService().updatePlaylist({ id: 1 }, ME);
    expect(repo.updatePlaylistName).not.toHaveBeenCalled();
  });

  it("replaces tracks when tracks array is provided", async () => {
    repo.findPlaylistHeaderByIdWithClient.mockResolvedValue({ id: 1, name: "Mix" });
    repo.deletePlaylistTracks.mockResolvedValue(undefined);
    repo.findAnyFriendIdForTrack.mockResolvedValue(3);
    repo.upsertTracksWithMetadata.mockResolvedValue(undefined);
    repo.insertPlaylistTracks.mockResolvedValue(undefined);
    repo.findPlaylistById.mockResolvedValue({
      id: 1,
      name: "Mix",
      created_at: "2024-01-01T00:00:00.000Z",
    });
    repo.listTrackRefsForPlaylist.mockResolvedValue([
      { track_id: "t1", friend_id: 3, position: 0 },
    ]);

    const result = await makeService().updatePlaylist(
      {
        id: 1,
        tracks: ["t1"],
      },
      ME,
    );

    expect(repo.deletePlaylistTracks).toHaveBeenCalledWith({}, 1);
    expect(repo.insertPlaylistTracks).toHaveBeenCalled();
    expect(result).toMatchObject({ notFound: false });
  });

  it("uses explicit friend_id from track object when present", async () => {
    repo.findPlaylistHeaderByIdWithClient.mockResolvedValue({ id: 1, name: "Mix" });
    repo.deletePlaylistTracks.mockResolvedValue(undefined);
    repo.upsertTracksWithMetadata.mockResolvedValue(undefined);
    repo.insertPlaylistTracks.mockResolvedValue(undefined);
    repo.findPlaylistById.mockResolvedValue({
      id: 1,
      name: "Mix",
      created_at: "2024-01-01T00:00:00.000Z",
    });
    repo.listTrackRefsForPlaylist.mockResolvedValue([]);

    await makeService().updatePlaylist(
      {
        id: 1,
        tracks: [{ track_id: "t1", friend_id: 42 }],
      },
      ME,
    );

    const insertCall = repo.insertPlaylistTracks.mock.calls[0];
    expect(insertCall[2][0].friend_id).toBe(42);
    expect(repo.findFriendIdByUsername).not.toHaveBeenCalled();
    expect(repo.findAnyFriendIdForTrack).not.toHaveBeenCalled();
  });

  it("uses default_friend_id when track has no friend_id or username", async () => {
    repo.findPlaylistHeaderByIdWithClient.mockResolvedValue({ id: 1, name: "Mix" });
    repo.deletePlaylistTracks.mockResolvedValue(undefined);
    repo.upsertTracksWithMetadata.mockResolvedValue(undefined);
    repo.insertPlaylistTracks.mockResolvedValue(undefined);
    repo.findPlaylistById.mockResolvedValue({
      id: 1,
      name: "Mix",
      created_at: "2024-01-01T00:00:00.000Z",
    });
    repo.listTrackRefsForPlaylist.mockResolvedValue([]);

    await makeService().updatePlaylist(
      {
        id: 1,
        default_friend_id: 9,
        tracks: [{ track_id: "t1" }],
      },
      ME,
    );

    const insertCall = repo.insertPlaylistTracks.mock.calls[0];
    expect(insertCall[2][0].friend_id).toBe(9);
    expect(repo.findFriendIdByUsername).not.toHaveBeenCalled();
    expect(repo.findAnyFriendIdForTrack).not.toHaveBeenCalled();
  });

  it("deletes existing tracks and inserts nothing when tracks is an empty array", async () => {
    repo.findPlaylistHeaderByIdWithClient.mockResolvedValue({ id: 1, name: "Mix" });
    repo.deletePlaylistTracks.mockResolvedValue(undefined);
    repo.findPlaylistById.mockResolvedValue({
      id: 1,
      name: "Mix",
      created_at: "2024-01-01T00:00:00.000Z",
    });
    repo.listTrackRefsForPlaylist.mockResolvedValue([]);

    await makeService().updatePlaylist({ id: 1, tracks: [] }, ME);

    expect(repo.deletePlaylistTracks).toHaveBeenCalled();
    expect(repo.insertPlaylistTracks).not.toHaveBeenCalled();
  });

  it("returns notFound:true when playlist disappears after the transaction", async () => {
    repo.findPlaylistHeaderByIdWithClient.mockResolvedValue({ id: 1, name: "Mix" });
    repo.findPlaylistById.mockResolvedValue(null);
    repo.listTrackRefsForPlaylist.mockResolvedValue([]);

    const result = await makeService().updatePlaylist({ id: 1 }, ME);
    expect(result).toEqual({ notFound: true });
  });
});

// ─── ownership and visibility (#1284) ─────────────────────────────────────────

describe("playlist ownership", () => {
  const header = (owner: string, visibility: "household" | "private" = "household") => ({
    id: 1,
    name: "Mix",
    owner_id: owner,
    owner_name: owner === ME ? "Me" : "Sam",
    visibility,
  });

  beforeEach(() => {
    repo.findPlaylistById.mockResolvedValue({ id: 1, name: "Mix", created_at: "2024-01-01" });
    repo.listTrackRefsForPlaylist.mockResolvedValue([]);
  });

  it("scopes every read to the viewer", async () => {
    repo.listPlaylists.mockResolvedValue([]);
    await makeService().getAllPlaylistsWithTracks(SAM);
    expect(repo.listPlaylists).toHaveBeenCalledWith(SAM);

    repo.findPlaylistHeaderById.mockResolvedValue(null);
    expect(await makeService().getPlaylistTrackDetails(1, SAM)).toEqual({ notFound: true });
    expect(repo.findPlaylistHeaderById).toHaveBeenCalledWith(1, SAM);
  });

  it("returns the owner and visibility with a playlist's tracks", async () => {
    repo.findPlaylistHeaderById.mockResolvedValue(header(SAM, "private"));
    const result = await makeService().getPlaylistTrackDetails(1, SAM);
    expect(result).toMatchObject({
      detail: { owner_id: SAM, owner_name: "Sam", visibility: "private" },
    });
  });

  it("creates the playlist for its owner with the requested visibility", async () => {
    repo.createPlaylistWithClient.mockResolvedValue({ id: 3, name: "Mine", created_at: "x" });
    await makeService().createPlaylistWithTracks({
      name: "Mine",
      tracks: [],
      ownerId: SAM,
      visibility: "private",
    });
    expect(repo.createPlaylistWithClient).toHaveBeenCalledWith({}, "Mine", SAM, "private");
  });

  it("lets the owner change visibility", async () => {
    repo.findPlaylistHeaderByIdWithClient.mockResolvedValue(header(ME));
    await makeService().updatePlaylist({ id: 1, visibility: "private" }, ME);
    expect(repo.updatePlaylistVisibility).toHaveBeenCalledWith({}, 1, "private");
    expect(repo.findPlaylistById).toHaveBeenCalledWith(1, ME);
  });

  it("refuses a visibility change from anyone else, before changing anything", async () => {
    repo.findPlaylistHeaderByIdWithClient.mockResolvedValue(header(ME));
    await expect(
      makeService().updatePlaylist({ id: 1, name: "Renamed", visibility: "private" }, SAM),
    ).rejects.toThrow(PlaylistForbiddenError);
    expect(repo.updatePlaylistVisibility).not.toHaveBeenCalled();
    expect(repo.updatePlaylistName).not.toHaveBeenCalled();
  });

  it("lets the household edit someone else's playlist, echoing its visibility", async () => {
    repo.findPlaylistHeaderByIdWithClient.mockResolvedValue(header(ME));
    const result = await makeService().updatePlaylist(
      { id: 1, name: "Renamed", visibility: "household" },
      SAM,
    );
    expect(repo.updatePlaylistName).toHaveBeenCalledWith({}, 1, "Renamed");
    expect(repo.updatePlaylistVisibility).not.toHaveBeenCalled();
    expect(result).toMatchObject({ notFound: false });
  });

  it("is not found when the playlist disappears before it is read back", async () => {
    repo.findPlaylistHeaderByIdWithClient.mockResolvedValue(header(ME));
    repo.findPlaylistById.mockResolvedValue(null);
    expect(await makeService().updatePlaylist({ id: 1 }, ME)).toEqual({ notFound: true });
  });
});

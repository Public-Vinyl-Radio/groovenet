import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscogsTrack } from "@/types/track";

const {
  mockInsertFriendsIfMissing,
  mockListByUsernames,
  mockInsertFriendIfMissing,
  mockFindIdByUsername,
  mockUpsertTrack,
} = vi.hoisted(() => ({
  mockInsertFriendsIfMissing: vi.fn(),
  mockListByUsernames: vi.fn(),
  mockInsertFriendIfMissing: vi.fn(),
  mockFindIdByUsername: vi.fn(),
  mockUpsertTrack: vi.fn(),
}));

vi.mock("@/server/repositories/friendRepository", () => ({
  friendRepository: {
    insertFriendsIfMissing: mockInsertFriendsIfMissing,
    listByUsernames: mockListByUsernames,
    insertFriendIfMissing: mockInsertFriendIfMissing,
    findIdByUsername: mockFindIdByUsername,
  },
}));

vi.mock("@/server/repositories/trackRepository", () => ({
  trackRepository: { upsertDiscogsTrackByTrackIdUsername: mockUpsertTrack },
}));

import { upsertTracks } from "../trackUpsertService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function track(overrides: Partial<DiscogsTrack> = {}): DiscogsTrack {
  return {
    track_id: "t1",
    username: "alice",
    title: "Song",
    artist: "Artist",
    ...overrides,
  } as DiscogsTrack;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockInsertFriendsIfMissing.mockResolvedValue(undefined);
  mockListByUsernames.mockResolvedValue([]);
  mockInsertFriendIfMissing.mockResolvedValue(undefined);
  mockFindIdByUsername.mockResolvedValue(null);
  // Echo back the track as the upserted row by default.
  mockUpsertTrack.mockImplementation(async (t: DiscogsTrack) => t);
});

// ─── Empty / no usernames ───────────────────────────────────────────────────

describe("upsertTracks — nothing to do", () => {
  it("returns empty successes and errors and touches no repositories for an empty list", async () => {
    const result = await upsertTracks([]);
    expect(result).toEqual({ upserted: [], errors: [] });
    expect(mockInsertFriendsIfMissing).not.toHaveBeenCalled();
    expect(mockListByUsernames).not.toHaveBeenCalled();
    expect(mockUpsertTrack).not.toHaveBeenCalled();
  });
});

// ─── Friend resolution ────────────────────────────────────────────────────────

describe("upsertTracks — friend resolution", () => {
  it("dedupes usernames and ensures friends exist before upserting", async () => {
    mockListByUsernames.mockResolvedValueOnce([
      { username: "alice", id: 1 },
      { username: "bob", id: 2 },
    ]);
    await upsertTracks([
      track({ track_id: "t1", username: "alice" }),
      track({ track_id: "t2", username: "bob" }),
      track({ track_id: "t3", username: "alice" }),
    ]);
    expect(mockInsertFriendsIfMissing).toHaveBeenCalledWith(["alice", "bob"]);
    expect(mockListByUsernames).toHaveBeenCalledWith(["alice", "bob"]);
  });

  it("ignores tracks with falsy usernames when building the friend set", async () => {
    mockListByUsernames.mockResolvedValueOnce([{ username: "alice", id: 1 }]);
    await upsertTracks([
      track({ track_id: "t1", username: "alice" }),
      track({ track_id: "t2", username: "" }),
    ]);
    expect(mockInsertFriendsIfMissing).toHaveBeenCalledWith(["alice"]);
  });

  it("passes the resolved friend_id into the track upsert", async () => {
    mockListByUsernames.mockResolvedValueOnce([{ username: "alice", id: 42 }]);
    await upsertTracks([track({ username: "alice" })]);
    expect(mockUpsertTrack).toHaveBeenCalledWith(
      expect.objectContaining({ username: "alice" }),
      42,
    );
  });

  it("falls back to per-user insert+lookup when a username is missing from the map", async () => {
    mockListByUsernames.mockResolvedValueOnce([]); // map comes back empty
    mockFindIdByUsername.mockResolvedValueOnce(7);
    await upsertTracks([track({ username: "carol" })]);
    expect(mockInsertFriendIfMissing).toHaveBeenCalledWith("carol");
    expect(mockFindIdByUsername).toHaveBeenCalledWith("carol");
    expect(mockUpsertTrack).toHaveBeenCalledWith(expect.anything(), 7);
  });

  it("caches a fallback-resolved id so a repeat username is not re-inserted", async () => {
    mockListByUsernames.mockResolvedValueOnce([]);
    mockFindIdByUsername.mockResolvedValueOnce(7);
    await upsertTracks([
      track({ track_id: "t1", username: "carol" }),
      track({ track_id: "t2", username: "carol" }),
    ]);
    expect(mockInsertFriendIfMissing).toHaveBeenCalledTimes(1);
    expect(mockUpsertTrack).toHaveBeenCalledTimes(2);
  });

  it("skips a track whose friend_id cannot be resolved", async () => {
    mockListByUsernames.mockResolvedValueOnce([]);
    mockFindIdByUsername.mockResolvedValueOnce(null); // still unresolved
    const result = await upsertTracks([track({ username: "ghost" })]);
    expect(result).toEqual({
      upserted: [],
      errors: [
        {
          trackId: "t1",
          releaseId: undefined,
          username: "ghost",
          error: "Could not resolve friend_id for username='ghost'",
        },
      ],
    });
    expect(mockUpsertTrack).not.toHaveBeenCalled();
  });
});

// ─── Upsert result handling ─────────────────────────────────────────────────

describe("upsertTracks — result handling", () => {
  it("collects only truthy upsert rows", async () => {
    mockListByUsernames.mockResolvedValueOnce([{ username: "alice", id: 1 }]);
    mockUpsertTrack.mockResolvedValueOnce({ track_id: "t1" }).mockResolvedValueOnce(null); // soft-deleted / no-op upsert
    const result = await upsertTracks([track({ track_id: "t1" }), track({ track_id: "t2" })]);
    expect(result).toEqual({ upserted: [{ track_id: "t1" }], errors: [] });
  });

  it("continues the batch when one upsert throws", async () => {
    mockListByUsernames.mockResolvedValueOnce([{ username: "alice", id: 1 }]);
    mockUpsertTrack
      .mockRejectedValueOnce(new Error("constraint violation"))
      .mockResolvedValueOnce({ track_id: "t2" });
    const result = await upsertTracks([
      track({ track_id: "t1", release_id: "32596437" }),
      track({ track_id: "t2", release_id: "32596437" }),
    ]);
    expect(result).toEqual({
      upserted: [{ track_id: "t2" }],
      errors: [
        {
          trackId: "t1",
          releaseId: "32596437",
          username: "alice",
          error: "constraint violation",
        },
      ],
    });
  });
});

describe("upsertTracks — failure reporting (#497)", () => {
  it("retains successful rows and every failure across releases, including non-Error rejections", async () => {
    mockListByUsernames.mockResolvedValueOnce([{ username: "alice", id: 1 }]);
    mockUpsertTrack
      .mockResolvedValueOnce({ track_id: "1-A1" })
      .mockRejectedValueOnce(new Error("constraint violation"))
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce("connection lost")
      .mockResolvedValueOnce({ track_id: "2-B1" });

    const tracks = [
      track({ track_id: "1-A1", release_id: "1" }),
      track({ track_id: "1-A2", release_id: "1" }),
      track({ track_id: "1-A3", release_id: "1" }),
      track({ track_id: "2-A1", release_id: "2" }),
      track({ track_id: "2-B1", release_id: "2" }),
    ];
    const result = await upsertTracks(tracks);

    expect(result).toEqual({
      upserted: [{ track_id: "1-A1" }, { track_id: "2-B1" }],
      errors: [
        { trackId: "1-A2", releaseId: "1", username: "alice", error: "constraint violation" },
        { trackId: "2-A1", releaseId: "2", username: "alice", error: "connection lost" },
      ],
    });
    expect(mockUpsertTrack.mock.calls).toEqual(tracks.map((t) => [t, 1]));
  });

  it.each(["insert", "lookup"])(
    "reports a per-track friend %s failure and continues",
    async (operation) => {
      mockListByUsernames.mockResolvedValueOnce([{ username: "alice", id: 1 }]);
      if (operation === "insert") {
        mockInsertFriendIfMissing.mockRejectedValueOnce(new Error("friend insert failed"));
      } else {
        mockFindIdByUsername.mockRejectedValueOnce(new Error("friend lookup failed"));
      }

      const result = await upsertTracks([
        track({ track_id: "1-A1", release_id: "1", username: "bob" }),
        track({ track_id: "1-A2", release_id: "1" }),
      ]);

      expect(result.upserted).toEqual([track({ track_id: "1-A2", release_id: "1" })]);
      expect(result.errors).toEqual([
        {
          trackId: "1-A1",
          releaseId: "1",
          username: "bob",
          error: `friend ${operation} failed`,
        },
      ]);
      expect(mockUpsertTrack).toHaveBeenCalledTimes(1);
    },
  );

  it("still rejects a batch-level friend resolution failure", async () => {
    mockInsertFriendsIfMissing.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(upsertTracks([track()])).rejects.toThrow("database unavailable");
    expect(mockUpsertTrack).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockListFriends,
  mockListFriendsWithReleaseCounts,
  mockGetManifestLastSynced,
  mockInsertFriendIfMissing,
  mockDeleteTracksByUsername,
  mockDeleteFriendByUsername,
  mockGetManifestPath,
  mockGetManifestReleaseIds,
  mockGetReleasePath,
  mockExistsSync,
  mockUnlinkSync,
  mockReaddirSync,
} = vi.hoisted(() => ({
  mockListFriends: vi.fn(),
  mockListFriendsWithReleaseCounts: vi.fn(),
  mockGetManifestLastSynced: vi.fn(),
  mockInsertFriendIfMissing: vi.fn(),
  mockDeleteTracksByUsername: vi.fn(),
  mockDeleteFriendByUsername: vi.fn(),
  mockGetManifestPath: vi.fn(),
  mockGetManifestReleaseIds: vi.fn(),
  mockGetReleasePath: vi.fn(),
  mockExistsSync: vi.fn(),
  mockUnlinkSync: vi.fn(),
  mockReaddirSync: vi.fn(),
}));

vi.mock("@/server/repositories/friendRepository", () => ({
  friendRepository: {
    listFriends: mockListFriends,
    listFriendsWithReleaseCounts: mockListFriendsWithReleaseCounts,
    insertFriendIfMissing: mockInsertFriendIfMissing,
    deleteTracksByUsername: mockDeleteTracksByUsername,
    deleteFriendByUsername: mockDeleteFriendByUsername,
  },
}));

vi.mock("@/server/services/discogsManifestService", () => ({
  getManifestPath: mockGetManifestPath,
  getManifestReleaseIds: mockGetManifestReleaseIds,
  getManifestLastSynced: mockGetManifestLastSynced,
  getReleasePath: mockGetReleasePath,
  DISCOGS_EXPORTS_DIR: "/exports",
}));

vi.mock("fs", () => ({
  existsSync: mockExistsSync,
  unlinkSync: mockUnlinkSync,
  readdirSync: mockReaddirSync,
}));

vi.mock("path", () => ({ join: (...parts: string[]) => parts.join("/") }));

import { friendService } from "../friendService";

beforeEach(() => {
  vi.resetAllMocks();
  mockGetManifestPath.mockReturnValue("/exports/alice.json");
  mockGetManifestReleaseIds.mockReturnValue([]);
  mockGetReleasePath.mockImplementation((u: string, id: string) => `/exports/${u}_${id}.json`);
  mockExistsSync.mockReturnValue(true);
  mockReaddirSync.mockReturnValue([]);
});

// ─── Thin delegators ────────────────────────────────────────────────────────

describe("FriendService — list/add", () => {
  it("listFriends delegates to the repository", async () => {
    const rows = [{ id: 1, username: "alice" }];
    mockListFriends.mockResolvedValueOnce(rows);
    await expect(friendService.listFriends()).resolves.toBe(rows);
  });

  it("addFriend inserts the friend if missing", async () => {
    await friendService.addFriend("bob");
    expect(mockInsertFriendIfMissing).toHaveBeenCalledWith("bob");
  });
});

describe("FriendService.listLibraries", () => {
  const rows = [
    { id: 3, username: "bob", release_count: 12 },
    { id: 1, username: "owner", release_count: 400 },
    { id: 2, username: "alice", release_count: 0 },
  ];

  afterEach(() => {
    delete process.env.DISCOGS_USERNAME;
  });

  it("puts the server's account first, flagged, with each library's last sync", async () => {
    process.env.DISCOGS_USERNAME = " owner ";
    mockListFriendsWithReleaseCounts.mockResolvedValueOnce(rows);
    mockGetManifestLastSynced.mockImplementation((u: string) =>
      u === "owner" ? "2026-10-01T00:00:00.000Z" : null,
    );

    await expect(friendService.listLibraries()).resolves.toEqual({
      account_username: "owner",
      results: [
        {
          id: 1,
          username: "owner",
          release_count: 400,
          is_account: true,
          last_synced_at: "2026-10-01T00:00:00.000Z",
        },
        { id: 3, username: "bob", release_count: 12, is_account: false, last_synced_at: null },
        { id: 2, username: "alice", release_count: 0, is_account: false, last_synced_at: null },
      ],
    });
  });

  it("flags no account when the server has no DISCOGS_USERNAME", async () => {
    mockListFriendsWithReleaseCounts.mockResolvedValueOnce(rows);
    const { results, account_username } = await friendService.listLibraries();
    expect(account_username).toBeNull();
    expect(results.map((r) => r.is_account)).toEqual([false, false, false]);
    expect(results.map((r) => r.username)).toEqual(["bob", "owner", "alice"]);
  });
});

// ─── removeFriend ─────────────────────────────────────────────────────────────

describe("FriendService.removeFriend — file cleanup", () => {
  it("deletes the manifest, its releases, and legacy release files", async () => {
    mockGetManifestReleaseIds.mockReturnValueOnce(["r1", "r2"]);
    mockReaddirSync.mockReturnValueOnce([
      "alice_release_old.json",
      "unrelated.txt",
      "bob_release_x.json",
    ]);
    const progress: string[] = [];
    await friendService.removeFriend("alice", (l) => progress.push(l));

    // manifest + 2 releases + 1 legacy file
    expect(mockUnlinkSync).toHaveBeenCalledWith("/exports/alice.json");
    expect(mockUnlinkSync).toHaveBeenCalledWith("/exports/alice_r1.json");
    expect(mockUnlinkSync).toHaveBeenCalledWith("/exports/alice_r2.json");
    expect(mockUnlinkSync).toHaveBeenCalledWith("/exports/alice_release_old.json");
    expect(mockUnlinkSync).not.toHaveBeenCalledWith("/exports/bob_release_x.json");
    expect(progress.join("\n")).toMatch(/Deleted manifest/);
  });

  it("reports missing manifest/release files instead of deleting them", async () => {
    mockExistsSync.mockReturnValue(false);
    mockGetManifestReleaseIds.mockReturnValueOnce(["r1"]);
    const progress: string[] = [];
    await friendService.removeFriend("alice", (l) => progress.push(l));
    expect(mockUnlinkSync).not.toHaveBeenCalled();
    expect(progress.join("\n")).toMatch(/Manifest not found/);
    expect(progress.join("\n")).toMatch(/Release not found/);
  });

  it("swallows file-cleanup errors but still deletes from Postgres and the friend", async () => {
    mockGetManifestReleaseIds.mockImplementationOnce(() => {
      throw new Error("manifest read failed");
    });
    const progress: string[] = [];
    await friendService.removeFriend("alice", (l) => progress.push(l));
    expect(progress.join("\n")).toMatch(/Error deleting manifest\/release files/);
    expect(mockDeleteTracksByUsername).toHaveBeenCalledWith("alice");
    expect(mockDeleteFriendByUsername).toHaveBeenCalledWith("alice");
  });
});

describe("FriendService.removeFriend — database deletion", () => {
  it("deletes tracks then the friend, in that order", async () => {
    const calls: string[] = [];
    mockDeleteTracksByUsername.mockImplementationOnce(async () => {
      calls.push("tracks");
    });
    mockDeleteFriendByUsername.mockImplementationOnce(async () => {
      calls.push("friend");
    });
    await friendService.removeFriend("alice", () => {});
    expect(calls).toEqual(["tracks", "friend"]);
  });

  it("still deletes the friend when track deletion throws", async () => {
    mockDeleteTracksByUsername.mockRejectedValueOnce(new Error("fk violation"));
    const progress: string[] = [];
    await friendService.removeFriend("alice", (l) => progress.push(l));
    expect(progress.join("\n")).toMatch(/Error deleting user tracks/);
    expect(mockDeleteFriendByUsername).toHaveBeenCalledWith("alice");
  });
});

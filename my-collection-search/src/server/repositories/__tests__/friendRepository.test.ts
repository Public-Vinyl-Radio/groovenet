import { describe, it, expect, vi, beforeEach } from "vitest";
import { FriendRepository } from "../friendRepository";

const dbQuery = vi.hoisted(() => vi.fn());

vi.mock("@/lib/serverDb", () => ({ dbQuery }));

beforeEach(() => {
  vi.resetAllMocks();
});

function makeRepo() {
  return new FriendRepository();
}

// ─── listFriends ──────────────────────────────────────────────────────────────

describe("listFriends()", () => {
  it("returns all friend rows from the database", async () => {
    const rows = [
      { id: 1, username: "adam" },
      { id: 2, username: "bob" },
    ];
    dbQuery.mockResolvedValue({ rows });

    const result = await makeRepo().listFriends();

    expect(result).toEqual(rows);
    expect(dbQuery).toHaveBeenCalledOnce();
  });
});

// ─── findIdByUsername ─────────────────────────────────────────────────────────

describe("findById()", () => {
  it("returns the friend when the id exists", async () => {
    dbQuery.mockResolvedValue({ rows: [{ id: 3, username: "cat" }] });

    expect(await makeRepo().findById(3)).toEqual({ id: 3, username: "cat" });
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("WHERE id = $1"), [3]);
  });

  it("returns null when the id is not found", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    expect(await makeRepo().findById(99)).toBeNull();
  });
});

describe("findIdByUsername()", () => {
  it("returns id when the username exists", async () => {
    dbQuery.mockResolvedValue({ rows: [{ id: 7 }] });

    const result = await makeRepo().findIdByUsername("adam");

    expect(result).toBe(7);
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("friends"), ["adam"]);
  });

  it("returns null when the username is not found", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    const result = await makeRepo().findIdByUsername("ghost");

    expect(result).toBeNull();
  });
});

// ─── insertFriendIfMissing ────────────────────────────────────────────────────

describe("insertFriendIfMissing()", () => {
  it("calls dbQuery with the username", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().insertFriendIfMissing("newuser");

    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("INSERT"), ["newuser"]);
  });
});

// ─── ensureIdByUsername ───────────────────────────────────────────────────────

describe("ensureIdByUsername()", () => {
  it("inserts then returns the id", async () => {
    // insertFriendIfMissing (no-op), then findIdByUsername
    dbQuery
      .mockResolvedValueOnce({ rows: [] }) // INSERT ON CONFLICT
      .mockResolvedValueOnce({ rows: [{ id: 42 }] }); // SELECT

    const result = await makeRepo().ensureIdByUsername("adam");

    expect(result).toBe(42);
    expect(dbQuery).toHaveBeenCalledTimes(2);
  });

  it("throws when the id cannot be resolved after insert", async () => {
    dbQuery
      .mockResolvedValueOnce({ rows: [] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // SELECT returns nothing

    await expect(makeRepo().ensureIdByUsername("ghost")).rejects.toThrow(
      "Failed to resolve friend id for username 'ghost'",
    );
  });
});

// ─── insertFriendsIfMissing ───────────────────────────────────────────────────

describe("insertFriendsIfMissing()", () => {
  it("does nothing when given an empty array", async () => {
    await makeRepo().insertFriendsIfMissing([]);

    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("calls dbQuery with all usernames when given a non-empty array", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().insertFriendsIfMissing(["alice", "bob"]);

    expect(dbQuery).toHaveBeenCalledOnce();
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("INSERT"), [["alice", "bob"]]);
  });
});

// ─── listByUsernames ──────────────────────────────────────────────────────────

describe("listByUsernames()", () => {
  it("returns empty array without querying when given an empty array", async () => {
    const result = await makeRepo().listByUsernames([]);

    expect(result).toEqual([]);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("returns matching rows", async () => {
    const rows = [{ id: 1, username: "alice" }];
    dbQuery.mockResolvedValue({ rows });

    const result = await makeRepo().listByUsernames(["alice"]);

    expect(result).toEqual(rows);
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("friends"), [["alice"]]);
  });
});

// ─── deleteTracksByUsername ───────────────────────────────────────────────────

describe("deleteTracksByUsername()", () => {
  it("issues a DELETE on tracks for the given username", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: 3 });

    await makeRepo().deleteTracksByUsername("alice");

    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM tracks"), ["alice"]);
  });
});

// ─── deleteFriendByUsername ───────────────────────────────────────────────────

describe("deleteFriendByUsername()", () => {
  it("issues a DELETE on friends for the given username", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await makeRepo().deleteFriendByUsername("alice");

    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM friends"), ["alice"]);
  });
});

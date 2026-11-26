import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({ dbQuery: db }));
import { ratingKey, trackRatingRepository as repo } from "../trackRatingRepository";

beforeEach(() => {
  db.mockReset();
  db.mockResolvedValue({ rows: [] });
});

const ref = { track_id: "t1", friend_id: 6 };

describe("track ratings (#1283)", () => {
  it("keys a row by friend and track", () => {
    expect(ratingKey("t1", 6)).toBe("6:t1");
  });

  it("asks for nothing without tracks", async () => {
    expect((await repo.forTracks([], "me")).size).toBe(0);
    expect(db).not.toHaveBeenCalled();
  });

  it("splits one batched read into the viewer's rating and everyone else's", async () => {
    db.mockResolvedValueOnce({
      rows: [
        { track_id: "t1", friend_id: 6, user_id: "me", name: "Owner", rating: 5 },
        { track_id: "t1", friend_id: 6, user_id: "sam", name: "Sam", rating: 3 },
        { track_id: "t2", friend_id: 6, user_id: "sam", name: "Sam", rating: 4 },
      ],
    });
    const ratings = await repo.forTracks([ref, { track_id: "t2", friend_id: 6 }], "me");
    expect(db).toHaveBeenCalledWith(expect.stringContaining("JOIN users u"), [
      ["t1", "t2"],
      [6, 6],
    ]);
    expect(ratings.get("6:t1")).toEqual({
      rating: 5,
      others: [{ user_id: "sam", name: "Sam", rating: 3 }],
    });
    // Rated only by someone else: the viewer's is 0.
    expect(ratings.get("6:t2")).toEqual({
      rating: 0,
      others: [{ user_id: "sam", name: "Sam", rating: 4 }],
    });
  });

  it("upserts the viewer's rating on the collection row", async () => {
    await repo.set("me", ref, 4);
    const [sql, params] = db.mock.calls[0];
    expect(sql).toContain("ON CONFLICT (user_id, track_id, friend_id)");
    expect(sql).toContain("updated_at = now()");
    expect(params).toEqual(["me", "t1", 6, 4]);
  });

  it("rounds and caps a rating at 5", async () => {
    await repo.set("me", ref, 7.4);
    expect(db.mock.calls[0][1]).toEqual(["me", "t1", 6, 5]);
  });

  it.each([0, null, -2])("clears the rating for %j", async (rating) => {
    await repo.set("me", ref, rating);
    const [sql, params] = db.mock.calls[0];
    expect(sql).toContain("DELETE FROM track_ratings");
    expect(params).toEqual(["me", "t1", 6]);
  });

  it("runs inside the caller's transaction when given a client", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await repo.set("me", ref, 3, client as never);
    await repo.set("me", ref, 0, client as never);
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(db).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({ dbQuery }));

import { ArtistCreditRepository, creditKey } from "../artistCreditRepository";

const repo = new ArtistCreditRepository();
const credit = (id: number, position: number) => ({
  id,
  name: `Artist ${id}`,
  slug: `artist-${id}`,
  is_placeholder: false,
  role: "primary",
  position,
  credited_as: `Artist ${id}`,
});

describe("ArtistCreditRepository", () => {
  beforeEach(() => dbQuery.mockReset());

  it("does no query for no keys", async () => {
    expect((await repo.forAlbums([])).size).toBe(0);
    expect((await repo.forTracks([])).size).toBe(0);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("groups album credits by friend and release, in order", async () => {
    dbQuery.mockResolvedValue({
      rows: [
        { key_id: "r1", key_friend_id: 6, ...credit(1, 0) },
        { key_id: "r1", key_friend_id: 6, ...credit(2, 1) },
        { key_id: "r2", key_friend_id: 7, ...credit(3, 0) },
      ],
    });
    const out = await repo.forAlbums([
      { id: "r1", friend_id: 6 },
      { id: "r2", friend_id: 7 },
    ]);
    expect(out.get(creditKey("r1", 6))).toEqual([credit(1, 0), credit(2, 1)]);
    expect(out.get("7:r2")).toEqual([credit(3, 0)]);
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("JOIN album_artists c ON c.album_id = a.id");
    expect(params).toEqual([
      ["r1", "r2"],
      [6, 7],
    ]);
  });

  it("reads track credits by track and friend", async () => {
    dbQuery.mockResolvedValue({ rows: [{ key_id: "t1", key_friend_id: 6, ...credit(1, 0) }] });
    const out = await repo.forTracks([{ id: "t1", friend_id: 6 }]);
    expect(out.get("6:t1")).toEqual([credit(1, 0)]);
    expect(dbQuery.mock.calls[0][0]).toContain("JOIN track_artists c");
  });
});

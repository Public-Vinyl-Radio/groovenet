import { beforeEach, describe, expect, it, vi } from "vitest";

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({ dbQuery }));

import { ArtistListRepository } from "../artistListRepository";

const repo = new ArtistListRepository();
const lastCall = () => dbQuery.mock.calls.at(-1) as [string, unknown[]];

describe("ArtistListRepository", () => {
  beforeEach(() => dbQuery.mockReset().mockResolvedValue({ rows: [{ total: 3 }] }));

  it("lists every artist but placeholders and merged ones without a query", async () => {
    await expect(repo.search({ q: "", includePlaceholders: false }, 50, 0)).resolves.toEqual([
      { total: 3 },
    ]);
    const [sql, params] = lastCall();
    expect(params).toEqual([50, 0]);
    expect(sql).toContain("ar.merged_into IS NULL AND NOT ar.is_placeholder");
    expect(sql).toContain("false AS exact");
    expect(sql).toContain("LIMIT $1 OFFSET $2");
    expect(sql).not.toContain("friend_id = $");
  });

  it("matches the name and aliases, escaping LIKE wildcards, and ranks exact first", async () => {
    await repo.search({ q: "The 100%_Club", friendId: 6, includePlaceholders: true }, 10, 20);
    const [sql, params] = lastCall();
    expect(params[0]).toBe(6);
    expect(params[1]).toBe("%The 100\\%\\_Club%");
    expect(params[2]).toMatch(/^%.*%$/);
    expect(params.slice(-2)).toEqual([10, 20]);
    expect(sql).toContain("a.friend_id = $1");
    expect(sql).toContain("t.friend_id = $1");
    expect(sql).toContain("ar.name ILIKE $2");
    expect(sql).toContain("lower(ar.name) = lower($4)");
    expect(sql).toContain("al.alias_normalized = $5");
    expect(sql).toContain("(COALESCE(alb.n, 0) + COALESCE(trk.n, 0)) > 0");
    expect(sql).not.toContain("NOT ar.is_placeholder");
    expect(sql).toContain("ORDER BY exact DESC");
  });

  it("skips the exact rank when the query normalises to nothing", async () => {
    await repo.search({ q: "(2)", includePlaceholders: false }, 5, 0);
    const [sql] = lastCall();
    expect(sql).toContain("(lower(ar.name) = lower($3)) AS exact");
    expect(sql).not.toContain("al.alias_normalized = $");
  });

  it("counts the same matches", async () => {
    await expect(repo.count({ q: "mirlos", includePlaceholders: false })).resolves.toBe(3);
    expect(lastCall()[0]).toContain("SELECT count(*)::integer AS total FROM matched");
    dbQuery.mockResolvedValueOnce({ rows: [] });
    await expect(repo.count({ q: "", includePlaceholders: false })).resolves.toBe(0);
  });
});

import { beforeEach, expect, it, vi } from "vitest";

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({ dbQuery }));

import { ArtistFilterRepository } from "../artistFilterRepository";

const repo = new ArtistFilterRepository();

beforeEach(() => {
  dbQuery.mockReset();
});

it("asks nothing for no values", async () => {
  await expect(repo.resolve([])).resolves.toEqual([]);
  expect(dbQuery).not.toHaveBeenCalled();
});

it("matches slug or id and follows merges to the survivor", async () => {
  const rows = [{ requested: "x", id: 1, name: "X", slug: "x" }];
  dbQuery.mockResolvedValue({ rows });
  await expect(repo.resolve(["x", "12"])).resolves.toBe(rows);
  const [sql, params] = dbQuery.mock.calls[0] as [string, unknown[]];
  expect(params).toEqual([["x", "12"]]);
  expect(sql).toContain("WITH RECURSIVE requested");
  expect(sql).toContain("ar.slug = lower(v.value)");
  expect(sql).toContain("ar.id::text = v.value");
  expect(sql).toContain("artist_slug_history h");
  expect(sql).toContain("JOIN artists ar ON ar.id = r.merged_into");
  expect(sql).toContain("WHERE r.merged_into IS NULL");
});

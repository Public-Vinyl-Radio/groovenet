import { beforeEach, describe, expect, it, vi } from "vitest";
import { RankingProfileRepository } from "../rankingProfileRepository";

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({ dbQuery }));

const repo = new RankingProfileRepository();
const write = {
  name: "Peak",
  description: "",
  surfaces: ["suggestions" as const],
  version: 1,
  config: { weights: { bpm_distance: 1 } },
};
const row = { id: 3, friend_id: 1, ...write };

beforeEach(() => {
  dbQuery.mockReset();
});

describe("RankingProfileRepository", () => {
  it("lists a friend's profiles oldest first", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [row] });
    expect(await repo.listByFriend(1)).toEqual([row]);
    expect(dbQuery.mock.calls[0][0]).toMatch(/WHERE friend_id = \$1 ORDER BY id/);
    expect(dbQuery.mock.calls[0][1]).toEqual([1]);
  });

  it("finds one by id, or null", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [row] }).mockResolvedValueOnce({ rows: [] });
    expect(await repo.findById(3)).toEqual(row);
    expect(await repo.findById(4)).toBeNull();
  });

  it("inserts within the limit in one statement, null past it", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [row] }).mockResolvedValueOnce({ rows: [] });
    expect(await repo.insert(1, write, 50)).toEqual(row);
    const [sql, values] = dbQuery.mock.calls[0];
    expect(sql).toMatch(
      /WHERE \(SELECT count\(\*\) FROM ranking_profiles WHERE friend_id = \$1\) < \$7/,
    );
    expect(values).toEqual([
      1,
      "Peak",
      "",
      ["suggestions"],
      1,
      '{"weights":{"bpm_distance":1}}',
      50,
    ]);
    expect(await repo.insert(1, write, 50)).toBeNull();
  });

  it("updates every column, or null for a missing row", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [row] }).mockResolvedValueOnce({ rows: [] });
    expect(await repo.update(3, write)).toEqual(row);
    expect(dbQuery.mock.calls[0][0]).toMatch(/updated_at = current_timestamp/);
    expect(dbQuery.mock.calls[0][1][0]).toBe(3);
    expect(await repo.update(9, write)).toBeNull();
  });

  it("drops selections outside a profile's surfaces", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });
    await repo.dropSelectionsOutside(3, ["related"]);
    expect(dbQuery.mock.calls[0][1]).toEqual([3, ["related"]]);
  });

  it("deletes, reporting whether a row went", async () => {
    dbQuery
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: null });
    expect(await repo.delete(3)).toBe(true);
    expect(await repo.delete(3)).toBe(false);
    expect(await repo.delete(3)).toBe(false);
  });

  it("lists and sets selections", async () => {
    const selection = { surface: "related", preset_id: "selector", profile_id: null };
    dbQuery.mockResolvedValueOnce({ rows: [selection] }).mockResolvedValue({ rows: [] });
    expect(await repo.listSelections(1)).toEqual([selection]);
    await repo.setSelections(1, ["related", "suggestions"], { presetId: "selector" });
    expect(dbQuery.mock.calls[1][0]).toMatch(/ON CONFLICT \(friend_id, surface\)/);
    expect(dbQuery.mock.calls[1][1]).toEqual([1, ["related", "suggestions"], "selector", null]);
    await repo.setSelections(1, ["related"], { profileId: 3 });
    expect(dbQuery.mock.calls[2][1]).toEqual([1, ["related"], null, 3]);
  });
});

import { coverUrlSql } from "../coverUrlSql";
import { expect, it, vi } from "vitest";
import { dbQuery } from "@/lib/serverDb";
import {
  homeRepository,
  homeCountsSql,
  homeArrivalsSql,
  homeAttentionSql,
  homePlaylistsSql,
} from "../homeRepository";
vi.mock("@/lib/serverDb", () => ({ dbQuery: vi.fn() }));
const VIEWER = "00000000-0000-4000-8000-000000000002";
it("binds friend and arrivals clock to focused queries and returns their rows", async () => {
  const now = new Date("2026-10-31T12:00:00Z");
  const result = { counts: {}, items: [], recent: [] };
  for (const [fn, sql, params] of [
    [() => homeRepository.counts(7, VIEWER), homeCountsSql, [7, VIEWER]],
    [() => homeRepository.arrivals(7, now), homeArrivalsSql, [7, now]],
    [() => homeRepository.attention(7), homeAttentionSql, [7]],
    [() => homeRepository.playlists(7, VIEWER), homePlaylistsSql, [7, VIEWER]],
  ] as const) {
    vi.mocked(dbQuery).mockResolvedValueOnce({ rows: [result] } as never);
    expect(await fn()).toBe(result);
    expect(dbQuery).toHaveBeenLastCalledWith(sql, params);
  }
});

it("resolves chosen album and legacy track covers for arrivals", () => {
  expect(homeArrivalsSql).toContain(`${coverUrlSql("a", true)} AS thumbnail`);
});

it("counts and lists only the playlists the viewer may see (#1284)", () => {
  for (const sql of [homeCountsSql, homePlaylistsSql]) {
    expect(sql).toContain("p.visibility = 'household' OR p.owner_id = $2::uuid");
  }
});

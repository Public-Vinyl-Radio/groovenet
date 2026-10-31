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
it("binds friend and arrivals clock to focused queries and returns their rows", async () => {
  const now = new Date("2026-10-31T12:00:00Z");
  const result = { counts: {}, items: [], recent: [] };
  for (const [fn, sql, params] of [
    [() => homeRepository.counts(7), homeCountsSql, [7]],
    [() => homeRepository.arrivals(7, now), homeArrivalsSql, [7, now]],
    [() => homeRepository.attention(7), homeAttentionSql, [7]],
    [() => homeRepository.playlists(7), homePlaylistsSql, [7]],
  ] as const) {
    vi.mocked(dbQuery).mockResolvedValueOnce({ rows: [result] } as never);
    expect(await fn()).toBe(result);
    expect(dbQuery).toHaveBeenLastCalledWith(sql, params);
  }
});

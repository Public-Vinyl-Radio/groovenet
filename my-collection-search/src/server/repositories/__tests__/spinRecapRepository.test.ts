import { expect, it, vi } from "vitest";
import { dbQuery } from "@/lib/serverDb";
import { spinRecapRepository, recapGroupsSql, recapFirstSpinsSql } from "../spinRecapRepository";
vi.mock("@/lib/serverDb", () => ({ dbQuery: vi.fn() }));
it("binds friend, month and zone and returns grouped rows", async () => {
  const rows = [{ spins: 3 }];
  vi.mocked(dbQuery).mockResolvedValueOnce({ rows } as never);
  expect(await spinRecapRepository.groups(1, "2026-10", "America/Los_Angeles")).toBe(rows);
  expect(dbQuery).toHaveBeenLastCalledWith(recapGroupsSql, [
    1,
    "2026-10-01",
    "America/Los_Angeles",
  ]);
});
it("returns first-spin counts with the same parameterized bounds", async () => {
  const counts = { current: 1, previous: 2 };
  vi.mocked(dbQuery).mockResolvedValueOnce({ rows: [counts] } as never);
  expect(await spinRecapRepository.firstSpins(1, "2026-10", "UTC")).toBe(counts);
  expect(dbQuery).toHaveBeenLastCalledWith(recapFirstSpinsSql, [1, "2026-10-01", "UTC"]);
});

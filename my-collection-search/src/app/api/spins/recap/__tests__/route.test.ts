import { beforeEach, expect, it, vi } from "vitest";
import { spinRecapService } from "@/server/services/spinRecapService";
import { GET } from "../route";
vi.mock("@/server/services/spinRecapService", () => ({ spinRecapService: { getRecap: vi.fn() } }));
const request = (query = "friend_id=1&month=2026-10") =>
  new Request(`http://localhost/api/spins/recap?${query}`);
const empty = {
  stats: {
    spins: { value: 0, previous: 0 },
    hours: { value: 0, previous: 0 },
    records_pulled: { value: 0, previous: 0 },
    new_to_rotation: { value: 0, previous: 0 },
    hours_known_share: 0,
    hours_known_spins: 0,
  },
  split: { vinyl: 0, digital: 0 },
  by_week: [],
  genre_mix: { current: [], previous: [] },
  top_records: [],
  top_tracks: [],
  top_artists: [],
  heatmap: [],
  bpm: { histogram: [], median: null, busiest: null },
};
beforeEach(() => vi.mocked(spinRecapService.getRecap).mockReset());
it.each([
  "",
  "month=2026-10",
  "friend_id=nope&month=2026-10",
  "friend_id=&month=2026-10",
  "friend_id=1.2&month=2026-10",
  "friend_id=1",
  "friend_id=1&month=2026-13",
  "friend_id=1&month=2026-00",
  "friend_id=1&month=2026-1",
  "friend_id=1&month=0000-01",
  "friend_id=1&month=2026-10-01",
])("rejects invalid query %s", async (query) => {
  expect((await GET(request(query) as never)).status).toBe(400);
  expect(spinRecapService.getRecap).not.toHaveBeenCalled();
});
it("returns the validated recap and coerces the friend ID", async () => {
  vi.mocked(spinRecapService.getRecap).mockResolvedValueOnce(empty);
  const response = await GET(request() as never);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(empty);
  expect(spinRecapService.getRecap).toHaveBeenCalledWith({ friend_id: 1, month: "2026-10" });
});
it.each([
  [new Error("db down"), "db down"],
  ["boom", "Failed to get spin recap"],
])("returns 500 on failure %s", async (error, message) => {
  vi.mocked(spinRecapService.getRecap).mockRejectedValueOnce(error);
  const response = await GET(request() as never);
  expect(response.status).toBe(500);
  expect((await response.json()).error).toBe(message);
});
it("rejects an invalid service response", async () => {
  vi.mocked(spinRecapService.getRecap).mockResolvedValueOnce({} as never);
  expect((await GET(request() as never)).status).toBe(500);
});

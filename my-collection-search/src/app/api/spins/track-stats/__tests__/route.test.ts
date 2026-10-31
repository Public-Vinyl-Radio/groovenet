import { beforeEach, expect, it, vi } from "vitest";
import { spinLoggingService } from "@/server/services/spinLoggingService";
import { GET } from "../route";
vi.mock("@/server/services/spinLoggingService", () => ({
  spinLoggingService: { getTrackStats: vi.fn() },
}));
const request = (query = "friend_id=1&track_id=t1") =>
  new Request(`http://localhost/api/spins/track-stats?${query}`);
beforeEach(() => vi.mocked(spinLoggingService.getTrackStats).mockReset());
it.each(["", "track_id=t1", "friend_id=1", "friend_id=1&track_id=", "friend_id=x&track_id=t1"])(
  "rejects invalid query %s",
  async (query) => {
    expect((await GET(request(query) as never)).status).toBe(400);
    expect(spinLoggingService.getTrackStats).not.toHaveBeenCalled();
  },
);
it("returns the play count and coerces the friend ID", async () => {
  const stats = { play_count: 4, last_played_at: "2026-10-27T19:38:00.000Z" };
  vi.mocked(spinLoggingService.getTrackStats).mockResolvedValueOnce(stats);
  const response = await GET(request() as never);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(stats);
  expect(spinLoggingService.getTrackStats).toHaveBeenCalledWith({ friend_id: 1, track_id: "t1" });
});
it("returns zero plays for a track never spun", async () => {
  const stats = { play_count: 0, last_played_at: null };
  vi.mocked(spinLoggingService.getTrackStats).mockResolvedValueOnce(stats);
  expect(await (await GET(request() as never)).json()).toEqual(stats);
});
it.each([
  [new Error("db down"), "db down"],
  ["boom", "Failed to get spin track stats"],
])("returns 500 on failure %s", async (error, message) => {
  vi.mocked(spinLoggingService.getTrackStats).mockRejectedValueOnce(error);
  const response = await GET(request() as never);
  expect(response.status).toBe(500);
  expect((await response.json()).error).toBe(message);
});

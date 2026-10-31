import { emptyHome } from "@/test/homeFixture";
import { beforeEach, expect, it, vi } from "vitest";
import { homeService } from "@/server/services/homeService";
import { GET } from "../route";
vi.mock("@/server/services/homeService", () => ({ homeService: { getHome: vi.fn() } }));
const request = (query = "friend_id=1") => new Request(`http://localhost/api/home?${query}`);
const empty = emptyHome;
beforeEach(() => vi.mocked(homeService.getHome).mockReset());
it.each([
  "",
  "friend_id=nope",
  "friend_id=",
  "friend_id=1.2",
  "friend_id=0",
  "friend_id=-1",
  "friend_id=9007199254740992",
])("rejects invalid query %s", async (query) => {
  expect((await GET(request(query) as never)).status).toBe(400);
  expect(homeService.getHome).not.toHaveBeenCalled();
});
it("returns the validated Home summary and coerces the friend ID", async () => {
  vi.mocked(homeService.getHome).mockResolvedValueOnce(empty);
  const response = await GET(request() as never);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(empty);
  expect(homeService.getHome).toHaveBeenCalledWith({ friend_id: 1 });
});
it.each([
  [new Error("db down"), "db down"],
  ["boom", "Failed to get home"],
])("returns 500 on failure %s", async (error, message) => {
  vi.mocked(homeService.getHome).mockRejectedValueOnce(error);
  const response = await GET(request() as never);
  expect(response.status).toBe(500);
  expect((await response.json()).error).toBe(message);
});
it("rejects an invalid service response", async () => {
  vi.mocked(homeService.getHome).mockResolvedValueOnce({} as never);
  expect((await GET(request() as never)).status).toBe(500);
});

import { expect, it, vi } from "vitest";
import { http } from "@/services/http";
import { getHome } from "./home";
vi.mock("@/services/http", () => ({ http: vi.fn() }));
it("requests the exact friend without caching", async () => {
  const data = { counts: {} };
  vi.mocked(http).mockResolvedValue(data);
  expect(await getHome({ friend_id: 7 })).toBe(data);
  expect(http).toHaveBeenCalledWith("/api/home?friend_id=7", { method: "GET", cache: "no-store" });
});

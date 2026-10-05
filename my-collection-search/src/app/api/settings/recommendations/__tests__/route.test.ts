import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const service = vi.hoisted(() => ({
  getRecommendationSettings: vi.fn(),
  updateRecommendationSettings: vi.fn(),
}));
vi.mock("@/server/services/settingsService", () => ({ settingsService: service }));

import { GET, PUT } from "../route";

const get = (query: string) =>
  GET(new NextRequest(`http://localhost/api/settings/recommendations${query}`));
const put = (body: string) =>
  PUT(new NextRequest("http://localhost/api/settings/recommendations", { method: "PUT", body }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/settings/recommendations", () => {
  it("returns the library's scope", async () => {
    service.getRecommendationSettings.mockResolvedValue({ friend_id: 4, scope: "library", isDefault: true });

    const res = await get("?friend_id=4");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ friend_id: 4, scope: "library", isDefault: true });
    expect(service.getRecommendationSettings).toHaveBeenCalledWith(4);
  });

  it.each(["", "?friend_id=abc"])("needs a numeric friend_id: %j", async (query) => {
    expect((await get(query)).status).toBe(400);
    expect(service.getRecommendationSettings).not.toHaveBeenCalled();
  });

  it("returns 500 when loading fails", async () => {
    service.getRecommendationSettings.mockRejectedValue(new Error("db down"));
    expect((await get("?friend_id=4")).status).toBe(500);
  });
});

describe("PUT /api/settings/recommendations", () => {
  it("saves the library's scope", async () => {
    service.updateRecommendationSettings.mockResolvedValue({ friend_id: 4, scope: "all", isDefault: false });

    const res = await put(JSON.stringify({ friend_id: 4, scope: "all" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ friend_id: 4, scope: "all", isDefault: false });
    expect(service.updateRecommendationSettings).toHaveBeenCalledWith(4, "all");
  });

  it.each([
    ["not JSON", "{"],
    ["an unknown scope", JSON.stringify({ friend_id: 4, scope: "everyone" })],
    ["no friend", JSON.stringify({ scope: "all" })],
  ])("returns 400 for %s", async (_label, body) => {
    expect((await put(body)).status).toBe(400);
    expect(service.updateRecommendationSettings).not.toHaveBeenCalled();
  });

  it("returns 404 for a library that doesn't exist", async () => {
    service.updateRecommendationSettings.mockRejectedValue(new Error("Library 99 does not exist"));
    const res = await put(JSON.stringify({ friend_id: 99, scope: "all" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Library 99 does not exist");
  });

  it("returns 500 for a failure that isn't an Error", async () => {
    service.updateRecommendationSettings.mockRejectedValue("db down");
    expect((await put(JSON.stringify({ friend_id: 4, scope: "all" }))).status).toBe(500);
  });

  it("returns 500 when saving fails", async () => {
    service.updateRecommendationSettings.mockRejectedValue(new Error("db down"));
    expect((await put(JSON.stringify({ friend_id: 4, scope: "all" }))).status).toBe(500);
  });
});

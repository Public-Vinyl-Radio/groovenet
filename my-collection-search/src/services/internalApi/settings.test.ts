import { beforeEach, describe, expect, it, vi } from "vitest";

const httpMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/http", () => ({ http: httpMock }));

import {
  fetchAppearanceSettings,
  fetchRecommendationSettings,
  updateAppearanceSettings,
  updateRecommendationSettings,
} from "./settings";

beforeEach(() => {
  httpMock.mockReset();
  httpMock.mockResolvedValue({ friend_id: 4, scope: "library", isDefault: true });
});

describe("recommendation settings", () => {
  it("reads a library's suggestion scope", async () => {
    await expect(fetchRecommendationSettings(4)).resolves.toEqual({ friend_id: 4, scope: "library", isDefault: true });
    expect(httpMock).toHaveBeenCalledWith("/api/settings/recommendations?friend_id=4", {
      method: "GET",
      cache: "no-store",
    });
  });

  it("saves a library's suggestion scope", async () => {
    await updateRecommendationSettings({ friend_id: 4, scope: "all" });
    expect(httpMock).toHaveBeenCalledWith("/api/settings/recommendations", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friend_id: 4, scope: "all" }),
    });
  });
});

describe("appearance settings", () => {
  it("reads the shared palette", async () => {
    httpMock.mockResolvedValue({ palette: "sleeve" });
    await expect(fetchAppearanceSettings()).resolves.toEqual({ palette: "sleeve" });
    expect(httpMock).toHaveBeenCalledWith("/api/settings/appearance", { method: "GET", cache: "no-store" });
  });

  it("saves a font change without the palette", async () => {
    await updateAppearanceSettings({ fonts: { body: "inter" } });
    expect(httpMock).toHaveBeenCalledWith("/api/settings/appearance", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fonts: { body: "inter" } }),
    });
  });

  it("saves the palette", async () => {
    await updateAppearanceSettings({ palette: "sleeve" });
    expect(httpMock).toHaveBeenCalledWith("/api/settings/appearance", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ palette: "sleeve" }),
    });
  });
});

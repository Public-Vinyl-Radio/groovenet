import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const service = vi.hoisted(() => ({
  getGamdlSettings: vi.fn(),
  updateGamdlSettings: vi.fn(),
}));
vi.mock("@/server/services/settingsService", () => ({ settingsService: service }));

import { GET, PUT } from "../route";

const settings = { id: 1, friend_id: 4, audio_quality: "best" };

const get = (query = "") => GET(new NextRequest(`http://localhost/api/settings/gamdl${query}`));
const put = (body: unknown) =>
  PUT(
    new NextRequest("http://localhost/api/settings/gamdl", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/settings/gamdl", () => {
  it("returns a friend's settings", async () => {
    service.getGamdlSettings.mockResolvedValue(settings);

    const res = await get("?friend_id=4");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ settings });
    expect(service.getGamdlSettings).toHaveBeenCalledWith(4);
  });

  it("requires friend_id", async () => {
    const res = await get();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "friend_id parameter is required" });
  });

  it("reports a failure with its details", async () => {
    service.getGamdlSettings.mockRejectedValue(new Error("db down"));
    const res = await get("?friend_id=4");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to get gamdl settings", details: "db down" });
  });
});

describe("PUT /api/settings/gamdl", () => {
  it("updates only the fields sent and drops unknown ones", async () => {
    service.updateGamdlSettings.mockResolvedValue(settings);

    const res = await put({ friend_id: "4", audio_quality: "high", max_retries: "5", junk: 1 });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      message: "Settings updated successfully",
      settings,
    });
    expect(service.updateGamdlSettings).toHaveBeenCalledWith(4, {
      audio_quality: "high",
      max_retries: 5,
    });
  });

  it("requires friend_id", async () => {
    const res = await put({ audio_quality: "high" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "friend_id is required" });
  });

  it("requires a numeric friend_id", async () => {
    const res = await put({ friend_id: "abc", audio_quality: "high" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "friend_id must be a number" });
  });

  it("requires something to update", async () => {
    const res = await put({ friend_id: 4 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No valid fields to update" });
  });

  it("answers 400 when the repository finds nothing to update", async () => {
    service.updateGamdlSettings.mockResolvedValue(null);
    const res = await put({ friend_id: 4, junk: 1 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No valid fields to update" });
  });

  it("rejects a value outside an enum before it reaches the database", async () => {
    const res = await put({ friend_id: 4, audio_quality: "ultra" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "Invalid gamdl settings" });
    expect(service.updateGamdlSettings).not.toHaveBeenCalled();
  });

  it("reports a failure with its details", async () => {
    service.updateGamdlSettings.mockRejectedValue(new Error("db down"));
    const res = await put({ friend_id: 4, audio_quality: "high" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Failed to update gamdl settings",
      details: "db down",
    });
  });
});

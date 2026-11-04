import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  resetGamdlSettings: vi.fn(),
  getCookieFileInfo: vi.fn(),
  deleteCookieFile: vi.fn(),
  testConnection: vi.fn(),
}));
vi.mock("@/server/services/settingsService", () => ({
  settingsService: { resetGamdlSettings: mocks.resetGamdlSettings },
}));
vi.mock("@/server/services/gamdlCookieService", () => ({
  gamdlCookieService: {
    getCookieFileInfo: mocks.getCookieFileInfo,
    deleteCookieFile: mocks.deleteCookieFile,
  },
}));
vi.mock("@/server/services/gamdlConnectionTestService", () => ({
  gamdlConnectionTestService: { testConnection: mocks.testConnection },
}));

import { POST } from "../route";

const post = (body: string) =>
  POST(new NextRequest("http://localhost/api/settings/gamdl/actions", { method: "POST", body }));
const action = (body: unknown) => post(JSON.stringify(body));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/settings/gamdl/actions", () => {
  it("reports the cookie file", async () => {
    mocks.getCookieFileInfo.mockResolvedValue({ exists: false });
    const res = await action({ action: "cookie_status" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ exists: false });
  });

  it("deletes the cookie file", async () => {
    const res = await action({ action: "delete_cookie" });
    expect(await res.json()).toEqual({
      success: true,
      message: "Cookie file deleted successfully",
    });
    expect(mocks.deleteCookieFile).toHaveBeenCalled();
  });

  it("tests the connection", async () => {
    const result = { success: true, message: "ok", details: {} };
    mocks.testConnection.mockResolvedValue(result);
    const res = await action({ action: "test_connection" });
    expect(await res.json()).toEqual(result);
  });

  it("resets a friend's settings", async () => {
    mocks.resetGamdlSettings.mockResolvedValue({ id: 1 });
    const res = await action({ action: "reset_settings", friend_id: 4 });
    expect(await res.json()).toEqual({
      success: true,
      message: "Settings reset to defaults",
      settings: { id: 1 },
    });
    expect(mocks.resetGamdlSettings).toHaveBeenCalledWith(4);
  });

  it("needs a friend_id to reset", async () => {
    const res = await action({ action: "reset_settings" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "friend_id must be a number" });
  });

  it.each(["{}", "not json"])("requires an action: %s", async (body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "action is required" });
  });

  it("rejects an unknown action", async () => {
    const res = await action({ action: "format_disk" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Unsupported action" });
  });

  it("answers 500 with connection-test details when an action throws", async () => {
    mocks.getCookieFileInfo.mockRejectedValue(new Error("disk gone"));
    const res = await action({ action: "cookie_status" });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      error: "Failed to execute action",
      message: "disk gone",
      details: { error_type: "action_error" },
    });
  });
});

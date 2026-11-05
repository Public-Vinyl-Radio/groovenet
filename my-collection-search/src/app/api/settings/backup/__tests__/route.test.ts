import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getPolicy: vi.fn(), updatePolicy: vi.fn() }));
vi.mock("@/server/services/backupPolicyService", () => ({
  backupPolicyService: { getPolicy: mocks.getPolicy, updatePolicy: mocks.updatePolicy },
}));

import { GET, PUT } from "../route";

const policy = {
  enabled: false,
  provider: "restic-b2" as const,
  schedule_cron: "0 */6 * * *",
  retention_preset: "balanced" as const,
  include_database: true,
  include_audio_files: true,
  include_album_covers: true,
  include_discogs_exports: true,
  include_essentia_files: true,
  include_uploads: false,
  updated_at: "2026-01-01T00:00:00.000Z",
};

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/settings/backup", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("PUT /api/settings/backup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPolicy.mockReturnValue(policy);
    mocks.updatePolicy.mockImplementation((patch) => ({ ...policy, ...patch }));
  });

  it("keeps the existing invalid-provider error response", async () => {
    const response = await PUT(request({ provider: "unknown" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Failed to update backup policy",
      message: "Invalid backup provider",
    });
    expect(mocks.updatePolicy).not.toHaveBeenCalled();
  });

  it.each([
    [{ retention_preset: "unknown" }, "Invalid retention preset"],
    [{ schedule_cron: "" }, "schedule_cron cannot be empty"],
    [{ enabled: "yes" }, "Invalid request body"],
  ])("returns the existing 400 envelope for invalid fields", async (body, message) => {
    const response = await PUT(request(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Failed to update backup policy", message });
  });

  it("validates known fields while preserving unknown policy fields", async () => {
    const response = await PUT(request({ enabled: true, future_option: "kept" }));
    expect(response.status).toBe(200);
    expect(mocks.updatePolicy).toHaveBeenCalledWith({ enabled: true, future_option: "kept" });
    expect(await response.json()).toMatchObject({
      success: true,
      policy: { future_option: "kept" },
    });
  });
});

describe("GET /api/settings/backup", () => {
  it("validates and returns the shared policy response", async () => {
    mocks.getPolicy.mockReturnValue({ ...policy, future_option: "kept" });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ policy: { ...policy, future_option: "kept" } });
  });
});

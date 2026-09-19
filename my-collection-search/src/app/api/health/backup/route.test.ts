import { beforeEach, describe, expect, it, vi } from "vitest";

const { getStatus } = vi.hoisted(() => ({ getStatus: vi.fn() }));

vi.mock("@/server/services/backupStatusService", () => ({
  backupStatusService: { getStatus },
}));

import { GET } from "./route";

beforeEach(() => {
  getStatus.mockReset();
});

describe("GET /api/health/backup", () => {
  it("returns 503 when no backup status has been recorded", async () => {
    getStatus.mockReturnValue(null);

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "unhealthy",
      reason: "no-backup-status",
    });
  });

  it("returns 200 for a recent successful backup", async () => {
    getStatus.mockReturnValue({
      started_at: new Date(Date.now() - 120_000).toISOString(),
      finished_at: new Date(Date.now() - 60_000).toISOString(),
      stored_at: new Date().toISOString(),
      status: "success",
      reason: "scheduled",
      backed_up_paths: ["/app/dumps"],
      snapshot: null,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok" });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runBackupNow: vi.fn(), getStatus: vi.fn() }));
vi.mock("@/server/services/backupRunnerService", () => ({
  runBackupNow: mocks.runBackupNow,
}));
vi.mock("@/server/services/backupStatusService", () => ({
  backupStatusService: { getStatus: mocks.getStatus },
}));

import { POST } from "./route";

const status = {
  started_at: "2026-01-01T00:00:00.000Z",
  finished_at: "2026-01-01T00:01:00.000Z",
  stored_at: "2026-01-01T00:01:00.000Z",
  status: "success" as const,
  reason: "completed",
  backed_up_paths: [],
  snapshot: null,
};

describe("POST /api/settings/backup/run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runBackupNow.mockResolvedValue(undefined);
    mocks.getStatus.mockReturnValue(status);
  });

  it("validates and returns the shared status response", async () => {
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status });
    expect(mocks.runBackupNow).toHaveBeenCalledWith("manual");
  });

  it("keeps the existing run failure response", async () => {
    mocks.runBackupNow.mockRejectedValue(new Error("runner unavailable"));
    const response = await POST();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to run backup manually" });
  });
});

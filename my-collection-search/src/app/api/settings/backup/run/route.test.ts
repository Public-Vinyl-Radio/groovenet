import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runAllBackups: vi.fn(),
  getStatus: vi.fn(),
  localConfigured: vi.fn(),
}));
vi.mock("@/server/services/backupRunnerService", () => ({
  runAllBackups: mocks.runAllBackups,
}));
vi.mock("@/server/services/backupTargets", () => ({
  localBackupConfigured: mocks.localConfigured,
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
    mocks.runAllBackups.mockResolvedValue({});
    mocks.localConfigured.mockReturnValue(false);
    mocks.getStatus.mockReturnValue(status);
  });

  it("validates and returns the shared status response", async () => {
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status });
    expect(mocks.runAllBackups).toHaveBeenCalledWith("manual");
  });

  it("includes the local disk's status when one is configured", async () => {
    mocks.localConfigured.mockReturnValue(true);
    mocks.getStatus.mockImplementation((target: string) =>
      target === "local" ? { ...status, status: "failed", error: "no marker" } : status,
    );
    const body = await (await POST()).json();
    expect(body.status.status).toBe("success");
    expect(body.local.status).toMatchObject({ status: "failed", error: "no marker" });
  });

  it("keeps the existing run failure response", async () => {
    mocks.runAllBackups.mockRejectedValue(new Error("runner unavailable"));
    const response = await POST();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to run backup manually" });
  });
});

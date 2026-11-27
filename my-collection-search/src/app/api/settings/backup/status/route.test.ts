import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  getBackupMetrics: vi.fn(),
  getPolicy: vi.fn(),
  localConfigured: vi.fn(),
}));
vi.mock("@/server/services/backupStatusService", () => ({
  backupStatusService: { getStatus: mocks.getStatus },
}));
vi.mock("@/server/services/backupMetricsService", () => ({
  getBackupMetrics: mocks.getBackupMetrics,
}));
vi.mock("@/server/services/backupPolicyService", () => ({
  backupPolicyService: { getPolicy: mocks.getPolicy },
}));
vi.mock("@/server/services/backupTargets", () => ({
  localBackupConfigured: mocks.localConfigured,
}));

import { GET } from "./route";

const metrics = {
  captured_at: "2026-01-01T00:01:00.000Z",
  local_source_bytes: 0,
  snapshot_count: null,
  remote_repository_bytes: null,
  recent_snapshots: [],
};
const recent = () => ({
  started_at: new Date(Date.now() - 120_000).toISOString(),
  finished_at: new Date(Date.now() - 60_000).toISOString(),
  stored_at: new Date().toISOString(),
  status: "success" as const,
  reason: "manual",
  backed_up_paths: [],
  snapshot: null,
});

describe("GET /api/settings/backup/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStatus.mockReturnValue(null);
    mocks.getBackupMetrics.mockResolvedValue(metrics);
    mocks.getPolicy.mockReturnValue({ remote: { enabled: true }, local: { enabled: true } });
    mocks.localConfigured.mockReturnValue(false);
  });

  it("returns the remote's status, metrics and health, and no local block without a disk", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      status: null,
      metrics,
      health: { healthy: false, status: "unhealthy", reason: "no-backup-status" },
      max_age_hours: 12,
    });
    expect(body).not.toHaveProperty("local");
    expect(mocks.getBackupMetrics).toHaveBeenCalledTimes(1);
  });

  it("adds the local disk's status, metrics and own health when one is configured", async () => {
    mocks.localConfigured.mockReturnValue(true);
    mocks.getStatus.mockImplementation((target: string) =>
      target === "local"
        ? { ...recent(), status: "failed", reason: "mount-marker-missing", error: "no marker" }
        : recent(),
    );
    const body = await (await GET()).json();
    expect(body.health).toMatchObject({ healthy: true, status: "ok" });
    expect(body.local.health).toMatchObject({
      healthy: false,
      reason: "backup-failed",
    });
    expect(body.local.status.error).toBe("no marker");
    expect(mocks.getBackupMetrics).toHaveBeenCalledWith("local");
  });

  it("reports a switched-off target as disabled rather than unhealthy", async () => {
    mocks.localConfigured.mockReturnValue(true);
    mocks.getPolicy.mockReturnValue({ remote: { enabled: false }, local: { enabled: false } });
    const body = await (await GET()).json();
    expect(body.health).toMatchObject({ healthy: true, status: "disabled" });
    expect(body.local.health).toMatchObject({ healthy: true, status: "disabled" });
  });

  it("keeps the existing status failure response", async () => {
    mocks.getBackupMetrics.mockRejectedValue(new Error("metrics unavailable"));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to get backup status" });
  });
});

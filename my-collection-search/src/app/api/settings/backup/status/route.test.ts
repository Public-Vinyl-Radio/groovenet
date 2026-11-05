import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getStatus: vi.fn(), getBackupMetrics: vi.fn() }));
vi.mock("@/server/services/backupStatusService", () => ({
  backupStatusService: { getStatus: mocks.getStatus },
}));
vi.mock("@/server/services/backupMetricsService", () => ({
  getBackupMetrics: mocks.getBackupMetrics,
}));

import { GET } from "./route";

const metrics = {
  captured_at: "2026-01-01T00:01:00.000Z",
  local_source_bytes: 0,
  snapshot_count: null,
  remote_repository_bytes: null,
  recent_snapshots: [],
};

describe("GET /api/settings/backup/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStatus.mockReturnValue(null);
    mocks.getBackupMetrics.mockResolvedValue(metrics);
  });

  it("validates and returns the shared status and metrics", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: null, metrics });
  });

  it("keeps the existing status failure response", async () => {
    mocks.getBackupMetrics.mockRejectedValue(new Error("metrics unavailable"));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to get backup status" });
  });
});

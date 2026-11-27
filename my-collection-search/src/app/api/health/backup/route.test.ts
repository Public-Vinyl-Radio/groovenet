import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  getPolicy: vi.fn(),
  localConfigured: vi.fn(),
}));

vi.mock("@/server/services/backupStatusService", () => ({
  backupStatusService: { getStatus: mocks.getStatus },
}));
vi.mock("@/server/services/backupPolicyService", () => ({
  backupPolicyService: { getPolicy: mocks.getPolicy },
}));
vi.mock("@/server/services/backupTargets", () => ({
  localBackupConfigured: mocks.localConfigured,
}));

import { GET } from "./route";

const success = (agoMs = 60_000) => ({
  started_at: new Date(Date.now() - agoMs - 60_000).toISOString(),
  finished_at: new Date(Date.now() - agoMs).toISOString(),
  stored_at: new Date().toISOString(),
  status: "success" as const,
  reason: "scheduled",
  backed_up_paths: ["/app/dumps"],
  snapshot: null,
});
const statuses = (remote: unknown, local: unknown = null) =>
  mocks.getStatus.mockImplementation((target: string) => (target === "local" ? local : remote));

beforeEach(() => {
  mocks.getStatus.mockReset();
  mocks.getPolicy.mockReturnValue({ remote: { enabled: true }, local: { enabled: true } });
  mocks.localConfigured.mockReturnValue(false);
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/health/backup", () => {
  it("returns 503 when no backup status has been recorded", async () => {
    statuses(null);
    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "unhealthy",
      reason: "no-backup-status",
    });
  });

  it("returns 200 for a recent successful backup, with no local block", async () => {
    statuses(success());
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ status: "ok" });
    expect(body).not.toHaveProperty("local");
  });

  it("is healthy when both targets are recent", async () => {
    mocks.localConfigured.mockReturnValue(true);
    statuses(success(), success());
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).local).toMatchObject({ healthy: true, status: "ok" });
  });

  it("is unhealthy when only the local disk failed, and says why", async () => {
    mocks.localConfigured.mockReturnValue(true);
    statuses(success(), {
      ...success(),
      status: "failed",
      reason: "mount-marker-missing",
      error: "Marker file is missing",
    });
    const response = await GET();

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({ healthy: false, status: "unhealthy" });
    expect(body.local).toMatchObject({
      healthy: false,
      reason: "backup-failed",
      error: "Marker file is missing",
    });
  });

  it("measures the local disk against the same max age", async () => {
    mocks.localConfigured.mockReturnValue(true);
    statuses(success(), success(13 * 3_600_000));
    const response = await GET();
    expect(response.status).toBe(503);
    expect((await response.json()).local).toMatchObject({ reason: "backup-overdue" });
  });

  it("ignores a local disk that is not configured, even with a stale local status file", async () => {
    statuses(success(), { ...success(), status: "failed", reason: "x" });
    expect((await GET()).status).toBe(200);
  });

  it("treats switched-off targets as disabled", async () => {
    mocks.localConfigured.mockReturnValue(true);
    mocks.getPolicy.mockReturnValue({ remote: { enabled: false }, local: { enabled: false } });
    statuses(null, null);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "disabled",
      local: { status: "disabled" },
    });
  });

  it("returns 503 when the policy cannot be read", async () => {
    mocks.getPolicy.mockImplementation(() => {
      throw new Error("bad policy");
    });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ reason: "status-unavailable" });
  });
});

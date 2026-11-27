import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let tmpDir: string;
let service: any;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-status-test-"));
  process.env.BACKUP_STATUS_DIR = path.join(tmpDir, "dumps");
  vi.resetModules();
  const { BackupStatusService } = await import("../backupStatusService");
  service = new BackupStatusService();
});

afterEach(() => {
  delete process.env.BACKUP_STATUS_DIR;
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const statusPath = () => path.join(tmpDir, "dumps", "backup-status.json");

describe("BackupStatusService.getStatus()", () => {
  it("returns null when no status file exists", () => {
    expect(service.getStatus()).toBeNull();
  });
});

describe("BackupStatusService.writeStatus()", () => {
  it("persists and rereads the latest backup status", () => {
    const written = service.writeStatus({
      started_at: "2026-01-01T00:00:00.000Z",
      finished_at: "2026-01-01T00:01:00.000Z",
      status: "success",
      reason: "manual",
      backed_up_paths: ["/app/dumps", "/app/audio"],
      snapshot: {
        id: "abc123",
        short_id: "abc123",
        time: "2026-01-01T00:01:00.000Z",
        hostname: "groovenet",
        paths: ["/app/dumps"],
        tags: ["groovenet-manual"],
      },
    });

    expect(fs.existsSync(statusPath())).toBe(true);
    expect(written.stored_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const reread = service.getStatus();
    expect(reread).not.toBeNull();
    expect(reread?.status).toBe("success");
    expect(reread?.snapshot?.id).toBe("abc123");
    expect(reread?.backed_up_paths).toEqual(["/app/dumps", "/app/audio"]);
  });
});

describe("per-target status files", () => {
  const base = {
    started_at: "2026-01-01T00:00:00.000Z",
    finished_at: "2026-01-01T00:01:00.000Z",
    status: "failed" as const,
    reason: "mount-marker-missing",
    backed_up_paths: [],
    snapshot: null,
  };

  it("keeps the local target apart from the remote's file", () => {
    service.writeStatus({ ...base, status: "success", reason: "manual" });
    service.writeStatus(base, "local");

    expect(fs.existsSync(statusPath())).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "dumps", "backup-status-local.json"))).toBe(true);
    expect(service.getStatus("remote")?.status).toBe("success");
    expect(service.getStatus("local")?.reason).toBe("mount-marker-missing");
  });

  it("has no local status until one is written", () => {
    service.writeStatus({ ...base, status: "success", reason: "manual" });
    expect(service.getStatus("local")).toBeNull();
  });
});

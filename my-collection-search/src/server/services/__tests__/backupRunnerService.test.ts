import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecFile, mockCreateBackup, mockGetPolicy, mockWriteStatus } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockCreateBackup: vi.fn(),
  mockGetPolicy: vi.fn(),
  mockWriteStatus: vi.fn(),
}));

vi.mock("node:child_process", () => ({ execFile: mockExecFile }));
vi.mock("@/server/services/databaseBackupService", () => ({ createBackup: mockCreateBackup }));
vi.mock("@/server/services/backupPolicyService", () => ({
  backupPolicyService: { getPolicy: mockGetPolicy },
}));
vi.mock("@/server/services/backupStatusService", () => ({
  backupStatusService: { writeStatus: mockWriteStatus },
}));

import { runBackupNow } from "../backupRunnerService";

let tmpDir: string;

const policy = {
  enabled: true,
  schedule_cron: "0 3 * * *",
  retention_preset: "balanced",
  include_database: true,
  include_audio_files: false,
  include_album_covers: false,
  include_discogs_exports: false,
  include_essentia_files: false,
  include_uploads: false,
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-runner-test-"));
  vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  vi.stubEnv("BACKUP_STATUS_DIR", path.join(tmpDir, "status"));
  vi.stubEnv("RESTIC_REPOSITORY", "/repo");
  vi.stubEnv("RESTIC_PASSWORD", "pw");
  mockGetPolicy.mockReset().mockReturnValue(policy);
  mockWriteStatus.mockReset();
  mockExecFile.mockReset().mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb: (e: Error | null, r?: unknown) => void) =>
      cb(null, { stdout: "[]", stderr: "" })
  );
  mockCreateBackup.mockReset().mockImplementation(async () => {
    const dir = path.join(tmpDir, "dumps");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "pg-backup-restic-x.dump");
    fs.writeFileSync(file, "dump");
    return { filename: path.basename(file), path: file };
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("runBackupNow() database dump", () => {
  it("dumps into the snapshotted directory, then removes the dump", async () => {
    const result = await runBackupNow("manual");

    expect(result.status).toBe("success");
    expect(mockCreateBackup).toHaveBeenCalledWith({ prefix: "pg-backup-restic" });
    const backupCall = mockExecFile.mock.calls.find(([, args]) => args[0] === "backup");
    expect(backupCall?.[1]).toContain(path.join(tmpDir, "dumps"));
    expect(fs.existsSync(path.join(tmpDir, "dumps", "pg-backup-restic-x.dump"))).toBe(false);
  });

  it("removes the dump when restic fails", async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: (e: Error | null) => void) =>
        cb(new Error("restic: repository locked"))
    );
    const result = await runBackupNow("manual");

    expect(result.status).toBe("failed");
    expect(result.error).toContain("repository locked");
    expect(fs.existsSync(path.join(tmpDir, "dumps", "pg-backup-restic-x.dump"))).toBe(false);
  });

  it("records a failed dump", async () => {
    mockCreateBackup.mockRejectedValue(new Error("pg_dump exited with code 1: timeout"));
    const result = await runBackupNow("manual");

    expect(result.status).toBe("failed");
    expect(result.error).toBe("pg_dump exited with code 1: timeout");
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("skips the dump when the policy excludes the database", async () => {
    mockGetPolicy.mockReturnValue({ ...policy, include_database: false });
    const result = await runBackupNow("manual");

    expect(mockCreateBackup).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "skipped", reason: "no-paths-selected" });
  });
});

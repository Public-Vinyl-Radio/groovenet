import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecFile, mockCreateBackup, mockGetPolicy, mockWriteStatus, mockMount, mockFormats } =
  vi.hoisted(() => ({
    mockMount: vi.fn(),
    mockFormats: vi.fn(),
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

vi.mock("@/server/repositories/trackAudioFileRepository", () => ({
  trackAudioFileRepository: { listAudioFormats: mockFormats },
}));
vi.mock("@/server/services/backupTargets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../backupTargets")>()),
  checkLocalBackupMount: mockMount,
}));

import { runAllBackups, runBackupNow, startBackupScheduler } from "../backupRunnerService";

let tmpDir: string;

const target = (over: Record<string, boolean> = {}) => ({
  enabled: true,
  include_database: true,
  include_album_covers: false,
  include_aac_audio: false,
  include_lossless_audio: false,
  ...over,
});
const policy = {
  enabled: true,
  schedule_cron: "0 3 * * *",
  retention_preset: "balanced",
  include_discogs_exports: false,
  include_essentia_files: false,
  include_uploads: false,
  remote: target(),
  local: target({ include_database: false, include_lossless_audio: true }),
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-runner-test-"));
  vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  vi.stubEnv("BACKUP_STATUS_DIR", path.join(tmpDir, "status"));
  vi.stubEnv("RESTIC_REPOSITORY", "/repo");
  vi.stubEnv("RESTIC_PASSWORD", "pw");
  mockGetPolicy.mockReset().mockReturnValue(policy);
  mockMount.mockReset().mockReturnValue({ ok: true });
  mockFormats.mockReset().mockResolvedValue([]);
  mockWriteStatus.mockReset();
  mockExecFile
    .mockReset()
    .mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: (e: Error | null, r?: unknown) => void) =>
        cb(null, { stdout: "[]", stderr: "" }),
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
        cb(new Error("restic: repository locked")),
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
    mockGetPolicy.mockReturnValue({ ...policy, remote: target({ include_database: false }) });
    const result = await runBackupNow("manual");

    expect(mockCreateBackup).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "skipped", reason: "no-paths-selected" });
  });
});

function audioDir(files: string[]): string {
  const dir = path.join(tmpDir, "audio");
  fs.mkdirSync(dir, { recursive: true });
  for (const name of files) fs.writeFileSync(path.join(dir, name), "x");
  return dir;
}

const backupCall = () => mockExecFile.mock.calls.find(([, args]) => args[0] === "backup");
describe("runBackupNow() audio selection by format", () => {
  const files = ["a.m4a", "alac.m4a", "b.flac", "c.wav", "d.mp3"];
  // alac.m4a is lossless although its extension says otherwise; only tracking knows.
  beforeEach(() => {
    audioDir(files);
    mockFormats.mockResolvedValue([
      { filename: "alac.m4a", lossless: true },
      { filename: "a.m4a", lossless: false },
      { filename: "/app/audio/b.flac", lossless: true },
    ]);
  });
  let excludeFileSeen: string | undefined;
  beforeEach(() => {
    excludeFileSeen = undefined;
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        args: string[],
        _opts: unknown,
        cb: (e: Error | null, r?: unknown) => void,
      ) => {
        const at = args.indexOf("--exclude-file");
        if (at !== -1) excludeFileSeen = fs.readFileSync(args[at + 1], "utf8");
        cb(null, { stdout: "[]", stderr: "" });
      },
    );
  });

  it("remote default: AAC in, lossless excluded, using tracking before extensions", async () => {
    mockGetPolicy.mockReturnValue({
      ...policy,
      remote: target({ include_database: false, include_aac_audio: true }),
    });
    const result = await runBackupNow("manual");

    expect(result.status).toBe("success");
    const lines = (excludeFileSeen ?? "").trim().split("\n").sort();
    expect(lines).toEqual(
      ["alac.m4a", "b.flac", "c.wav"].map((n) => path.join(tmpDir, "audio", n)).sort(),
    );
    expect(backupCall()?.[1]).toContain(path.join(tmpDir, "audio"));
    // The exclude file is cleaned up after the run.
    const args: string[] = backupCall()?.[1];
    expect(fs.existsSync(args[args.indexOf("--exclude-file") + 1])).toBe(false);
  });

  it("lossless-only excludes AAC, and an unprobed file falls back to its extension", async () => {
    mockGetPolicy.mockReturnValue({
      ...policy,
      remote: target({ include_database: false, include_lossless_audio: true }),
    });
    await runBackupNow("manual");
    const lines = (excludeFileSeen ?? "").trim().split("\n").sort();
    expect(lines).toEqual(["a.m4a", "d.mp3"].map((n) => path.join(tmpDir, "audio", n)).sort());
  });

  it("takes the whole directory with no excludes when both classes are included", async () => {
    mockGetPolicy.mockReturnValue({
      ...policy,
      remote: target({
        include_database: false,
        include_aac_audio: true,
        include_lossless_audio: true,
      }),
    });
    await runBackupNow("manual");
    expect(excludeFileSeen).toBeUndefined();
    expect(backupCall()?.[1]).toContain(path.join(tmpDir, "audio"));
  });

  it("takes no audio path when neither class is included", async () => {
    mockGetPolicy.mockReturnValue({ ...policy, remote: target({ include_database: false }) });
    const result = await runBackupNow("manual");
    expect(result.reason).toBe("no-paths-selected");
    expect(backupCall()).toBeUndefined();
  });

  it("escapes glob characters in excluded paths", async () => {
    audioDir(["we[ird]*.flac"]);
    mockGetPolicy.mockReturnValue({
      ...policy,
      remote: target({ include_database: false, include_aac_audio: true }),
    });
    await runBackupNow("manual");
    expect(excludeFileSeen).toContain("we\\[ird]\\*.flac");
  });
});

describe("local target", () => {
  const localOnly = () => ({
    ...policy,
    local: target({ include_database: false, include_lossless_audio: true }),
  });
  beforeEach(() => {
    audioDir(["a.m4a", "b.flac"]);
    mockFormats.mockResolvedValue([
      { filename: "a.m4a", lossless: false },
      { filename: "b.flac", lossless: true },
    ]);
    vi.stubEnv("LOCAL_BACKUP_DIR", path.join(tmpDir, "disk"));
    vi.stubEnv("LOCAL_BACKUP_RESTIC_PASSWORD", "local-pw");
    mockGetPolicy.mockReturnValue(localOnly());
  });

  it("snapshots lossless into its own repository with its own password", async () => {
    let excludes = "";
    mockExecFile.mockImplementation(
      (_c: string, args: string[], _o: unknown, cb: (e: Error | null, r?: unknown) => void) => {
        const at = args.indexOf("--exclude-file");
        if (at !== -1) excludes = fs.readFileSync(args[at + 1], "utf8").trim();
        cb(null, { stdout: "[]", stderr: "" });
      },
    );
    const result = await runBackupNow("manual", "local");

    expect(result).toMatchObject({ status: "success", target: "local" });
    const [, , opts] = backupCall() as [string, string[], { env: Record<string, string> }];
    expect(opts.env.RESTIC_REPOSITORY).toBe(path.join(tmpDir, "disk", "groovenet-restic"));
    expect(opts.env.RESTIC_PASSWORD).toBe("local-pw");
    // restic init runs first on an empty disk; AAC is excluded.
    expect(mockExecFile.mock.calls[0][1][0]).toBe("init");
    expect(excludes).toBe(path.join(tmpDir, "audio", "a.m4a"));
    expect(mockWriteStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: "success" }),
      "local",
    );
  });

  it("does not init a repository that already exists", async () => {
    const repo = path.join(tmpDir, "disk", "groovenet-restic");
    fs.mkdirSync(repo, { recursive: true });
    fs.writeFileSync(path.join(repo, "config"), "x");
    await runBackupNow("manual", "local");
    expect(mockExecFile.mock.calls.some(([, args]) => args[0] === "init")).toBe(false);
  });

  it.each([
    ["path-missing", "does not exist"],
    ["marker-missing", "marker"],
    ["same-device", "root disk"],
  ])("fails loudly and runs nothing when the mount check says %s", async (reason, message) => {
    mockMount.mockReturnValue({ ok: false, reason, message: `disk ${message}` });
    mockGetPolicy.mockReturnValue({
      ...localOnly(),
      local: target({ include_database: true, include_lossless_audio: true }),
    });

    const result = await runBackupNow("manual", "local");

    expect(result).toMatchObject({ status: "failed", reason: `mount-${reason}` });
    expect(result.error).toContain(message);
    // Nothing is written: no dump, no restic, not even init.
    expect(mockCreateBackup).not.toHaveBeenCalled();
    expect(mockExecFile).not.toHaveBeenCalled();
    expect(mockWriteStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", reason: `mount-${reason}` }),
      "local",
    );
  });

  it("fails when the local repository password is not set", async () => {
    vi.stubEnv("LOCAL_BACKUP_RESTIC_PASSWORD", "");
    const result = await runBackupNow("manual", "local");
    expect(result).toMatchObject({ status: "failed", reason: "missing-env" });
    expect(result.missingEnv).toEqual(["LOCAL_BACKUP_RESTIC_PASSWORD"]);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("records a restic error", async () => {
    mockExecFile.mockImplementation(
      (_c: string, args: string[], _o: unknown, cb: (e: Error | null, r?: unknown) => void) =>
        args[0] === "backup"
          ? cb(new Error("restic: disk full"))
          : cb(null, { stdout: "[]", stderr: "" }),
    );
    const result = await runBackupNow("manual", "local");
    expect(result).toMatchObject({ status: "failed" });
    expect(result.error).toContain("disk full");
  });

  it("is skipped without recording when the host has no local disk", async () => {
    vi.stubEnv("LOCAL_BACKUP_DIR", "");
    const result = await runBackupNow("manual", "local");
    expect(result).toMatchObject({ status: "skipped", reason: "not-configured" });
    expect(mockWriteStatus).not.toHaveBeenCalled();
  });

  it("is skipped without recording when the target is switched off", async () => {
    mockGetPolicy.mockReturnValue({ ...localOnly(), local: target({ enabled: false }) });
    const result = await runBackupNow("manual", "local");
    expect(result).toMatchObject({ status: "skipped", reason: "target-disabled" });
    expect(mockMount).not.toHaveBeenCalled();
    expect(mockWriteStatus).not.toHaveBeenCalled();
  });
});

describe("runAllBackups()", () => {
  it("runs only the remote when no local disk is configured", async () => {
    vi.stubEnv("LOCAL_BACKUP_DIR", "");
    const results = await runAllBackups("manual");
    expect(Object.keys(results)).toEqual(["remote"]);
  });

  it("runs the local disk first, and a local failure does not stop the remote", async () => {
    vi.stubEnv("LOCAL_BACKUP_DIR", path.join(tmpDir, "disk"));
    vi.stubEnv("LOCAL_BACKUP_RESTIC_PASSWORD", "pw");
    mockMount.mockReturnValue({ ok: false, reason: "marker-missing", message: "no marker" });

    const results = await runAllBackups("scheduled");

    expect(results.local?.status).toBe("failed");
    expect(results.remote?.status).toBe("success");
  });

  it("skips scheduled runs while the policy is disabled", async () => {
    vi.stubEnv("LOCAL_BACKUP_DIR", "");
    mockGetPolicy.mockReturnValue({ ...policy, enabled: false });
    const results = await runAllBackups("scheduled");
    expect(results.remote?.reason).toBe("policy-disabled");
  });
});

describe("runBackupNow() concurrency", () => {
  it("skips while another run is in this process", async () => {
    const g = globalThis as Record<string, unknown>;
    g.__groovenetBackupRunning = true;
    try {
      expect(await runBackupNow("manual")).toMatchObject({
        status: "skipped",
        reason: "backup-already-running",
      });
    } finally {
      g.__groovenetBackupRunning = false;
    }
  });

  it("skips while another process holds the run lock", async () => {
    const status = path.join(tmpDir, "status");
    fs.mkdirSync(status, { recursive: true });
    fs.writeFileSync(path.join(status, ".backup-run.lock"), "{}");
    expect(await runBackupNow("manual")).toMatchObject({
      status: "skipped",
      reason: "backup-already-running",
    });
    expect(mockExecFile).not.toHaveBeenCalled();
  });
});

describe("startBackupScheduler()", () => {
  const g = globalThis as Record<string, unknown>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-27T03:00:30Z"));
    delete g.__groovenetBackupSchedulerStarted;
    delete g.__groovenetBackupSchedulerLastMinute;
    vi.stubEnv("LOCAL_BACKUP_DIR", "");
  });
  afterEach(() => {
    vi.useRealTimers();
    delete g.__groovenetBackupSchedulerStarted;
    delete g.__groovenetBackupSchedulerLastMinute;
  });

  it("runs each target on its cron minute, logs the outcome, and starts only once", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    startBackupScheduler();
    startBackupScheduler();
    await vi.waitFor(() =>
      expect(log).toHaveBeenCalledWith(
        "[backup-scheduler] remote backup succeeded at",
        expect.any(String),
      ),
    );
    expect(log).toHaveBeenCalledWith("[backup-scheduler] started");
    expect(log.mock.calls.filter(([m]) => m === "[backup-scheduler] started")).toHaveLength(1);
  });

  it("logs a failed target", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubEnv("RESTIC_PASSWORD", "");
    startBackupScheduler();
    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        "[backup-scheduler] remote backup failed:",
        expect.stringContaining("RESTIC_PASSWORD"),
      ),
    );
  });

  it("does nothing off the cron minute, while disabled, or twice in one minute", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    mockGetPolicy.mockReturnValue({ ...policy, schedule_cron: "5 3 * * *" });
    startBackupScheduler();
    await vi.advanceTimersByTimeAsync(1);
    expect(mockExecFile).not.toHaveBeenCalled();

    mockGetPolicy.mockReturnValue({ ...policy, enabled: false, schedule_cron: "* * * * *" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("runs the local disk first when one is configured", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubEnv("LOCAL_BACKUP_DIR", path.join(tmpDir, "disk"));
    vi.stubEnv("LOCAL_BACKUP_RESTIC_PASSWORD", "pw");
    mockGetPolicy.mockReturnValue({ ...policy, schedule_cron: "* * * * *" });
    startBackupScheduler();
    await vi.waitFor(() => expect(mockWriteStatus).toHaveBeenCalledTimes(2));
    expect(mockWriteStatus.mock.calls.map(([, target]) => target)).toEqual(["local", "remote"]);
  });
});

describe("remote-only extras and the recorded snapshot", () => {
  it("includes covers and the remote extras for the remote only", async () => {
    for (const dir of [
      "public/uploads/album-covers",
      "discogs_exports",
      "essentia-data",
      "uploads",
    ]) {
      fs.mkdirSync(path.join(tmpDir, dir), { recursive: true });
    }
    const all = {
      include_discogs_exports: true,
      include_essentia_files: true,
      include_uploads: true,
    };
    vi.stubEnv("LOCAL_BACKUP_DIR", path.join(tmpDir, "disk"));
    vi.stubEnv("LOCAL_BACKUP_RESTIC_PASSWORD", "pw");
    mockGetPolicy.mockReturnValue({
      ...policy,
      ...all,
      remote: target({ include_database: false, include_album_covers: true }),
      local: target({ include_database: false, include_album_covers: true }),
    });

    await runBackupNow("manual", "remote");
    const remotePaths: string[] = backupCall()?.[1] ?? [];
    for (const dir of [
      "public/uploads/album-covers",
      "discogs_exports",
      "essentia-data",
      "uploads",
    ]) {
      expect(remotePaths).toContain(path.join(tmpDir, dir));
    }

    mockExecFile.mockClear();
    await runBackupNow("manual", "local");
    const localPaths: string[] = backupCall()?.[1] ?? [];
    expect(localPaths).toContain(path.join(tmpDir, "public/uploads/album-covers"));
    expect(localPaths).not.toContain(path.join(tmpDir, "uploads"));
    expect(localPaths).not.toContain(path.join(tmpDir, "discogs_exports"));
  });

  it("records the newest snapshot and survives a failing status write", async () => {
    mockExecFile.mockImplementation(
      (_c: string, args: string[], _o: unknown, cb: (e: Error | null, r?: unknown) => void) =>
        cb(null, {
          stdout:
            args[0] === "snapshots"
              ? JSON.stringify([
                  { id: "old", time: "2026-01-01T00:00:00Z" },
                  {
                    id: "new",
                    short_id: "nw",
                    time: "2026-02-01T00:00:00Z",
                    paths: ["/a"],
                    tags: ["t"],
                  },
                  { id: 5 },
                ])
              : "[]",
          stderr: "",
        }),
    );
    mockWriteStatus.mockImplementation(() => {
      throw new Error("disk full");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runBackupNow("manual");

    expect(result.snapshot).toMatchObject({ id: "new", short_id: "nw", tags: ["t"] });
    expect(error).toHaveBeenCalledWith(
      "[backup-status] failed to persist backup status:",
      expect.any(Error),
    );
  });
});

describe("remaining runner branches", () => {
  it("skips a selected directory that does not exist", async () => {
    mockGetPolicy.mockReturnValue({
      ...policy,
      remote: target({ include_database: false, include_album_covers: true }),
    });
    expect((await runBackupNow("manual")).reason).toBe("no-paths-selected");
  });

  it("dumps under a local prefix for the local target", async () => {
    vi.stubEnv("LOCAL_BACKUP_DIR", path.join(tmpDir, "disk"));
    vi.stubEnv("LOCAL_BACKUP_RESTIC_PASSWORD", "pw");
    mockGetPolicy.mockReturnValue({ ...policy, local: target() });
    await runBackupNow("manual", "local");
    expect(mockCreateBackup).toHaveBeenCalledWith({ prefix: "pg-backup-restic-local" });
  });

  it("copes with restic printing nothing", async () => {
    mockExecFile.mockImplementation(
      (_c: string, _a: string[], _o: unknown, cb: (e: Error | null, r?: unknown) => void) =>
        cb(null, {}),
    );
    expect(await runBackupNow("manual")).toMatchObject({ status: "success", snapshot: null });
  });

  it("reports a thrown non-Error", async () => {
    mockCreateBackup.mockRejectedValue("plain string");
    expect((await runBackupNow("manual")).error).toBe("plain string");
  });

  it("does not tick twice in the same minute", async () => {
    const g = globalThis as Record<string, unknown>;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-27T03:00:30Z"));
    vi.stubEnv("LOCAL_BACKUP_DIR", "");
    vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      delete g.__groovenetBackupSchedulerStarted;
      delete g.__groovenetBackupSchedulerLastMinute;
      startBackupScheduler();
      await vi.waitFor(() => expect(mockExecFile).toHaveBeenCalled());
      const calls = mockExecFile.mock.calls.length;
      delete g.__groovenetBackupSchedulerStarted;
      startBackupScheduler();
      await vi.advanceTimersByTimeAsync(1);
      expect(mockExecFile.mock.calls.length).toBe(calls);
    } finally {
      vi.useRealTimers();
      delete g.__groovenetBackupSchedulerStarted;
      delete g.__groovenetBackupSchedulerLastMinute;
    }
  });
});

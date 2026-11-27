import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BackupPolicy } from "@/types/backup";

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  execFile: vi.fn(),
  execFileAsync: vi.fn(),
  getPolicy: vi.fn(),
  mount: vi.fn(),
  formats: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: mocks.existsSync,
    readdirSync: mocks.readdirSync,
    statSync: mocks.statSync,
  },
}));
vi.mock("node:child_process", () => {
  Object.defineProperty(mocks.execFile, Symbol.for("nodejs.util.promisify.custom"), {
    value: mocks.execFileAsync,
  });
  return { execFile: mocks.execFile };
});
vi.mock("@/server/services/backupPolicyService", () => ({
  backupPolicyService: { getPolicy: mocks.getPolicy },
}));

vi.mock("@/server/repositories/trackAudioFileRepository", () => ({
  trackAudioFileRepository: { listAudioFormats: mocks.formats },
}));
vi.mock("@/server/services/backupTargets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../backupTargets")>()),
  checkLocalBackupMount: mocks.mount,
}));

import { getBackupMetrics, parseSnapshots } from "../backupMetricsService";

const policy: BackupPolicy = {
  enabled: true,
  provider: "restic-b2",
  schedule_cron: "0 */6 * * *",
  retention_preset: "balanced",
  include_discogs_exports: false,
  include_essentia_files: false,
  include_uploads: false,
  remote: {
    enabled: true,
    include_database: true,
    include_album_covers: false,
    include_aac_audio: false,
    include_lossless_audio: false,
  },
  local: {
    enabled: true,
    include_database: false,
    include_album_covers: false,
    include_aac_audio: false,
    include_lossless_audio: true,
  },
  updated_at: "2026-01-01T00:00:00Z",
};

let clock = Date.parse("2026-10-01T00:00:00Z");
beforeEach(() => {
  vi.resetAllMocks();
  // The metrics cache lasts a minute; step past it so each test measures afresh.
  clock += 120_000;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(clock);
  mocks.mount.mockReturnValue({ ok: true });
  mocks.formats.mockResolvedValue([]);
  vi.stubEnv("LOCAL_BACKUP_DIR", "/app/local-backup");
  vi.stubEnv("LOCAL_BACKUP_RESTIC_PASSWORD", "local-pw");
  mocks.getPolicy.mockReturnValue(policy);
  mocks.existsSync.mockReturnValue(true);
  mocks.readdirSync.mockReturnValue([]);
  mocks.execFileAsync.mockImplementation((_command: string, args: string[]) => {
    const stdout =
      args[0] === "snapshots"
        ? JSON.stringify([{ id: "snapshot", time: "2026-09-20T12:00:00Z" }])
        : JSON.stringify({ total_size: 1234 });
    return Promise.resolve({ stdout, stderr: "" });
  });
});

describe("parseSnapshots", () => {
  it("sorts valid Restic snapshots newest first and discards malformed entries", () => {
    const snapshots = parseSnapshots(
      JSON.stringify([
        {
          id: "older",
          time: "2026-09-17T00:00:00Z",
          hostname: "host",
          paths: ["/app/audio"],
          tags: ["scheduled"],
        },
        {
          id: "newer",
          short_id: "newer",
          time: "2026-09-18T00:00:00Z",
          hostname: "host",
          paths: ["/app/dumps"],
          tags: [],
        },
        { id: 42, time: "2026-09-19T00:00:00Z" },
      ]),
    );

    expect(snapshots).toHaveLength(2);
    expect(snapshots.map((snapshot) => snapshot.id)).toEqual(["newer", "older"]);
    expect(snapshots[1]).toMatchObject({ short_id: null, tags: ["scheduled"] });
  });

  it("returns no snapshots for a non-array JSON document", () => {
    expect(parseSnapshots(JSON.stringify({ id: "not-an-array" }))).toEqual([]);
  });
});

describe("getBackupMetrics", () => {
  it("measures enabled, existing runtime backup sources without tracing them", async () => {
    const metrics = await getBackupMetrics();
    expect(metrics.error).toBeUndefined();
    expect(metrics).toMatchObject({
      local_source_bytes: 0,
      snapshot_count: 1,
      remote_repository_bytes: 1234,
    });
    expect(mocks.existsSync).toHaveBeenCalledWith(path.resolve(process.cwd(), "dumps"));
    expect(mocks.readdirSync).toHaveBeenCalledWith(path.resolve(process.cwd(), "dumps"), {
      withFileTypes: true,
    });
    expect(mocks.execFileAsync).toHaveBeenCalledTimes(2);
  });
});

describe("getBackupMetrics for the local target", () => {
  it("queries the local repository with its own password", async () => {
    const metrics = await getBackupMetrics("local");
    expect(metrics).toMatchObject({ snapshot_count: 1, remote_repository_bytes: 1234 });
    const env = mocks.execFileAsync.mock.calls[0][2].env;
    expect(env.RESTIC_REPOSITORY).toBe(path.join("/app/local-backup", "groovenet-restic"));
    expect(env.RESTIC_PASSWORD).toBe("local-pw");
  });

  it("reports why, and never runs restic, when the mount check fails", async () => {
    mocks.mount.mockReturnValue({ ok: false, reason: "marker-missing", message: "no marker" });
    const metrics = await getBackupMetrics("local");
    expect(metrics).toMatchObject({ error: "no marker", snapshot_count: null });
    expect(mocks.execFileAsync).not.toHaveBeenCalled();
  });

  it("reports an unconfigured disk without running restic", async () => {
    vi.stubEnv("LOCAL_BACKUP_DIR", "");
    const metrics = await getBackupMetrics("local");
    expect(metrics.error).toContain("not configured");
    expect(mocks.execFileAsync).not.toHaveBeenCalled();
  });

  it("returns the restic error", async () => {
    mocks.execFileAsync.mockRejectedValue(new Error("wrong password"));
    expect((await getBackupMetrics("local")).error).toBe("wrong password");
  });

  it("measures the lossless audio the local target would hold, not the AAC", async () => {
    mocks.getPolicy.mockReturnValue({
      ...policy,
      local: { ...policy.local, include_database: false },
    });
    mocks.readdirSync.mockImplementation(() => [
      { name: "a.m4a", isDirectory: () => false, isFile: () => true },
      { name: "b.flac", isDirectory: () => false, isFile: () => true },
    ]);
    mocks.statSync.mockImplementation((file: string) => ({
      size: file.endsWith("a.m4a") ? 10 : 100,
    }));
    const metrics = await getBackupMetrics("local");
    // 110 bytes in the directory, minus the 10-byte AAC file the target excludes.
    expect(metrics.local_source_bytes).toBe(100);
  });

  it("ignores an excluded file that vanished", async () => {
    mocks.getPolicy.mockReturnValue({
      ...policy,
      local: { ...policy.local, include_database: false },
    });
    mocks.readdirSync.mockImplementation(() => [
      { name: "a.m4a", isDirectory: () => false, isFile: () => true },
    ]);
    mocks.statSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect((await getBackupMetrics("local")).local_source_bytes).toBe(0);
  });
});

describe("getBackupMetrics caching", () => {
  it("serves a repeat call within a minute from cache, per target", async () => {
    await getBackupMetrics("remote");
    await getBackupMetrics("remote");
    expect(mocks.execFileAsync).toHaveBeenCalledTimes(2);
    await getBackupMetrics("local");
    expect(mocks.execFileAsync).toHaveBeenCalledTimes(4);
  });

  it("counts the remote extras only for the remote", async () => {
    mocks.getPolicy.mockReturnValue({
      ...policy,
      include_uploads: true,
      include_discogs_exports: true,
      include_essentia_files: true,
    });
    await getBackupMetrics("remote");
    expect(mocks.existsSync).toHaveBeenCalledWith(path.resolve(process.cwd(), "uploads"));
    mocks.existsSync.mockClear();
    await getBackupMetrics("local");
    expect(mocks.existsSync).not.toHaveBeenCalledWith(path.resolve(process.cwd(), "uploads"));
  });
});

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

import { getBackupMetrics, parseSnapshots } from "../backupMetricsService";

const policy: BackupPolicy = {
  enabled: true,
  provider: "restic-b2",
  schedule_cron: "0 */6 * * *",
  retention_preset: "balanced",
  include_database: true,
  include_audio_files: false,
  include_album_covers: false,
  include_discogs_exports: false,
  include_essentia_files: false,
  include_uploads: false,
  updated_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getPolicy.mockReturnValue(policy);
  mocks.existsSync.mockReturnValue(true);
  mocks.readdirSync.mockReturnValue([]);
  mocks.execFileAsync.mockImplementation((_command: string, args: string[]) => {
      const stdout = args[0] === "snapshots"
        ? JSON.stringify([{ id: "snapshot", time: "2026-09-20T12:00:00Z" }])
        : JSON.stringify({ total_size: 1234 });
      return Promise.resolve({ stdout, stderr: "" });
    });
});

describe("parseSnapshots", () => {
  it("sorts valid Restic snapshots newest first and discards malformed entries", () => {
    const snapshots = parseSnapshots(JSON.stringify([
      { id: "older", time: "2026-09-17T00:00:00Z", hostname: "host", paths: ["/app/audio"], tags: ["scheduled"] },
      { id: "newer", short_id: "newer", time: "2026-09-18T00:00:00Z", hostname: "host", paths: ["/app/dumps"], tags: [] },
      { id: 42, time: "2026-09-19T00:00:00Z" },
    ]));

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

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { backupPolicyService } from "@/server/services/backupPolicyService";
import { backupStatusService } from "@/server/services/backupStatusService";
import type {
  BackupPolicy,
  BackupRetentionPreset,
  BackupSnapshotSummary,
  BackupStatus,
} from "@/types/backup";

const execFileAsync = promisify(execFile);

type BackupRunResult = {
  startedAt: string;
  finishedAt: string;
  status: "success" | "failed" | "skipped";
  reason: string;
  snapshotOutput?: string;
  pruneOutput?: string;
  error?: string;
  backedUpPaths?: string[];
  snapshot?: BackupSnapshotSummary | null;
  missingEnv?: string[];
};

const GLOBAL_SCHEDULER_KEY = "__groovenetBackupSchedulerStarted";
const GLOBAL_LAST_TICK_MINUTE_KEY = "__groovenetBackupSchedulerLastMinute";
const GLOBAL_BACKUP_RUNNING_KEY = "__groovenetBackupRunning";

type GlobalWithBackup = typeof globalThis & {
  [GLOBAL_SCHEDULER_KEY]?: boolean;
  [GLOBAL_LAST_TICK_MINUTE_KEY]?: string;
  [GLOBAL_BACKUP_RUNNING_KEY]?: boolean;
};

function getExistingPath(p: string): string | null {
  return fs.existsSync(p) ? p : null;
}

// Next can execute server code in more than one process. `globalThis` only
// protects one of those processes, so use the persistent backup-status
// directory as a shared, atomic lock for the complete restic operation.
function acquireBackupRunLock(): (() => void) | null {
  // BACKUP_STATUS_DIR is a runtime volume, not a server bundle dependency.
  const statusDir = path.resolve(
    /* turbopackIgnore: true */ process.env.BACKUP_STATUS_DIR || path.resolve(process.cwd(), "dumps")
  );
  const lockPath = path.join(statusDir, ".backup-run.lock");
  fs.mkdirSync(statusDir, { recursive: true });

  let fd: number;
  try {
    fd = fs.openSync(lockPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return null;
    throw error;
  }

  try {
    fs.writeFileSync(
      fd,
      `${JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() })}\n`,
      "utf8"
    );
  } catch (error) {
    fs.closeSync(fd);
    fs.unlinkSync(lockPath);
    throw error;
  }
  fs.closeSync(fd);

  return () => {
    try {
      fs.unlinkSync(lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  };
}

function retentionArgs(preset: BackupRetentionPreset): string[] {
  if (preset === "aggressive") {
    return ["--keep-hourly", "24", "--keep-daily", "7"];
  }
  if (preset === "archive") {
    return [
      "--keep-daily",
      "30",
      "--keep-weekly",
      "26",
      "--keep-monthly",
      "24",
      "--keep-yearly",
      "5",
    ];
  }
  return [
    "--keep-hourly",
    "48",
    "--keep-daily",
    "30",
    "--keep-weekly",
    "12",
    "--keep-monthly",
    "12",
  ];
}

function parseCronField(field: string, value: number): boolean {
  const trimmed = field.trim();
  if (trimmed === "*") return true;

  const parts = trimmed.split(",");
  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;
    if (p.startsWith("*/")) {
      const step = Number(p.slice(2));
      if (Number.isInteger(step) && step > 0 && value % step === 0) return true;
      continue;
    }
    const num = Number(p);
    if (Number.isInteger(num) && num === value) return true;
  }
  return false;
}

function cronMatches(cron: string, now: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [min, hour, day, month, dow] = parts;
  const values = [
    now.getUTCMinutes(),
    now.getUTCHours(),
    now.getUTCDate(),
    now.getUTCMonth() + 1,
    now.getUTCDay(),
  ];
  return (
    parseCronField(min, values[0]) &&
    parseCronField(hour, values[1]) &&
    parseCronField(day, values[2]) &&
    parseCronField(month, values[3]) &&
    parseCronField(dow, values[4])
  );
}

function requiredEnvConfigured(): { ok: boolean; missing: string[] } {
  const required = ["RESTIC_REPOSITORY", "RESTIC_PASSWORD"];
  const missing = required.filter((name) => !process.env[name]);
  return { ok: missing.length === 0, missing };
}

async function createDatabaseDump(): Promise<string> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  const pg = new URL(databaseUrl);
  const dumpsDir = path.resolve(process.cwd(), "dumps");
  fs.mkdirSync(dumpsDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dumpPath = path.join(dumpsDir, `pg-backup-${stamp}.dump`);

  const args = [
    "-h",
    pg.hostname,
    "-p",
    pg.port || "5432",
    "-U",
    decodeURIComponent(pg.username),
    "-F",
    "c",
    "--no-acl",
    "-n",
    "public",
    "-d",
    pg.pathname.replace(/^\//, ""),
  ];

  const { stdout } = await execFileAsync("/usr/lib/postgresql/16/bin/pg_dump", args, {
    env: {
      ...process.env,
      PGPASSWORD: decodeURIComponent(pg.password),
    },
    encoding: "buffer",
    maxBuffer: 1024 * 1024 * 512,
  });

  fs.writeFileSync(dumpPath, stdout);

  return dumpPath;
}

function collectBackupPaths(policy: BackupPolicy): string[] {
  const paths: string[] = [];

  if (policy.include_database) {
    const dumpsPath = getExistingPath(path.resolve(process.cwd(), "dumps"));
    if (dumpsPath) paths.push(dumpsPath);
  }
  if (policy.include_audio_files) {
    const audioPath = getExistingPath(path.resolve(process.cwd(), "audio"));
    if (audioPath) paths.push(audioPath);
  }
  if (policy.include_album_covers) {
    const coversPath = getExistingPath(
      path.resolve(process.cwd(), "public/uploads/album-covers")
    );
    if (coversPath) paths.push(coversPath);
  }
  if (policy.include_discogs_exports) {
    const discogsExportsPath = getExistingPath(
      path.resolve(process.cwd(), "discogs_exports")
    );
    if (discogsExportsPath) paths.push(discogsExportsPath);
  }
  if (policy.include_essentia_files) {
    const essentiaPath = getExistingPath(path.resolve(process.cwd(), "essentia-data"));
    if (essentiaPath) paths.push(essentiaPath);
  }
  if (policy.include_uploads) {
    const uploadsPath = getExistingPath(path.resolve(process.cwd(), "uploads"));
    if (uploadsPath) paths.push(uploadsPath);
  }

  return paths;
}

function parseSnapshotsOutput(raw: string): BackupSnapshotSummary | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parsed = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  const snapshots = parsed
    .map((entry) => {
      const obj =
        typeof entry === "object" && entry !== null
          ? (entry as Record<string, unknown>)
          : null;
      if (!obj || typeof obj.id !== "string" || typeof obj.time !== "string") {
        return null;
      }
      return {
        id: obj.id,
        short_id: typeof obj.short_id === "string" ? obj.short_id : null,
        time: obj.time,
        hostname: typeof obj.hostname === "string" ? obj.hostname : null,
        paths: Array.isArray(obj.paths)
          ? obj.paths.filter((value): value is string => typeof value === "string")
          : [],
        tags: Array.isArray(obj.tags)
          ? obj.tags.filter((value): value is string => typeof value === "string")
          : [],
      } satisfies BackupSnapshotSummary;
    })
    .filter((value): value is BackupSnapshotSummary => value !== null);

  if (snapshots.length === 0) return null;

  snapshots.sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
  );
  return snapshots[0] ?? null;
}

async function getLatestSnapshotSummary(): Promise<BackupSnapshotSummary | null> {
  const snapshots = await execFileAsync("restic", ["snapshots", "--json"], {
    env: process.env,
    maxBuffer: 1024 * 1024 * 10,
  });
  return parseSnapshotsOutput(`${snapshots.stdout || ""}${snapshots.stderr || ""}`);
}

function persistStatus(result: BackupRunResult): void {
  const status: Omit<BackupStatus, "stored_at"> = {
    started_at: result.startedAt,
    finished_at: result.finishedAt,
    status: result.status,
    reason: result.reason,
    backed_up_paths: result.backedUpPaths ?? [],
    snapshot: result.snapshot ?? null,
    ...(result.error ? { error: result.error } : {}),
    ...(result.missingEnv ? { missing_env: result.missingEnv } : {}),
  };

  try {
    backupStatusService.writeStatus(status);
  } catch (error) {
    console.error("[backup-status] failed to persist backup status:", error);
  }
}

export async function runBackupNow(
  reason: "manual" | "scheduled" = "manual"
): Promise<BackupRunResult> {
  const g = globalThis as GlobalWithBackup;
  const startedAt = new Date().toISOString();
  const finish = (result: BackupRunResult): BackupRunResult => {
    persistStatus(result);
    return result;
  };

  if (g[GLOBAL_BACKUP_RUNNING_KEY]) {
    return finish({
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "skipped",
      reason: "backup-already-running",
    });
  }

  g[GLOBAL_BACKUP_RUNNING_KEY] = true;
  let releaseRunLock: (() => void) | null = null;
  try {
    releaseRunLock = acquireBackupRunLock();
    if (!releaseRunLock) {
      return finish({
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "skipped",
        reason: "backup-already-running",
      });
    }

    const policy = backupPolicyService.getPolicy();
    if (reason === "scheduled" && !policy.enabled) {
      return finish({
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "skipped",
        reason: "policy-disabled",
      });
    }

    const envCheck = requiredEnvConfigured();
    if (!envCheck.ok) {
      return finish({
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "failed",
        reason: "missing-env",
        error: `Missing env vars: ${envCheck.missing.join(", ")}`,
        missingEnv: envCheck.missing,
      });
    }

    if (policy.include_database) {
      await createDatabaseDump();
    }

    const backupPaths = collectBackupPaths(policy);
    if (backupPaths.length === 0) {
      return finish({
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "skipped",
        reason: "no-paths-selected",
        backedUpPaths: [],
      });
    }

    const tag = `groovenet-${reason}`;
    const snapshot = await execFileAsync(
      "restic",
      ["backup", ...backupPaths, "--tag", tag, "--json"],
      { env: process.env, maxBuffer: 1024 * 1024 * 10 }
    );

    const prune = await execFileAsync(
      "restic",
      ["forget", "--prune", ...retentionArgs(policy.retention_preset)],
      { env: process.env, maxBuffer: 1024 * 1024 * 10 }
    );

    const latestSnapshot = await getLatestSnapshotSummary();

    return finish({
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "success",
      reason,
      snapshotOutput: `${snapshot.stdout || ""}${snapshot.stderr || ""}`.trim(),
      pruneOutput: `${prune.stdout || ""}${prune.stderr || ""}`.trim(),
      backedUpPaths: backupPaths,
      snapshot: latestSnapshot,
    });
  } catch (error) {
    return finish({
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "failed",
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    releaseRunLock?.();
    g[GLOBAL_BACKUP_RUNNING_KEY] = false;
  }
}

async function scheduledTick(): Promise<void> {
  const g = globalThis as GlobalWithBackup;
  const now = new Date();
  const minuteKey = now.toISOString().slice(0, 16);
  if (g[GLOBAL_LAST_TICK_MINUTE_KEY] === minuteKey) return;
  g[GLOBAL_LAST_TICK_MINUTE_KEY] = minuteKey;

  const policy = backupPolicyService.getPolicy();
  if (!policy.enabled) return;
  if (!cronMatches(policy.schedule_cron, now)) return;

  const result = await runBackupNow("scheduled");
  if (result.status === "failed") {
    console.error("[backup-scheduler] backup failed:", result.error);
  } else if (result.status === "success") {
    console.log("[backup-scheduler] backup succeeded at", result.finishedAt);
  }
}

export function startBackupScheduler(): void {
  const g = globalThis as GlobalWithBackup;
  if (g[GLOBAL_SCHEDULER_KEY]) return;
  g[GLOBAL_SCHEDULER_KEY] = true;

  void scheduledTick();
  setInterval(() => {
    void scheduledTick();
  }, 60_000);

  console.log("[backup-scheduler] started");
}

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { backupPolicyService } from "@/server/services/backupPolicyService";
import { backupStatusService } from "@/server/services/backupStatusService";
import { createBackup } from "@/server/services/databaseBackupService";
import {
  checkLocalBackupMount,
  localBackupDir,
  localRepositoryPath,
  missingEnv,
  planAudio,
  resticEnv,
  writeExcludeFile,
} from "@/server/services/backupTargets";
import type {
  BackupPolicy,
  BackupRetentionPreset,
  BackupSnapshotSummary,
  BackupStatus,
  BackupTarget,
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
  target?: BackupTarget;
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
    /* turbopackIgnore: true */ process.env.BACKUP_STATUS_DIR ||
      path.resolve(process.cwd(), "dumps"),
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
      "utf8",
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

type BackupPlan = { paths: string[]; excludes: string[] };

/**
 * What one target snapshots. The remote adds the extras (Discogs exports, Essentia
 * files, uploads); every target has its own database, covers and audio choices, and
 * audio is split by format (see `planAudio`).
 */
async function collectBackupPlan(policy: BackupPolicy, target: BackupTarget): Promise<BackupPlan> {
  const choices = policy[target];
  const paths: string[] = [];
  const excludes: string[] = [];
  const add = (relative: string, enabled: boolean) => {
    if (!enabled) return;
    const found = getExistingPath(path.resolve(process.cwd(), relative));
    if (found) paths.push(found);
  };

  add("dumps", choices.include_database);
  const audio = await planAudio(path.resolve(process.cwd(), "audio"), choices);
  if (audio.path) {
    paths.push(audio.path);
    excludes.push(...audio.excluded);
  }
  add("public/uploads/album-covers", choices.include_album_covers);
  if (target === "remote") {
    add("discogs_exports", policy.include_discogs_exports);
    add("essentia-data", policy.include_essentia_files);
    add("uploads", policy.include_uploads);
  }
  return { paths, excludes };
}

function parseSnapshotsOutput(raw: string): BackupSnapshotSummary | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parsed = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  const snapshots = parsed
    .map((entry) => {
      const obj =
        typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : null;
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

  snapshots.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  return snapshots[0] ?? null;
}

async function getLatestSnapshotSummary(
  target: BackupTarget,
): Promise<BackupSnapshotSummary | null> {
  const snapshots = await execFileAsync("restic", ["snapshots", "--json"], {
    env: resticEnv(target),
    maxBuffer: 1024 * 1024 * 10,
  });
  return parseSnapshotsOutput(`${snapshots.stdout || ""}${snapshots.stderr || ""}`);
}

function persistStatus(result: BackupRunResult, target: BackupTarget): void {
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
    backupStatusService.writeStatus(status, target);
  } catch (error) {
    console.error("[backup-status] failed to persist backup status:", error);
  }
}

/** True once the local disk is configured on this host (`LOCAL_BACKUP_PATH` is set). */
export function localTargetConfigured(): boolean {
  return localBackupDir() !== null;
}

// A repository on the disk is created on first use, after the mount checks passed.
async function ensureLocalRepository(repo: string, env: NodeJS.ProcessEnv): Promise<void> {
  if (fs.existsSync(path.join(repo, "config"))) return;
  await execFileAsync("restic", ["init"], { env, maxBuffer: 1024 * 1024 * 10 });
}

export async function runBackupNow(
  reason: "manual" | "scheduled" = "manual",
  target: BackupTarget = "remote",
): Promise<BackupRunResult> {
  const g = globalThis as GlobalWithBackup;
  const startedAt = new Date().toISOString();
  const finish = (result: BackupRunResult, persist = true): BackupRunResult => {
    if (persist) persistStatus(result, target);
    return { ...result, target };
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
  let resticDumpPath: string | null = null;
  let excludeFile: string | null = null;
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

    const policy = await backupPolicyService.getPolicy();
    if (reason === "scheduled" && !policy.enabled) {
      return finish({
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "skipped",
        reason: "policy-disabled",
      });
    }
    // A switched-off target leaves its last result alone rather than overwriting it.
    if (!policy[target].enabled) {
      return finish(
        {
          startedAt,
          finishedAt: new Date().toISOString(),
          status: "skipped",
          reason: "target-disabled",
        },
        false,
      );
    }

    const failed = (reasonCode: string, error: string, extra: Partial<BackupRunResult> = {}) =>
      finish({
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "failed",
        reason: reasonCode,
        error,
        ...extra,
      });

    if (target === "local") {
      const dir = localBackupDir();
      if (!dir)
        return finish(
          {
            startedAt,
            finishedAt: new Date().toISOString(),
            status: "skipped",
            reason: "not-configured",
          },
          false,
        );
      // Before anything touches the disk, including the dump: an unmounted path is
      // just a directory on the root filesystem, and nothing may be written there.
      const mount = checkLocalBackupMount(dir);
      if (!mount.ok) return failed(`mount-${mount.reason}`, mount.message);
    }

    const envCheck = missingEnv(target);
    if (envCheck.length > 0) {
      return failed("missing-env", `Missing env vars: ${envCheck.join(", ")}`, {
        missingEnv: envCheck,
      });
    }

    const env = resticEnv(target);
    const choices = policy[target];
    if (choices.include_database) {
      // restic snapshots the dumps directory; the dump is removed afterwards so
      // runs don't pile up on local disk.
      resticDumpPath = (
        await createBackup({ prefix: `pg-backup-restic${target === "local" ? "-local" : ""}` })
      ).path;
    }

    const plan = await collectBackupPlan(policy, target);
    if (plan.paths.length === 0) {
      return finish({
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "skipped",
        reason: "no-paths-selected",
        backedUpPaths: [],
      });
    }

    if (target === "local")
      await ensureLocalRepository(localRepositoryPath(localBackupDir()!), env);

    const args = ["backup", ...plan.paths, "--tag", `groovenet-${reason}`, "--json"];
    if (plan.excludes.length > 0) {
      excludeFile = writeExcludeFile(os.tmpdir(), plan.excludes);
      args.push("--exclude-file", excludeFile);
    }
    const snapshot = await execFileAsync("restic", args, { env, maxBuffer: 1024 * 1024 * 10 });

    const prune = await execFileAsync(
      "restic",
      ["forget", "--prune", ...retentionArgs(policy.retention_preset)],
      { env, maxBuffer: 1024 * 1024 * 10 },
    );

    const latestSnapshot = await getLatestSnapshotSummary(target);

    return finish({
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "success",
      reason,
      snapshotOutput: `${snapshot.stdout || ""}${snapshot.stderr || ""}`.trim(),
      pruneOutput: `${prune.stdout || ""}${prune.stderr || ""}`.trim(),
      backedUpPaths: plan.paths,
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
    if (resticDumpPath) {
      fs.rmSync(resticDumpPath, { force: true });
    }
    if (excludeFile) fs.rmSync(excludeFile, { force: true });
    releaseRunLock?.();
    g[GLOBAL_BACKUP_RUNNING_KEY] = false;
  }
}

/**
 * Every target that applies on this host, one after the other (they share one lock,
 * and the disk and the network should not compete for the same dump). The local
 * target runs first so a slow upload never delays the disk copy.
 */
export async function runAllBackups(
  reason: "manual" | "scheduled" = "manual",
): Promise<Partial<Record<BackupTarget, BackupRunResult>>> {
  const results: Partial<Record<BackupTarget, BackupRunResult>> = {};
  if (localTargetConfigured()) results.local = await runBackupNow(reason, "local");
  results.remote = await runBackupNow(reason, "remote");
  return results;
}

async function scheduledTick(): Promise<void> {
  const g = globalThis as GlobalWithBackup;
  const now = new Date();
  const minuteKey = now.toISOString().slice(0, 16);
  if (g[GLOBAL_LAST_TICK_MINUTE_KEY] === minuteKey) return;
  g[GLOBAL_LAST_TICK_MINUTE_KEY] = minuteKey;

  const policy = await backupPolicyService.getPolicy();
  if (!policy.enabled) return;
  if (!cronMatches(policy.schedule_cron, now)) return;

  const results = await runAllBackups("scheduled");
  for (const [target, result] of Object.entries(results)) {
    if (result.status === "failed") {
      console.error(`[backup-scheduler] ${target} backup failed:`, result.error);
    } else if (result.status === "success") {
      console.log(`[backup-scheduler] ${target} backup succeeded at`, result.finishedAt);
    }
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

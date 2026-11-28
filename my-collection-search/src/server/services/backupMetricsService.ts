import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { backupPolicyService } from "@/server/services/backupPolicyService";
import {
  checkLocalBackupMount,
  localBackupDir,
  planAudio,
  resticEnv,
} from "@/server/services/backupTargets";
import type { BackupMetrics, BackupSnapshotSummary, BackupTarget } from "@/types/backup";

const execFileAsync = promisify(execFile);
const METRICS_CACHE_MS = 60_000;
const cached: Partial<Record<BackupTarget, { value: BackupMetrics; expiresAt: number }>> = {};

function directorySize(directory: string): number {
  let total = 0;
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    try {
      if (entry.isDirectory()) total += directorySize(entryPath);
      else if (entry.isFile()) total += fs.statSync(entryPath).size;
    } catch {
      // A file can disappear while the backup source is being updated.
    }
  }
  return total;
}

async function selectedBytes(target: BackupTarget): Promise<number> {
  const policy = await backupPolicyService.getPolicy();
  const choices = policy[target];
  const resolve = (relativePath: string) =>
    // These paths are runtime backup volumes, not server bundle dependencies.
    path.resolve(/* turbopackIgnore: true */ process.cwd(), relativePath);
  const candidates: Array<[boolean, string]> = [
    [choices.include_database, "dumps"],
    [choices.include_album_covers, "public/uploads/album-covers"],
  ];
  if (target === "remote") {
    candidates.push(
      [policy.include_discogs_exports, "discogs_exports"],
      [policy.include_essentia_files, "essentia-data"],
      [policy.include_uploads, "uploads"],
    );
  }
  let total = candidates
    .filter(([enabled, relativePath]) => enabled && fs.existsSync(resolve(relativePath)))
    .reduce((sum, [, relativePath]) => sum + directorySize(resolve(relativePath)), 0);

  // Audio is counted by the same split the backup uses, so a remote that skips FLACs
  // does not report their size as data it holds.
  const audio = await planAudio(resolve("audio"), choices);
  if (audio.path) {
    total += directorySize(audio.path);
    for (const file of audio.excluded) {
      try {
        total -= fs.statSync(file).size;
      } catch {
        // The file went away since the listing.
      }
    }
  }
  return total;
}

export function parseSnapshots(raw: string): BackupSnapshotSummary[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .flatMap((value): BackupSnapshotSummary[] => {
      if (typeof value !== "object" || value === null) return [];
      const snapshot = value as Record<string, unknown>;
      if (typeof snapshot.id !== "string" || typeof snapshot.time !== "string") return [];
      return [
        {
          id: snapshot.id,
          short_id: typeof snapshot.short_id === "string" ? snapshot.short_id : null,
          time: snapshot.time,
          hostname: typeof snapshot.hostname === "string" ? snapshot.hostname : null,
          paths: Array.isArray(snapshot.paths)
            ? snapshot.paths.filter((item): item is string => typeof item === "string")
            : [],
          tags: Array.isArray(snapshot.tags)
            ? snapshot.tags.filter((item): item is string => typeof item === "string")
            : [],
        },
      ];
    })
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

export async function getBackupMetrics(target: BackupTarget = "remote"): Promise<BackupMetrics> {
  const hit = cached[target];
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const capturedAt = new Date().toISOString();
  const localSourceBytes = await selectedBytes(target);
  const unavailable = (error: string): BackupMetrics => ({
    captured_at: capturedAt,
    local_source_bytes: localSourceBytes,
    snapshot_count: null,
    remote_repository_bytes: null,
    recent_snapshots: [],
    error,
  });

  if (target === "local") {
    // Even a read must not poke at an unmounted path, so check first.
    const dir = localBackupDir();
    if (!dir) return unavailable("Local backup is not configured.");
    const mount = checkLocalBackupMount(dir);
    if (!mount.ok) return unavailable(mount.message);
  }

  const env = resticEnv(target);
  try {
    const [snapshotsResult, statsResult] = await Promise.all([
      execFileAsync("restic", ["snapshots", "--json"], { env, maxBuffer: 1024 * 1024 * 10 }),
      execFileAsync("restic", ["stats", "--json"], { env, maxBuffer: 1024 * 1024 * 10 }),
    ]);
    const snapshots = parseSnapshots(String(snapshotsResult.stdout));
    const stats = JSON.parse(String(statsResult.stdout)) as { total_size?: unknown };
    const value: BackupMetrics = {
      captured_at: capturedAt,
      local_source_bytes: localSourceBytes,
      snapshot_count: snapshots.length,
      // For the local target this is the repository on the disk; the field keeps its
      // wire name for the remote's sake.
      remote_repository_bytes: typeof stats.total_size === "number" ? stats.total_size : null,
      recent_snapshots: snapshots.slice(0, 20),
    };
    cached[target] = { value, expiresAt: Date.now() + METRICS_CACHE_MS };
    return value;
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

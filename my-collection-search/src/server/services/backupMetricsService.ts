import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { backupPolicyService } from "@/server/services/backupPolicyService";
import type { BackupMetrics, BackupSnapshotSummary } from "@/types/backup";

const execFileAsync = promisify(execFile);
const METRICS_CACHE_MS = 60_000;
let cached: { value: BackupMetrics; expiresAt: number } | null = null;

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

function selectedPaths(): string[] {
  const policy = backupPolicyService.getPolicy();
  const candidates: Array<[boolean, string]> = [
    [policy.include_database, "dumps"],
    [policy.include_audio_files, "audio"],
    [policy.include_album_covers, "public/uploads/album-covers"],
    [policy.include_discogs_exports, "discogs_exports"],
    [policy.include_essentia_files, "essentia-data"],
    [policy.include_uploads, "uploads"],
  ];
  return candidates
    // These paths are runtime backup volumes, not server bundle dependencies.
    .filter(([enabled, relativePath]) => enabled && fs.existsSync(
      path.resolve(/* turbopackIgnore: true */ process.cwd(), relativePath)
    ))
    .map(([, relativePath]) => path.resolve(
      /* turbopackIgnore: true */ process.cwd(),
      relativePath
    ));
}

export function parseSnapshots(raw: string): BackupSnapshotSummary[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((value): BackupSnapshotSummary[] => {
    if (typeof value !== "object" || value === null) return [];
    const snapshot = value as Record<string, unknown>;
    if (typeof snapshot.id !== "string" || typeof snapshot.time !== "string") return [];
    return [{
      id: snapshot.id,
      short_id: typeof snapshot.short_id === "string" ? snapshot.short_id : null,
      time: snapshot.time,
      hostname: typeof snapshot.hostname === "string" ? snapshot.hostname : null,
      paths: Array.isArray(snapshot.paths) ? snapshot.paths.filter((item): item is string => typeof item === "string") : [],
      tags: Array.isArray(snapshot.tags) ? snapshot.tags.filter((item): item is string => typeof item === "string") : [],
    }];
  }).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

export async function getBackupMetrics(): Promise<BackupMetrics> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const localSourceBytes = selectedPaths().reduce((total, sourcePath) => total + directorySize(sourcePath), 0);
  const capturedAt = new Date().toISOString();
  try {
    const [snapshotsResult, statsResult] = await Promise.all([
      execFileAsync("restic", ["snapshots", "--json"], { env: process.env, maxBuffer: 1024 * 1024 * 10 }),
      execFileAsync("restic", ["stats", "--json"], { env: process.env, maxBuffer: 1024 * 1024 * 10 }),
    ]);
    const snapshots = parseSnapshots(String(snapshotsResult.stdout));
    const stats = JSON.parse(String(statsResult.stdout)) as { total_size?: unknown };
    const value: BackupMetrics = {
      captured_at: capturedAt,
      local_source_bytes: localSourceBytes,
      snapshot_count: snapshots.length,
      remote_repository_bytes: typeof stats.total_size === "number" ? stats.total_size : null,
      recent_snapshots: snapshots.slice(0, 20),
    };
    cached = { value, expiresAt: Date.now() + METRICS_CACHE_MS };
    return value;
  } catch (error) {
    return {
      captured_at: capturedAt,
      local_source_bytes: localSourceBytes,
      snapshot_count: null,
      remote_repository_bytes: null,
      recent_snapshots: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

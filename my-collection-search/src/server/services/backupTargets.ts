import fs from "node:fs";
import path from "node:path";
import { trackAudioFileRepository } from "@/server/repositories/trackAudioFileRepository";
import { trackAudioMetadataService } from "@/server/services/trackAudioMetadataService";
import type { BackupTarget, BackupTargetPolicy } from "@/types/backup";

/**
 * Backup targets (#1311). The remote is whatever restic backend `RESTIC_REPOSITORY`
 * names. The local target is a second restic repository on an attached disk, which
 * exists only when the host mounted one: `LOCAL_BACKUP_DIR` is set by
 * `docker-compose.local-backup.yml`, itself added only when `LOCAL_BACKUP_PATH` is set.
 */

/** Created by the operator on the disk itself, so an empty mount point never qualifies. */
export const LOCAL_BACKUP_MARKER = ".groovenet-backup-disk";
const LOCAL_REPOSITORY_DIR = "groovenet-restic";

export type MountFailureReason =
  "path-missing" | "not-a-directory" | "marker-missing" | "same-device";

export type MountCheck = { ok: true } | { ok: false; reason: MountFailureReason; message: string };

/** The few filesystem calls the mount check makes, so tests can stub them. */
export type MountFs = Pick<typeof fs, "statSync">;

export function localBackupDir(): string | null {
  const dir = process.env.LOCAL_BACKUP_DIR?.trim();
  return dir ? path.resolve(dir) : null;
}

export function localBackupConfigured(): boolean {
  return localBackupDir() !== null;
}

/**
 * Whether `dir` is a mounted disk the operator set aside for backups. Every local run
 * calls this first and writes nothing when it fails, so an unmounted disk can never
 * fill the root filesystem with a repository.
 *
 * Two independent checks: the operator-created marker file, and that the directory is a
 * mount point (a different device from its parent). The marker is what survives a
 * container, where a bind-mounted host directory is not always a different device.
 */
export function checkLocalBackupMount(dir: string, fsImpl: MountFs = fs): MountCheck {
  const fail = (reason: MountFailureReason, message: string): MountCheck => ({
    ok: false,
    reason,
    message,
  });

  let dirStat: fs.Stats;
  try {
    dirStat = fsImpl.statSync(dir);
  } catch {
    return fail("path-missing", `Local backup path ${dir} does not exist. Is the disk attached?`);
  }
  if (!dirStat.isDirectory()) {
    return fail("not-a-directory", `Local backup path ${dir} is not a directory.`);
  }

  try {
    if (!fsImpl.statSync(path.join(dir, LOCAL_BACKUP_MARKER)).isFile())
      throw new Error("not a file");
  } catch {
    return fail(
      "marker-missing",
      `Marker file ${LOCAL_BACKUP_MARKER} is missing from ${dir}. The disk may be unmounted; ` +
        "create the file on the mounted disk to confirm it is the backup disk.",
    );
  }

  try {
    const parent = fsImpl.statSync(path.dirname(dir));
    if (parent.dev === dirStat.dev) {
      return fail(
        "same-device",
        `${dir} is on the same device as its parent, so it is not a separate disk. ` +
          "Refusing to write to the root disk.",
      );
    }
  } catch {
    return fail("path-missing", `Cannot stat the parent of ${dir}.`);
  }

  return { ok: true };
}

/** Where the local restic repository lives on the disk. */
export function localRepositoryPath(dir: string): string {
  return path.join(dir, LOCAL_REPOSITORY_DIR);
}

/**
 * The restic environment for one target. The local target gets its own repository and
 * password; nothing from the remote's settings reaches it.
 */
export function resticEnv(target: BackupTarget): NodeJS.ProcessEnv {
  if (target === "remote") return process.env;
  const dir = localBackupDir();
  return {
    ...process.env,
    RESTIC_REPOSITORY: dir ? localRepositoryPath(dir) : "",
    RESTIC_PASSWORD: process.env.LOCAL_BACKUP_RESTIC_PASSWORD ?? "",
  };
}

/** Env vars a target needs before restic can run. */
export function missingEnv(target: BackupTarget): string[] {
  const required =
    target === "remote"
      ? ["RESTIC_REPOSITORY", "RESTIC_PASSWORD"]
      : ["LOCAL_BACKUP_RESTIC_PASSWORD"];
  return required.filter((name) => !process.env[name]);
}

// Containers that are lossless whatever the tracking says, for files the library has
// never probed. `.m4a` is deliberately absent: it holds AAC and ALAC alike, so only
// tracking can say which.
const LOSSLESS_EXTENSIONS = new Set([".flac", ".wav", ".aif", ".aiff", ".alac", ".ape", ".wv"]);

export type AudioClass = "lossless" | "aac";

/** `lossless` is null when the file was tracked but never probed. */
export function classifyAudio(
  relativeName: string,
  tracked: ReadonlyMap<string, boolean | null>,
): AudioClass {
  const lossless = tracked.get(relativeName);
  if (typeof lossless === "boolean") return lossless ? "lossless" : "aac";
  return LOSSLESS_EXTENSIONS.has(path.extname(relativeName).toLowerCase()) ? "lossless" : "aac";
}

async function trackedFormats(): Promise<Map<string, boolean | null>> {
  const rows = await trackAudioFileRepository.listAudioFormats();
  const formats = new Map<string, boolean | null>();
  for (const row of rows) {
    const name = trackAudioMetadataService.normalizeAudioFilename(row.filename);
    if (!name) continue;
    // A probed answer beats an unprobed one if a file is somehow listed twice.
    if (formats.get(name) == null) formats.set(name, row.lossless);
  }
  return formats;
}

function walkFiles(root: string, dir = root, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(root, full, found);
    else if (entry.isFile()) found.push(path.relative(root, full).split(path.sep).join("/"));
  }
  return found;
}

// restic exclude patterns are globs; a literal path needs its metacharacters escaped.
function escapeGlob(value: string): string {
  return value.replace(/[\\*?[]/g, (c) => `\\${c}`);
}

export type AudioPlan = {
  /** The audio directory to snapshot, or null when the policy takes no audio. */
  path: string | null;
  /** Absolute paths inside `path` that restic must skip. */
  excluded: string[];
};

/**
 * Which audio a target takes. Both classes: the whole directory. One class: the
 * directory minus every file of the other class. Neither: nothing.
 */
export async function planAudio(
  audioDir: string,
  policy: Pick<BackupTargetPolicy, "include_aac_audio" | "include_lossless_audio">,
): Promise<AudioPlan> {
  const { include_aac_audio: aac, include_lossless_audio: lossless } = policy;
  if (!aac && !lossless) return { path: null, excluded: [] };
  if (!fs.existsSync(audioDir)) return { path: null, excluded: [] };
  if (aac && lossless) return { path: audioDir, excluded: [] };

  const tracked = await trackedFormats();
  const unwanted: AudioClass = lossless ? "aac" : "lossless";
  const excluded = walkFiles(audioDir)
    .filter((name) => classifyAudio(name, tracked) === unwanted)
    .map((name) => path.join(audioDir, name));
  return { path: audioDir, excluded };
}

/** Write a restic `--exclude-file`. Returns its path; the caller removes it. */
export function writeExcludeFile(dir: string, excluded: string[]): string {
  const file = path.join(dir, `restic-excludes-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(file, `${excluded.map(escapeGlob).join("\n")}\n`, { mode: 0o600 });
  return file;
}

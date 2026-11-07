import fsp from "node:fs/promises";
import path from "node:path";
import type {
  MissingFileTrack,
  OrphanFile,
  OrphanScanStartResponse,
  OrphansResponse,
} from "@groovenet/contracts";
import { storageOrphanRepository } from "@/server/repositories/storageOrphanRepository";
import { TrackAudioMetadataService } from "@/server/services/trackAudioMetadataService";
import { ingestDir } from "@/server/services/ingestSweeperService";

/**
 * Orphan scan of the audio volume (#1052). It only lists: nothing is deleted
 * or re-linked.
 *
 * - **Files with no track**: audio files under `AUDIO_DIR` that no track's
 *   `local_audio_url` resolves to.
 * - **Tracks pointing at missing files**: tracks whose `local_audio_url` does
 *   not resolve to a file.
 *
 * Both sides use `TrackAudioMetadataService.resolveAudioFilePath`, so "points
 * at" means exactly what playback and metadata reads mean.
 */

const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".m4a",
  ".aac",
  ".flac",
  ".wav",
  ".aif",
  ".aiff",
  ".ogg",
  ".opus",
  ".wma",
  ".alac",
]);

/** A file written this recently may still be a download in flight. */
const RECENT_MS = 2 * 60 * 1000;
const YIELD_EVERY = 200;

const GLOBAL_RUNNING_KEY = "__groovenetStorageOrphanScanRunning";
type GlobalWithScan = typeof globalThis & { [GLOBAL_RUNNING_KEY]?: boolean };

const audioService = new TrackAudioMetadataService();

function audioDir(): string {
  return path.resolve(/* turbopackIgnore: true */ process.env.AUDIO_DIR || "/app/audio");
}

/** Directories other services own, which a scan of the audio volume never enters. */
function excludedDirs(): string[] {
  return [
    ingestDir(),
    process.env.SET_RECORDINGS_DIR || "/app/set-recordings",
    "/app/downloads", // temp and in-progress downloads
  ].map((dir) => path.resolve(/* turbopackIgnore: true */ dir));
}

const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

async function walk(
  root: string,
  excluded: string[],
  now: number,
  out: Array<{ full: string; size: number; mtimeMs: number }>,
): Promise<void> {
  let entries;
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch {
    return; // the volume may not be mounted
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (excluded.includes(full)) continue;
      await walk(full, excluded, now, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    const stat = await fsp.stat(full);
    if (now - stat.mtimeMs < RECENT_MS) continue;
    out.push({ full, size: stat.size, mtimeMs: stat.mtimeMs });
  }
}

export type OrphanScanResult = { files: OrphanFile[]; tracks: MissingFileTrack[] };

/** Runs one scan and returns the lists. Does not persist. */
export async function scanOrphans(now = Date.now()): Promise<OrphanScanResult> {
  const root = audioDir();
  const onDisk: Array<{ full: string; size: number; mtimeMs: number }> = [];
  await walk(root, excludedDirs(), now, onDisk);

  const referenced = new Set<string>();
  const tracks: MissingFileTrack[] = [];
  const rows = await storageOrphanRepository.listTracksWithAudio();
  for (const [i, row] of rows.entries()) {
    if (i % YIELD_EVERY === 0) await yieldToEventLoop();
    const resolved = audioService.resolveAudioFilePath(row.local_audio_url);
    if (resolved) referenced.add(resolved);
    else tracks.push(row);
  }

  const files: OrphanFile[] = onDisk
    .filter((file) => !referenced.has(file.full))
    .map((file) => ({
      path: path.relative(root, file.full),
      size_bytes: file.size,
      modified_at: new Date(file.mtimeMs).toISOString(),
    }))
    .sort((a, b) => b.size_bytes - a.size_bytes || a.path.localeCompare(b.path));
  return { files, tracks };
}

function isRunning(): boolean {
  return Boolean((globalThis as GlobalWithScan)[GLOBAL_RUNNING_KEY]);
}

async function runAndStore(): Promise<void> {
  const started = Date.now();
  try {
    const result = await scanOrphans(started);
    await storageOrphanRepository.saveResult({
      scannedAt: new Date(),
      durationMs: Date.now() - started,
      ...result,
    });
  } catch (error) {
    console.error("[storage] orphan scan failed:", error);
    await storageOrphanRepository
      .saveError(error instanceof Error ? error.message : String(error))
      .catch((e) => console.error("[storage] could not record scan error:", e));
  } finally {
    (globalThis as GlobalWithScan)[GLOBAL_RUNNING_KEY] = false;
  }
}

/** Starts a background scan unless one is already running. */
export function startOrphanScan(): OrphanScanStartResponse {
  if (isRunning()) return { started: false, running: true };
  (globalThis as GlobalWithScan)[GLOBAL_RUNNING_KEY] = true;
  void runAndStore();
  return { started: true, running: true };
}

export async function getOrphans(query: {
  limit: number;
  files_offset: number;
  tracks_offset: number;
}): Promise<OrphansResponse> {
  const { limit } = query;
  const stored = await storageOrphanRepository.getPage(
    limit,
    query.files_offset,
    query.tracks_offset,
  );
  const empty = (offset: number) => ({ items: [], total: 0, limit, offset });
  if (!stored) {
    return {
      running: isRunning(),
      last_scan: null,
      last_error: null,
      files: empty(query.files_offset),
      tracks: empty(query.tracks_offset),
    };
  }
  return {
    running: isRunning(),
    last_scan: stored.scanned_at
      ? {
          scanned_at: stored.scanned_at.toISOString(),
          duration_ms: stored.duration_ms ?? 0,
          orphan_file_count: stored.files_total,
          orphan_file_bytes: await storageOrphanRepository.getFileBytes(),
          missing_track_count: stored.tracks_total,
        }
      : null,
    last_error: stored.error,
    files: {
      items: stored.files,
      total: stored.files_total,
      limit,
      offset: query.files_offset,
    },
    tracks: {
      items: stored.tracks,
      total: stored.tracks_total,
      limit,
      offset: query.tracks_offset,
    },
  };
}

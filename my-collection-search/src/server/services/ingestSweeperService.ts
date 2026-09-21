import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { audioIngestRepository } from "@/server/repositories/audioIngestRepository";
import type { AudioIngestRow, AudioIngestStatus } from "@/server/repositories/audioIngestRepository";
import type {
  IngestRetentionPolicy,
  IngestRetentionStatus,
  SweepCandidate,
  SweepDecision,
  SweepSummary,
} from "@/types/audioIngest";

/**
 * Retention for the ingest volume (#269).
 *
 * Raw vinyl audio is a means, not an asset: a chunk is uploaded, fingerprinted,
 * and then only its `audio_ingests` row is worth keeping. Left alone the volume
 * grows until the disk fills, so this sweeps it.
 *
 * The decision of *what* to delete is `selectForDeletion`, which is pure and
 * takes the directory listing and the matching records as arguments. Everything
 * that touches a disk is a thin wrapper around it, so the rules that matter —
 * above all "never delete a file something is still working on" — are tested
 * without a filesystem.
 */

/** In-flight statuses. A file backing one of these is never swept. */
const IN_FLIGHT: ReadonlySet<AudioIngestStatus> = new Set<AudioIngestStatus>([
  "received",
  "processing",
]);

const GLOBAL_SWEEPER_KEY = "__groovenetIngestSweeperStarted";
const GLOBAL_LAST_SWEEP_KEY = "__groovenetIngestSweeperLastSweep";

type GlobalWithSweeper = typeof globalThis & {
  [GLOBAL_SWEEPER_KEY]?: boolean;
  [GLOBAL_LAST_SWEEP_KEY]?: string;
};

export function ingestDir(): string {
  return path.resolve(process.env.AUDIO_INGEST_DIR || "/app/audio-ingest");
}

function positiveNumber(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Retention knobs, from the environment.
 *
 * Env rather than a settings table, unlike the backup policy: these are
 * properties of the disk the container is running on, not preferences a user
 * would change from the UI.
 */
export function loadRetentionPolicy(): IngestRetentionPolicy {
  return {
    maxAgeHours: positiveNumber(process.env.AUDIO_INGEST_MAX_AGE_HOURS, 24),
    maxBytes: positiveNumber(process.env.AUDIO_INGEST_MAX_BYTES, 2 * 1024 * 1024 * 1024),
    orphanGraceMinutes: positiveNumber(
      process.env.AUDIO_INGEST_ORPHAN_GRACE_MINUTES,
      60
    ),
    sweepIntervalMinutes: positiveNumber(
      process.env.AUDIO_INGEST_SWEEP_INTERVAL_MINUTES,
      15
    ),
  };
}

/**
 * Decide the fate of every file on the ingest volume.
 *
 * Pure, and ordered by how load-bearing each rule is:
 *
 * 1. **In-flight records are protected — for a while.** A `received` or
 *    `processing` row means something is mid-write or mid-decode, and deleting
 *    underneath it is how a half-file reaches the matcher. But the protection
 *    is against racing a live job, which takes seconds, not against a record
 *    wedged forever: past `maxAgeHours` the file is swept anyway. Nothing
 *    legitimately holds a 15-second chunk in `processing` for a day, and
 *    without this backstop one crashed worker leaks its audio permanently.
 *    (Flipping the *record* back to `failed` is the reaper's job, #276. This
 *    only reclaims the disk.)
 * 2. **Terminal records are done.** `processed` or `failed` means the record
 *    holds everything worth keeping.
 * 3. **Orphans, but only after the grace period.** The ingest route writes the
 *    file before inserting its row, so a brand-new upload is indistinguishable
 *    from an orphan. Waiting is what makes this safe to run concurrently.
 * 4. **Size, last.** Still over budget, oldest deletable file first.
 */
export function selectForDeletion(
  candidates: SweepCandidate[],
  records: AudioIngestRow[],
  now: number,
  policy: IngestRetentionPolicy
): SweepDecision[] {
  const byFile = new Map<string, AudioIngestRow>();
  for (const record of records) {
    if (record.file_path) byFile.set(path.basename(record.file_path), record);
  }

  const orphanGraceMs = policy.orphanGraceMinutes * 60_000;
  const maxAgeMs = policy.maxAgeHours * 3_600_000;

  const decisions: SweepDecision[] = candidates.map((candidate) => {
    const record = byFile.get(candidate.fileName);
    const age = now - candidate.modifiedAt;

    if (record && IN_FLIGHT.has(record.status)) {
      return age >= maxAgeMs
        ? { ...candidate, deleted: true, reason: "expired" }
        : { ...candidate, deleted: false, reason: "in-flight" };
    }
    if (record) {
      return { ...candidate, deleted: true, reason: "terminal" };
    }
    if (age >= Math.min(orphanGraceMs, maxAgeMs)) {
      return { ...candidate, deleted: true, reason: "orphaned" };
    }
    return { ...candidate, deleted: false, reason: "within-grace" };
  });

  applySizeBudget(decisions, policy.maxBytes);
  return decisions;
}

/**
 * Evict oldest-first until the volume is under budget.
 *
 * Only ever promotes a *spared* file to deleted, and never one still within its
 * in-flight protection: running out of disk is bad, corrupting the chunk
 * currently being fingerprinted is worse. A volume full of live uploads is a
 * problem to alert on, not one to fix by deleting them.
 */
function applySizeBudget(decisions: SweepDecision[], maxBytes: number): void {
  let remaining = decisions
    .filter((d) => !d.deleted)
    .reduce((sum, d) => sum + d.bytes, 0);
  if (remaining <= maxBytes) return;

  const evictable = decisions
    .filter((d) => !d.deleted && d.reason !== "in-flight")
    .sort((a, b) => a.modifiedAt - b.modifiedAt);

  for (const decision of evictable) {
    if (remaining <= maxBytes) break;
    decision.deleted = true;
    decision.reason = "over-budget";
    remaining -= decision.bytes;
  }
}

/** Create the ingest directory if it is missing. */
export function ensureIngestDir(): string {
  const dir = ingestDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Can the app actually write to the ingest volume?
 *
 * Worth asking explicitly. A named volume whose mount point is missing from
 * the image is created root-owned, and the app runs as `nextjs` — so every
 * upload fails with EACCES while the route reports a 500 and the listener
 * device politely retries forever. Nothing in the pipeline looks broken; it
 * simply never starts.
 */
export function ingestDirWritable(): boolean {
  const probe = path.join(ingestDir(), `.writable-${process.pid}`);
  try {
    fs.mkdirSync(ingestDir(), { recursive: true });
    fs.writeFileSync(probe, "");
    fs.rmSync(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

/** Every regular file on the ingest volume, with the stats the rules need. */
async function listCandidates(dir: string): Promise<SweepCandidate[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const candidates: SweepCandidate[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    try {
      const stat = await fsp.stat(path.join(dir, entry.name));
      candidates.push({
        fileName: entry.name,
        bytes: stat.size,
        modifiedAt: stat.mtimeMs,
      });
    } catch (error) {
      // Swept by someone else between readdir and stat. Not our problem.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return candidates;
}

async function decideForDirectory(
  dir: string,
  policy: IngestRetentionPolicy,
  now: number
): Promise<SweepDecision[]> {
  const candidates = await listCandidates(dir);
  if (candidates.length === 0) return [];
  const records = await audioIngestRepository.findByFilePaths(
    candidates.map((c) => c.fileName)
  );
  return selectForDeletion(candidates, records, now, policy);
}

/**
 * Run one sweep.
 *
 * Idempotent and safe to run concurrently with ingest and with itself: a file
 * already gone is a no-op, and the in-flight rule means two overlapping sweeps
 * can only ever agree about what may go.
 */
export async function sweepIngestDirectory(
  policy: IngestRetentionPolicy = loadRetentionPolicy(),
  now: number = Date.now()
): Promise<SweepSummary> {
  const startedAt = new Date(now).toISOString();
  const dir = ingestDir();
  const errors: string[] = [];
  let deleted = 0;
  let bytesReclaimed = 0;

  const decisions = await decideForDirectory(dir, policy, now);

  for (const decision of decisions) {
    if (!decision.deleted) continue;
    try {
      await fsp.unlink(path.join(dir, decision.fileName));
      deleted += 1;
      bytesReclaimed += decision.bytes;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // Someone else swept it first — the outcome we wanted either way.
      if (code === "ENOENT") continue;
      errors.push(
        `${decision.fileName}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const finishedAt = new Date().toISOString();
  (globalThis as GlobalWithSweeper)[GLOBAL_LAST_SWEEP_KEY] = finishedAt;

  return {
    scanned: decisions.length,
    deleted,
    bytesReclaimed,
    spared: decisions.length - deleted,
    errors,
    startedAt,
    finishedAt,
  };
}

/** What the next sweep would do, without doing any of it. */
export async function getRetentionStatus(
  policy: IngestRetentionPolicy = loadRetentionPolicy(),
  now: number = Date.now()
): Promise<IngestRetentionStatus> {
  const decisions = await decideForDirectory(ingestDir(), policy, now);

  return {
    files: decisions.length,
    bytes: decisions.reduce((sum, d) => sum + d.bytes, 0),
    sweepable: decisions.filter((d) => d.deleted).length,
    orphans: decisions.filter((d) => d.reason === "orphaned").length,
    inFlight: decisions.filter((d) => d.reason === "in-flight").length,
    lastSweptAt: (globalThis as GlobalWithSweeper)[GLOBAL_LAST_SWEEP_KEY] ?? null,
    policy,
  };
}

let lastSweepAtMs = 0;

/** One scheduler tick: sweep if the interval has elapsed. */
export async function sweepTick(now: number = Date.now()): Promise<void> {
  const policy = loadRetentionPolicy();
  if (now - lastSweepAtMs < policy.sweepIntervalMinutes * 60_000) return;
  lastSweepAtMs = now;

  try {
    const summary = await sweepIngestDirectory(policy, now);
    if (summary.deleted > 0 || summary.errors.length > 0) {
      console.log(
        `[ingest-sweeper] deleted ${summary.deleted} file(s), ` +
          `reclaimed ${summary.bytesReclaimed} bytes, ` +
          `spared ${summary.spared}` +
          (summary.errors.length > 0 ? `, ${summary.errors.length} error(s)` : "")
      );
      for (const error of summary.errors) {
        console.error("[ingest-sweeper]", error);
      }
    }
  } catch (error) {
    // A failed sweep costs disk space, never availability.
    console.error("[ingest-sweeper] sweep failed:", error);
  }
}

/** Exported for tests: the tick's interval bookkeeping is module state. */
export function resetSweepClock(): void {
  lastSweepAtMs = 0;
}

/**
 * Start the sweeper, once per process.
 *
 * Ticks every minute like the backup scheduler and decides internally whether
 * enough time has passed, so the interval is configurable without restarting
 * a timer.
 */
export function startIngestSweeper(): void {
  const g = globalThis as GlobalWithSweeper;
  if (g[GLOBAL_SWEEPER_KEY]) return;
  g[GLOBAL_SWEEPER_KEY] = true;

  try {
    ensureIngestDir();
  } catch (error) {
    console.error("[ingest-sweeper] could not create the ingest directory:", error);
  }

  void sweepTick();
  setInterval(() => {
    void sweepTick();
  }, 60_000);

  console.log("[ingest-sweeper] started");
}

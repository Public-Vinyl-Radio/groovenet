/**
 * The in-app worker that runs Discogs imports (#1274). Started once per server
 * process from `instrumentation.ts`; a POST also nudges it so a new import
 * starts at once instead of at the next poll.
 *
 * - It runs one import at a time per process: Discogs' rate limit is per
 *   token, so two at once would only fail each other's fetches.
 * - It claims a row with a lease (`DISCOGS_IMPORT_LEASE_SECONDS`) and renews
 *   it every quarter of that. A process that dies stops renewing; once the
 *   lease runs out the next poll, here or in another replica, claims the row
 *   again and the runner resumes from the manifest checkpoint.
 * - A worker that finds it lost its lease (a heartbeat or write matched no
 *   row) stops before the next release and writes nothing more.
 * - An import claimed more than `MAX_ATTEMPTS` times (it keeps taking its
 *   process down) is marked `interrupted`; the UI offers Resume, which queues
 *   a fresh one.
 */
import { randomUUID } from "crypto";
import { hostname } from "os";
import {
  discogsImportRepository,
  type DiscogsImportProgress,
  type DiscogsImportRepository,
  type DiscogsImportRow,
} from "@/server/repositories/discogsImportRepository";
import { runDiscogsImport, type DiscogsImportOutcome } from "@/server/services/discogsImportRunner";

export const MAX_ATTEMPTS = 3;
/** Finished imports kept per username, with their logs. */
export const KEEP_IMPORTS = 10;
const FLUSH_INTERVAL_MS = 1000;
const FLUSH_MAX_LINES = 200;

function positiveNumber(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function leaseSeconds(): number {
  return positiveNumber(process.env.DISCOGS_IMPORT_LEASE_SECONDS, 60);
}

export function pollSeconds(): number {
  return positiveNumber(process.env.DISCOGS_IMPORT_POLL_SECONDS, 5);
}

/** Thrown inside the runner once this worker no longer holds its import. */
export class LeaseLostError extends Error {
  constructor(id: number) {
    super(`Lost the lease on Discogs import ${id}`);
    this.name = "LeaseLostError";
  }
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** What the import's row says went wrong, or null for a clean run. */
export function outcomeError(outcome: DiscogsImportOutcome): string | null {
  const parts: string[] = [];
  if (outcome.ingestError) parts.push(`Auto-ingest error: ${outcome.ingestError}`);
  if (outcome.failedReleases.length > 0) {
    parts.push(`${outcome.failedReleases.length} releases failed to download`);
  }
  if (outcome.trackFailures > 0) parts.push(`${outcome.trackFailures} tracks failed to save`);
  return parts.length > 0 ? parts.join("; ") : null;
}

type WorkerDeps = {
  repo: Pick<
    DiscogsImportRepository,
    "claimNext" | "heartbeat" | "updateProgress" | "finish" | "appendLog" | "prune"
  >;
  run: typeof runDiscogsImport;
  owner: string;
  tokenSet: () => boolean;
};

export class DiscogsImportWorker {
  private busy = false;

  constructor(private deps: WorkerDeps) {}

  get owner(): string {
    return this.deps.owner;
  }

  /** Run imports until none is left to claim, if this worker is free. Returns how many ran. */
  async tick(): Promise<number> {
    if (this.busy) return 0;
    this.busy = true;
    let ran = 0;
    try {
      for (;;) {
        const job = await this.deps.repo.claimNext(this.deps.owner, leaseSeconds());
        if (!job) return ran;
        await this.run(job);
        ran += 1;
      }
    } finally {
      this.busy = false;
    }
  }

  async run(job: DiscogsImportRow): Promise<void> {
    const { repo, owner } = this.deps;
    const lease = leaseSeconds();
    let lost = false;
    let lines: string[] = [];
    let pending: DiscogsImportProgress = {};
    let flushing: Promise<void> = Promise.resolve();

    const flush = () => {
      const batch = lines;
      const patch = pending;
      lines = [];
      pending = {};
      flushing = flushing.then(async () => {
        try {
          await repo.appendLog(job.id, batch);
          if (!(await repo.updateProgress(job.id, owner, patch))) lost = true;
        } catch (error) {
          console.error("[Discogs Import] Could not record progress of %s:", job.id, error);
        }
      });
      return flushing;
    };
    const heartbeat = async () => {
      try {
        if (!(await repo.heartbeat(job.id, owner, lease))) lost = true;
      } catch (error) {
        // A database blip: the next beat tries again before the lease runs out.
        console.error("[Discogs Import] Heartbeat for %s failed:", job.id, error);
      }
    };
    const flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
    const beatTimer = setInterval(() => void heartbeat(), (lease * 1000) / 4);

    const send = (text: string) => {
      lines.push(text);
      if (lines.length >= FLUSH_MAX_LINES) void flush();
    };
    const finish = async (
      status: "completed" | "failed" | "interrupted",
      lastError: string | null,
    ) => {
      await flush();
      if (lost) return;
      await repo.finish(job.id, owner, status, lastError);
      await repo.prune(job.username, KEEP_IMPORTS).catch(() => undefined);
    };

    try {
      if (job.attempts > MAX_ATTEMPTS) {
        const reason = `Stopped after ${MAX_ATTEMPTS} restarts; resume to try again`;
        send(`Error: ${reason}\n\n`);
        await finish("interrupted", reason);
        return;
      }
      if (!this.deps.tokenSet()) {
        const reason = "Discogs credentials not set in environment";
        send(`Error: ${reason}\n\n`);
        await finish("failed", reason);
        return;
      }
      if (job.attempts > 1) {
        send(`Resuming the import after a restart (attempt ${job.attempts})\n\n`);
      }
      const outcome = await this.deps.run(job.username, {
        send,
        progress: (patch) => {
          pending = { ...pending, ...patch };
        },
        ensureActive: () => {
          if (lost) throw new LeaseLostError(job.id);
        },
      });
      pending = {
        ...pending,
        added: outcome.added,
        removed: outcome.removed,
        failed_releases: outcome.failedReleases.length,
      };
      await finish("completed", outcomeError(outcome));
    } catch (error) {
      if (error instanceof LeaseLostError || lost) {
        console.log(`[Discogs Import] ${message(error)}; another worker carries on`);
        return;
      }
      console.error("[Discogs Import] Import %s for %s failed:", job.id, job.username, error);
      send(`Error: ${message(error)}\n\n`);
      await finish("failed", message(error));
    } finally {
      clearInterval(flushTimer);
      clearInterval(beatTimer);
    }
  }
}

type WorkerState = { worker: DiscogsImportWorker; timer: ReturnType<typeof setInterval> | null };
// On globalThis, not module scope: the instrumentation bundle and the route
// bundles can each load their own copy of this module in one process.
const STATE_KEY = Symbol.for("groovenet.discogsImportWorker");
type GlobalWithWorker = typeof globalThis & { [STATE_KEY]?: WorkerState };

function state(): WorkerState {
  const g = globalThis as GlobalWithWorker;
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = {
      worker: new DiscogsImportWorker({
        repo: discogsImportRepository,
        run: runDiscogsImport,
        owner: `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`,
        tokenSet: () => Boolean(process.env.DISCOGS_USER_TOKEN?.trim()),
      }),
      timer: null,
    };
  }
  return g[STATE_KEY];
}

function tickSafely(worker: DiscogsImportWorker): void {
  worker.tick().catch((error) => console.error("[Discogs Import] Worker tick failed:", error));
}

/** Poll for imports, once per process however often it is called. */
export function startDiscogsImportWorker(): void {
  const current = state();
  if (current.timer) return;
  current.timer = setInterval(() => tickSafely(current.worker), pollSeconds() * 1000);
  current.timer.unref?.();
  // Pick up what a restart left behind (once its lease runs out) or queued.
  tickSafely(current.worker);
}

/** Start the next import now if this process is free; the poll would within seconds anyway. */
export function kickDiscogsImportWorker(): void {
  startDiscogsImportWorker();
  tickSafely(state().worker);
}

/** Tests only. */
export function resetDiscogsImportWorkerForTests(): void {
  const g = globalThis as GlobalWithWorker;
  if (g[STATE_KEY]?.timer) clearInterval(g[STATE_KEY].timer);
  delete g[STATE_KEY];
}

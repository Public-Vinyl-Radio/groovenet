import { randomUUID, createHash } from "crypto";
import { getRedisConnection } from "@/lib/redis";
import { embeddingsRepository } from "@/server/repositories/embeddingsRepository";
import { checkEmbeddingProvider } from "@/server/services/embeddingHealthService";
import { runEmbeddingBatch } from "@/server/services/embeddingBatchService";
import type {
  EmbeddingBackfillRun,
  EmbeddingBackfillRunSummary,
  EmbeddingFailedJob,
  EmbeddingJob,
  EmbeddingJobKind,
  EmbeddingQueueHealth,
  EmbeddingQueueKindCounts,
  EmbeddingQueueLaneDepths,
  EmbeddingQueueStatus,
} from "@/types/embeddingQueue";

/**
 * Background queue for embedding generation (#385).
 *
 * Generation used to happen inline in request handlers, so a provider
 * outage was invisible — every call failed, `console.error`'d, and the
 * track stayed without an embedding until someone ran the manual backfill
 * script. This makes it a retryable job, like downloads and fingerprints.
 *
 * No separate in-flight ledger: a crash mid-job just loses that one job,
 * and `sweepTick`'s periodic "missing embedding" pass (same shape as
 * `fingerprintBackfillService`) re-enqueues it. Cheap to redo, so not worth
 * the weight of a tracked-job system like `redisJobService`.
 */

const QUEUE_KEY = "embedding_queue"; // Existing bulk list; preserve jobs across deploys.
const INTERACTIVE_KEY = "embedding_queue:interactive";
const SYNC_KEY = "embedding_queue:sync";
const QUEUE_KEYS = [INTERACTIVE_KEY, SYNC_KEY, QUEUE_KEY] as const;
export type EmbeddingQueuePriority = "interactive" | "sync" | "bulk";

function queueKey(priority: EmbeddingQueuePriority): string {
  return priority === "interactive" ? INTERACTIVE_KEY : priority === "sync" ? SYNC_KEY : QUEUE_KEY;
}
const RETRY_KEY = "embedding_retry";
const FAILED_KEY = "embedding_queue:failed";
const PAUSED_KEY = "embedding_queue:paused";
const LAST_ERROR_KEY = "embedding_queue:last_error";
const RUN_KEY_PREFIX = "embedding_backfill_run:";

const MAX_FAILED_ENTRIES = 100;
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 30 * 60_000;
/** Matches `fingerprintIndexService.RUN_TTL_SECONDS` — a day is plenty to poll a run. */
const RUN_TTL_SECONDS = 86_400;
/**
 * Head-of-list sample size for the #451 "counts by kind" breakdown. A bulk
 * re-embed can leave 20k+ jobs on `embedding_queue`; LRANGE-ing all of them on
 * every `/jobs` poll would cost more than the dashboard is worth, so this
 * samples the head of each lane instead and says so (`by_kind_sampled`).
 */
const KIND_SAMPLE_SIZE = 500;
/** Cap on how many backfill runs #451's queue view reports as "active" at once. */
const MAX_ACTIVE_RUNS = 20;

function runKey(runId: string): string {
  return `${RUN_KEY_PREFIX}${runId}`;
}

/** Stable id for a failed-queue entry, derived from its stored JSON — there's no row to key off. */
function failedJobId(raw: string): string {
  return createHash("sha1").update(raw).digest("hex").slice(0, 12);
}

type QueuedJob = EmbeddingJob & { attempts?: number; priority: EmbeddingQueuePriority };

function positiveNumber(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function queueIntervalSeconds(): number {
  return positiveNumber(process.env.EMBEDDING_QUEUE_INTERVAL_SECONDS, 10);
}

export function queueBatchSize(): number {
  return positiveNumber(process.env.EMBEDDING_QUEUE_BATCH_SIZE, 100);
}

export function sweepIntervalMinutes(): number {
  return positiveNumber(process.env.EMBEDDING_SWEEP_INTERVAL_MINUTES, 30);
}

function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
}

/**
 * A 401 or revoked/rejected organization will fail every job with the same
 * key, so retrying burns attempts for nothing — pause instead. Everything
 * else (429, 5xx, timeouts, network blips) is treated as transient.
 */
export function isAuthError(message: string): boolean {
  return /invalid_organization|incorrect api key|invalid_api_key|unauthorized|\b401\b/i.test(
    message
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class EmbeddingQueueService {
  private redis = getRedisConnection();

  async enqueue(jobs: EmbeddingJob[], priority: EmbeddingQueuePriority = "interactive"): Promise<void> {
    if (jobs.length === 0) return;
    const pipeline = this.redis.pipeline();
    for (const job of jobs) {
      pipeline.lpush(queueKey(priority), JSON.stringify(job));
    }
    await pipeline.exec();
  }

  private async pushBack(jobs: QueuedJob[]): Promise<void> {
    const pipeline = this.redis.pipeline();
    // LPUSH/RPOP is FIFO. Restore popped jobs in reverse order so an auth
    // pause resumes them in the same order as before the failed tick.
    for (const job of [...jobs].reverse()) {
      pipeline.rpush(queueKey(job.priority), JSON.stringify(job));
    }
    await pipeline.exec();
  }

  private async recordFailure(job: QueuedJob, message: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.lpush(
      FAILED_KEY,
      JSON.stringify({ ...job, error: message, failedAt: Date.now() })
    );
    pipeline.ltrim(FAILED_KEY, 0, MAX_FAILED_ENTRIES - 1);
    await pipeline.exec();

    if (job.run_id) {
      const key = runKey(job.run_id);
      const runPipeline = this.redis.pipeline();
      runPipeline.hset(key, "updated_at", Date.now());
      runPipeline.hincrby(key, "failed", 1);
      runPipeline.rpush(`${key}:errors`, `${job.track_id}: ${message}`);
      await runPipeline.exec();
    }
  }

  /** Bump a backfill run's success/skipped counter for one settled job. */
  private async recordRunProgress(runId: string, updated: boolean): Promise<void> {
    const key = runKey(runId);
    const pipeline = this.redis.pipeline();
    pipeline.hset(key, "updated_at", Date.now());
    pipeline.hincrby(key, updated ? "success" : "skipped", 1);
    await pipeline.exec();
  }

  private async setLastError(message: string): Promise<void> {
    await this.redis.set(
      LAST_ERROR_KEY,
      JSON.stringify({ message, at: Date.now() })
    );
  }

  private async pause(message: string): Promise<void> {
    await this.redis.set(PAUSED_KEY, message);
    await this.setLastError(message);
  }

  private async isPaused(): Promise<string | null> {
    return this.redis.get(PAUSED_KEY);
  }

  /** Move any retry-queue entries whose backoff has elapsed back onto the queue. */
  private async promoteDueRetries(now: number): Promise<void> {
    const due = await this.redis.zrangebyscore(RETRY_KEY, 0, now);
    if (due.length === 0) return;

    const pipeline = this.redis.pipeline();
    for (const member of due) {
      try {
        const job = JSON.parse(member) as Partial<QueuedJob>;
        pipeline.rpush(queueKey(job.priority ?? "bulk"), member);
      } catch {
        pipeline.rpush(QUEUE_KEY, member);
      }
    }
    pipeline.zrem(RETRY_KEY, ...due);
    await pipeline.exec();
  }

  private async scheduleRetry(
    job: QueuedJob,
    now: number,
    message: string
  ): Promise<void> {
    const attempts = (job.attempts ?? 0) + 1;
    const retryJob: QueuedJob = { ...job, attempts };

    if (attempts >= MAX_ATTEMPTS) {
      // `attempts` is already in the stored JSON, so the error field carries
      // the real cause — useful on its own, and essential for a backfill
      // run's error list, which would otherwise just say "gave up" for every
      // track with no hint why.
      await this.recordFailure(retryJob, message);
      return;
    }

    await this.redis.zadd(
      RETRY_KEY,
      now + backoffMs(attempts),
      JSON.stringify(retryJob)
    );
  }

  /**
   * One processing tick: promote due retries, bail out early while paused
   * (re-probing the provider so a fixed key auto-resumes), then drain up to
   * `queueBatchSize()` jobs.
   */
  async tick(now: number = Date.now()): Promise<void> {
    await this.promoteDueRetries(now);

    const pausedError = await this.isPaused();
    if (pausedError) {
      try {
        await checkEmbeddingProvider();
        await this.redis.del(PAUSED_KEY);
      } catch {
        return; // Still broken — try again next tick, no jobs touched.
      }
    }

    const batch: QueuedJob[] = [];
    for (let i = 0; i < queueBatchSize(); i += 1) {
      let raw: string | null = null;
      let priority: EmbeddingQueuePriority = "bulk";
      for (const candidate of ["interactive", "sync", "bulk"] as const) {
        raw = await this.redis.rpop(queueKey(candidate));
        if (raw) {
          priority = candidate;
          break;
        }
      }
      if (!raw) break;
      try {
        batch.push({ ...(JSON.parse(raw) as EmbeddingJob & { attempts?: number }), priority });
      } catch (error) {
        console.error("[embedding-queue] dropping unparseable job:", raw, error);
      }
    }

    const results = await runEmbeddingBatch(batch);
    const requeue: QueuedJob[] = [];
    let authError: string | null = null;
    for (let i = 0; i < batch.length; i += 1) {
      const job = batch[i];
      const result = results[i];
      if (result.pending) {
        requeue.push(job);
      } else if (result.error !== undefined) {
        const message = errorMessage(result.error);
        // Previously only written to Redis (`last_error`/`failed`), so a run
        // of failures never showed up in the app's own logs (#451).
        console.error(
          `[embedding-queue] job failed (track ${job.track_id}, kind ${job.kind}):`,
          message
        );
        if (isAuthError(message)) {
          authError = message;
          requeue.push(job);
        } else {
          await this.setLastError(message);
          await this.scheduleRetry(job, now, message);
        }
      } else if (job.run_id) {
        await this.recordRunProgress(job.run_id, result.updated);
      }
    }
    if (authError) {
      console.error(`[embedding-queue] pausing queue: ${authError}`);
      await this.pause(authError);
    }
    if (requeue.length > 0) await this.pushBack(requeue);
  }

  /**
   * Backstop for #385, same shape as `fingerprintBackfillService`'s missing
   * pass: finds tracks missing an identity, audio-vibe or context embedding
   * and enqueues them. Covers lost Redis state and anything enqueued before
   * the worker ever ran.
   *
   * Skips while any job is still queued or waiting to retry (#419). Every
   * missing track is already among them, and `enqueue` doesn't dedupe, so a
   * sweep during a big backfill used to add another copy of the whole
   * backlog. The no-op copies took the batch slots, and the queue grew faster
   * than it drained. A lost job is picked up by the first sweep after the
   * queue empties.
   */
  async sweepTick(): Promise<{ queued: number; pending: number }> {
    const [queueLengths, retrying] = await Promise.all([
      Promise.all(QUEUE_KEYS.map((key) => this.redis.llen(key))),
      this.redis.zcard(RETRY_KEY),
    ]);
    const pending = queueLengths.reduce((sum, count) => sum + count, 0) + retrying;
    if (pending > 0) return { queued: 0, pending };

    const [missingIdentity, missingAudioVibe, missingContext] = await Promise.all([
      embeddingsRepository.listTracksNeedingIdentityEmbeddings({}),
      embeddingsRepository.listTracksNeedingAudioVibeEmbeddings({}),
      embeddingsRepository.listTracksNeedingContextEmbeddings({}),
    ]);

    const jobs: EmbeddingJob[] = [
      ...missingIdentity.map((t) => ({ ...t, kind: "identity" as const })),
      ...missingAudioVibe.map((t) => ({ ...t, kind: "audio_vibe" as const })),
      ...missingContext.map((t) => ({ ...t, kind: "context" as const })),
    ];

    await this.enqueue(jobs, "bulk");
    return { queued: jobs.length, pending: 0 };
  }

  /**
   * Start a trackable backfill run (#388): stamps every job with a fresh
   * `run_id`, seeds its counters, enqueues, and returns immediately — the
   * same "queue now, poll progress separately" shape as
   * `fingerprintIndexService.startRun`. Reuses the plain `embedding_queue`,
   * so a backfill gets the same retry/backoff/pause protection as any other
   * job instead of a separate unretried code path.
   */
  async startBackfillRun(jobs: EmbeddingJob[]): Promise<EmbeddingBackfillRun> {
    const runId = randomUUID();
    const key = runKey(runId);
    const now = Date.now();

    const seedPipeline = this.redis.pipeline();
    seedPipeline.hset(key, {
      run_id: runId,
      queued: jobs.length,
      success: 0,
      skipped: 0,
      failed: 0,
      started_at: now,
      updated_at: now,
    });
    seedPipeline.expire(key, RUN_TTL_SECONDS);
    await seedPipeline.exec();

    await this.enqueue(jobs.map((job) => ({ ...job, run_id: runId })), "bulk");

    return {
      run_id: runId,
      queued: jobs.length,
      success: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      started_at: now,
      updated_at: now,
      complete: jobs.length === 0,
    };
  }

  /** Counters for one backfill run, as the queue worker has left them. */
  async getBackfillRun(runId: string): Promise<EmbeddingBackfillRun | null> {
    const key = runKey(runId);
    const [stored, errors] = await Promise.all([
      this.redis.hgetall(key),
      this.redis.lrange(`${key}:errors`, 0, -1),
    ]);
    if (!stored || Object.keys(stored).length === 0) return null;

    const queued = toInt(stored.queued);
    const success = toInt(stored.success);
    const skipped = toInt(stored.skipped);
    const failed = toInt(stored.failed);

    return {
      run_id: stored.run_id ?? runId,
      queued,
      success,
      skipped,
      failed,
      errors,
      started_at: toInt(stored.started_at),
      updated_at: toInt(stored.updated_at),
      complete: success + skipped + failed >= queued,
    };
  }

  /** Depth of each priority lane, in the order `tick()` drains them. */
  private async laneDepths(): Promise<EmbeddingQueueLaneDepths> {
    const [interactive, sync, bulk] = await Promise.all(
      QUEUE_KEYS.map((key) => this.redis.llen(key))
    );
    return { interactive, sync, bulk };
  }

  async getQueueHealth(): Promise<EmbeddingQueueHealth> {
    const [lanes, retryLen, failedLen, pausedError, lastErrorRaw] =
      await Promise.all([
        this.laneDepths(),
        this.redis.zcard(RETRY_KEY),
        this.redis.llen(FAILED_KEY),
        this.redis.get(PAUSED_KEY),
        this.redis.get(LAST_ERROR_KEY),
      ]);

    let lastError: string | undefined;
    if (lastErrorRaw) {
      try {
        lastError = (JSON.parse(lastErrorRaw) as { message: string }).message;
      } catch {
        lastError = lastErrorRaw;
      }
    }

    return {
      queueDepth: lanes.interactive + lanes.sync + lanes.bulk + retryLen,
      failedCount: failedLen,
      paused: !!pausedError,
      lastError: pausedError ?? lastError,
    };
  }

  /**
   * Counts by job kind, sampled from the head of each lane (#451) rather than
   * LRANGE-ing the whole list — see `KIND_SAMPLE_SIZE`. `by_kind_sampled` is
   * true whenever any lane is longer than the sample, so the UI can say "of
   * the first 500" instead of implying an exact count.
   */
  private async sampleKindCounts(): Promise<{
    counts: EmbeddingQueueKindCounts;
    sampled: boolean;
  }> {
    const counts: EmbeddingQueueKindCounts = { identity: 0, audio_vibe: 0, context: 0 };
    let sampled = false;

    const perLane = await Promise.all(
      QUEUE_KEYS.map(async (key) => {
        const [len, entries] = await Promise.all([
          this.redis.llen(key),
          this.redis.lrange(key, 0, KIND_SAMPLE_SIZE - 1),
        ]);
        return { len, entries };
      })
    );

    for (const { len, entries } of perLane) {
      if (len > entries.length) sampled = true;
      for (const raw of entries) {
        try {
          const kind = (JSON.parse(raw) as Partial<EmbeddingJob>).kind;
          if (kind && kind in counts) counts[kind as EmbeddingJobKind] += 1;
        } catch {
          // An unparseable entry is `tick()`'s problem to drop, not this sample's.
        }
      }
    }

    return { counts, sampled };
  }

  private async scanRunKeys(): Promise<string[]> {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [nextCursor, batch] = await this.redis.scan(
        cursor,
        "MATCH",
        `${RUN_KEY_PREFIX}*`,
        "COUNT",
        1000
      );
      cursor = nextCursor;
      keys.push(...batch.filter((key) => !key.endsWith(":errors")));
    } while (cursor !== "0");
    return keys;
  }

  /** Backfill runs (#388) still in progress, newest first, for #451's queue view. */
  async listActiveBackfillRuns(limit: number = MAX_ACTIVE_RUNS): Promise<EmbeddingBackfillRunSummary[]> {
    const keys = await this.scanRunKeys();
    if (keys.length === 0) return [];

    const stored = await Promise.all(keys.map((key) => this.redis.hgetall(key)));
    const runs: EmbeddingBackfillRunSummary[] = [];
    stored.forEach((hash, i) => {
      if (!hash || Object.keys(hash).length === 0) return;
      const queued = toInt(hash.queued);
      const success = toInt(hash.success);
      const skipped = toInt(hash.skipped);
      const failed = toInt(hash.failed);
      if (success + skipped + failed >= queued) return; // complete — not "active"

      runs.push({
        run_id: hash.run_id ?? keys[i].slice(RUN_KEY_PREFIX.length),
        queued,
        success,
        skipped,
        failed,
        started_at: toInt(hash.started_at),
        updated_at: toInt(hash.updated_at),
      });
    });

    return runs.sort((a, b) => b.started_at - a.started_at).slice(0, limit);
  }

  /** The `embedding_queue:failed` list (#451), each entry given a stable id for the retry action. */
  async getFailedJobs(limit: number = MAX_FAILED_ENTRIES): Promise<EmbeddingFailedJob[]> {
    const raws = await this.redis.lrange(FAILED_KEY, 0, limit - 1);
    const jobs: EmbeddingFailedJob[] = [];
    for (const raw of raws) {
      try {
        const parsed = JSON.parse(raw) as QueuedJob & { error: string; failedAt: number };
        jobs.push({
          id: failedJobId(raw),
          track_id: parsed.track_id,
          friend_id: parsed.friend_id,
          kind: parsed.kind,
          run_id: parsed.run_id,
          attempts: parsed.attempts ?? 0,
          error: parsed.error,
          failed_at: parsed.failedAt,
        });
      } catch {
        // Drop an unparseable entry rather than let it break the whole list.
      }
    }
    return jobs;
  }

  /**
   * Re-enqueue the failed entries matching `ids` and drop them from the
   * failed list. Attempts reset to 0 — they already spent `MAX_ATTEMPTS`
   * getting here, so a fresh attempt budget is the point of asking for a
   * retry. Looks the entry up by re-reading the failed list rather than
   * trusting a client-supplied job body, so retry can't be used to inject an
   * arbitrary job.
   */
  async retryFailedJobs(ids: string[]): Promise<{ retried: string[]; not_found: string[] }> {
    if (ids.length === 0) return { retried: [], not_found: [] };
    const wanted = new Set(ids);
    const raws = await this.redis.lrange(FAILED_KEY, 0, MAX_FAILED_ENTRIES - 1);

    const matches: { id: string; raw: string; retryJob: EmbeddingJob & { priority: EmbeddingQueuePriority; attempts: number } }[] = [];
    for (const raw of raws) {
      const id = failedJobId(raw);
      if (!wanted.has(id)) continue;

      let parsed: (QueuedJob & { error?: string; failedAt?: number }) | null = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!parsed) continue;

      const retryJob: EmbeddingJob & { priority: EmbeddingQueuePriority; attempts: number } = {
        track_id: parsed.track_id,
        friend_id: parsed.friend_id,
        kind: parsed.kind,
        priority: parsed.priority ?? "interactive",
        attempts: 0,
      };
      if (parsed.run_id) retryJob.run_id = parsed.run_id;
      if (parsed.force) retryJob.force = parsed.force;

      matches.push({ id, raw, retryJob });
    }

    if (matches.length > 0) {
      const pipeline = this.redis.pipeline();
      for (const { raw, retryJob } of matches) {
        pipeline.lrem(FAILED_KEY, 1, raw);
        pipeline.lpush(queueKey(retryJob.priority), JSON.stringify(retryJob));
      }
      await pipeline.exec();
    }

    const retried = matches.map((m) => m.id);
    const retriedSet = new Set(retried);
    return { retried, not_found: ids.filter((id) => !retriedSet.has(id)) };
  }

  /**
   * Everything #451's `/jobs` Embeddings section shows, in one call — lane
   * depths, retry/failed/pause state, an approximate drain rate and ETA from
   * the configured interval and batch size, the kind breakdown, active
   * backfill runs and the failed list itself.
   */
  async getQueueStatus(): Promise<EmbeddingQueueStatus> {
    const [health, lanes, kindSample, activeRuns, failed] = await Promise.all([
      this.getQueueHealth(),
      this.laneDepths(),
      this.sampleKindCounts(),
      this.listActiveBackfillRuns(),
      this.getFailedJobs(),
    ]);

    const intervalSeconds = queueIntervalSeconds();
    const batchSize = queueBatchSize();
    const drainRatePerMinute = health.paused ? 0 : (batchSize / intervalSeconds) * 60;
    const laneTotal = lanes.interactive + lanes.sync + lanes.bulk;
    const retrying = Math.max(0, health.queueDepth - laneTotal);
    const totalBacklog = laneTotal + retrying;
    let etaSeconds: number | null;
    if (totalBacklog === 0) {
      etaSeconds = 0;
    } else if (drainRatePerMinute <= 0) {
      etaSeconds = null;
    } else {
      etaSeconds = Math.ceil((totalBacklog / drainRatePerMinute) * 60);
    }

    return {
      lanes,
      retrying,
      failed_count: health.failedCount,
      paused: health.paused,
      pause_reason: health.paused ? health.lastError : undefined,
      last_error: health.lastError,
      interval_seconds: intervalSeconds,
      batch_size: batchSize,
      drain_rate_per_minute: drainRatePerMinute,
      eta_seconds: etaSeconds,
      by_kind: kindSample.counts,
      by_kind_sampled: kindSample.sampled,
      active_backfill_runs: activeRuns,
      failed,
    };
  }

  /** Test helper: wipe all queue state. */
  async resetQueueState(): Promise<void> {
    await this.redis.del(...QUEUE_KEYS, RETRY_KEY, FAILED_KEY, PAUSED_KEY, LAST_ERROR_KEY);
  }
}

function toInt(value: string | undefined): number {
  const parsed = parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const embeddingQueueService = new EmbeddingQueueService();

const GLOBAL_WORKER_KEY = "__groovenetEmbeddingQueueStarted";

type GlobalWithWorker = typeof globalThis & {
  [GLOBAL_WORKER_KEY]?: boolean;
};

let lastSweepAtMs = 0;

/** Exported for tests: the sweep's interval bookkeeping is module state. */
export function resetSweepClock(): void {
  lastSweepAtMs = 0;
}

async function sweepIfDue(now: number): Promise<void> {
  if (now - lastSweepAtMs < sweepIntervalMinutes() * 60_000) return;
  lastSweepAtMs = now;

  try {
    const { queued, pending } = await embeddingQueueService.sweepTick();
    if (pending > 0) {
      console.log(`[embedding-queue] sweep skipped: ${pending} job(s) still pending`);
    } else if (queued > 0) {
      console.log(`[embedding-queue] sweep queued ${queued} track(s) missing an embedding`);
    }
  } catch (error) {
    console.error("[embedding-queue] sweep tick failed:", error);
  }
}

/** Start the embedding queue worker, once per process. */
export function startEmbeddingQueueWorker(): void {
  const g = globalThis as GlobalWithWorker;
  if (g[GLOBAL_WORKER_KEY]) return;
  g[GLOBAL_WORKER_KEY] = true;
  let tickInFlight = false;

  const run = () => {
    if (tickInFlight) return;
    tickInFlight = true;
    const now = Date.now();
    void (async () => {
      try {
        await embeddingQueueService.tick(now);
      } catch (error) {
        console.error("[embedding-queue] tick failed:", error);
      }
      // The sweep must see committed embeddings, not an emptied list whose
      // popped jobs are still waiting for the provider or database.
      await sweepIfDue(now);
    })().finally(() => { tickInFlight = false; });
  };

  run();
  setInterval(run, queueIntervalSeconds() * 1000);

  console.log("[embedding-queue] started");
}

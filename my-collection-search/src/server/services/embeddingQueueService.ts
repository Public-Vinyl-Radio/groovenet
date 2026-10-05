import { randomUUID } from "crypto";
import { getRedisConnection } from "@/lib/redis";
import { generateAndStoreIdentityEmbedding } from "@/lib/identity-embedding";
import { generateAndStoreAudioVibeEmbedding } from "@/lib/audio-vibe-embedding";
import { generateAndStoreContextEmbedding } from "@/lib/context-embedding";
import { embeddingsRepository } from "@/server/repositories/embeddingsRepository";
import { checkEmbeddingProvider } from "@/server/services/embeddingHealthService";
import type {
  EmbeddingBackfillRun,
  EmbeddingJob,
  EmbeddingQueueHealth,
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

const QUEUE_KEY = "embedding_queue";
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

function runKey(runId: string): string {
  return `${RUN_KEY_PREFIX}${runId}`;
}

type QueuedJob = EmbeddingJob & { attempts?: number };

function positiveNumber(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function queueIntervalSeconds(): number {
  return positiveNumber(process.env.EMBEDDING_QUEUE_INTERVAL_SECONDS, 10);
}

export function queueBatchSize(): number {
  return positiveNumber(process.env.EMBEDDING_QUEUE_BATCH_SIZE, 5);
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

/** `updated: false` means the generator skipped a track whose source hash was unchanged. */
async function runJob(job: EmbeddingJob): Promise<{ updated: boolean }> {
  if (job.kind === "identity") {
    return generateAndStoreIdentityEmbedding(job.track_id, job.friend_id, job.force);
  }
  if (job.kind === "audio_vibe") {
    return generateAndStoreAudioVibeEmbedding(job.track_id, job.friend_id, job.force);
  }
  if (job.kind === "context") {
    return generateAndStoreContextEmbedding(job.track_id, job.friend_id, job.force);
  }

  // A "prompt" job left in Redis from before the legacy column was removed
  // (#393): nothing reads it any more, so drop it rather than retry forever.
  return { updated: false };
}

export class EmbeddingQueueService {
  private redis = getRedisConnection();

  async enqueue(jobs: EmbeddingJob[]): Promise<void> {
    if (jobs.length === 0) return;
    const pipeline = this.redis.pipeline();
    for (const job of jobs) {
      pipeline.lpush(QUEUE_KEY, JSON.stringify(job));
    }
    await pipeline.exec();
  }

  private async pushBack(jobs: QueuedJob[]): Promise<void> {
    const pipeline = this.redis.pipeline();
    for (const job of jobs) {
      pipeline.rpush(QUEUE_KEY, JSON.stringify(job));
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
      pipeline.rpush(QUEUE_KEY, member);
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
      const raw = await this.redis.rpop(QUEUE_KEY);
      if (!raw) break;
      try {
        batch.push(JSON.parse(raw) as QueuedJob);
      } catch (error) {
        console.error("[embedding-queue] dropping unparseable job:", raw, error);
      }
    }

    for (let i = 0; i < batch.length; i += 1) {
      const job = batch[i];
      try {
        const { updated } = await runJob(job);
        if (job.run_id) await this.recordRunProgress(job.run_id, updated);
      } catch (error) {
        const message = errorMessage(error);
        if (isAuthError(message)) {
          await this.pause(message);
          // The queue is paused now — put this job and everything still
          // unprocessed this tick back, untouched, for when it resumes.
          await this.pushBack(batch.slice(i));
          return;
        }
        await this.setLastError(message);
        await this.scheduleRetry(job, now, message);
      }
    }
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
    const [queued, retrying] = await Promise.all([
      this.redis.llen(QUEUE_KEY),
      this.redis.zcard(RETRY_KEY),
    ]);
    const pending = queued + retrying;
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

    await this.enqueue(jobs);
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

    await this.enqueue(jobs.map((job) => ({ ...job, run_id: runId })));

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

  async getQueueHealth(): Promise<EmbeddingQueueHealth> {
    const [queueLen, retryLen, failedLen, pausedError, lastErrorRaw] =
      await Promise.all([
        this.redis.llen(QUEUE_KEY),
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
      queueDepth: queueLen + retryLen,
      failedCount: failedLen,
      paused: !!pausedError,
      lastError: pausedError ?? lastError,
    };
  }

  /** Test helper: wipe all queue state. */
  async resetQueueState(): Promise<void> {
    await this.redis.del(QUEUE_KEY, RETRY_KEY, FAILED_KEY, PAUSED_KEY, LAST_ERROR_KEY);
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

  const run = () => {
    const now = Date.now();
    void embeddingQueueService
      .tick(now)
      .catch((error) => console.error("[embedding-queue] tick failed:", error));
    void sweepIfDue(now);
  };

  run();
  setInterval(run, queueIntervalSeconds() * 1000);

  console.log("[embedding-queue] started");
}

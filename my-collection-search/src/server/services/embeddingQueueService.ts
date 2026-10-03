import { getRedisConnection } from "@/lib/redis";
import { generateAndStoreIdentityEmbedding } from "@/lib/identity-embedding";
import { generateAndStoreAudioVibeEmbedding } from "@/lib/audio-vibe-embedding";
import { getTrackEmbedding } from "@/lib/track-embedding";
import { trackRepository } from "@/server/repositories/trackRepository";
import { embeddingsRepository } from "@/server/repositories/embeddingsRepository";
import { checkEmbeddingProvider } from "@/server/services/embeddingHealthService";
import type {
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

const MAX_FAILED_ENTRIES = 100;
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 30 * 60_000;

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

async function runJob(job: EmbeddingJob): Promise<void> {
  if (job.kind === "identity") {
    await generateAndStoreIdentityEmbedding(job.track_id, job.friend_id);
    return;
  }
  if (job.kind === "audio_vibe") {
    await generateAndStoreAudioVibeEmbedding(job.track_id, job.friend_id);
    return;
  }

  // "prompt": the legacy tracks.embedding column, keyed off settings-editable
  // free text rather than a source hash, so there's no "unchanged" skip here.
  const track = await trackRepository.findTrackByTrackIdAndFriendIdRaw(
    job.track_id,
    job.friend_id
  );
  if (!track) {
    throw new Error(`Track not found: ${job.track_id} (friend_id: ${job.friend_id})`);
  }
  const embedding = await getTrackEmbedding(track);
  await trackRepository.updateTrackEmbedding(job.track_id, job.friend_id, embedding);
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

  private async scheduleRetry(job: QueuedJob, now: number): Promise<void> {
    const attempts = (job.attempts ?? 0) + 1;
    const retryJob: QueuedJob = { ...job, attempts };

    if (attempts >= MAX_ATTEMPTS) {
      await this.recordFailure(retryJob, `Giving up after ${attempts} attempts`);
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
        await runJob(job);
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
        await this.scheduleRetry(job, now);
      }
    }
  }

  /**
   * Backstop for #385, same shape as `fingerprintBackfillService`'s missing
   * pass: finds tracks with no identity/audio-vibe row at all and enqueues
   * them. Covers lost Redis state and anything enqueued before the worker
   * ever ran. Idempotent — a track already queued or already embedded is a
   * no-op either way.
   */
  async sweepTick(): Promise<{ queued: number }> {
    const [missingIdentity, missingAudioVibe] = await Promise.all([
      embeddingsRepository.listTracksNeedingIdentityEmbeddings({}),
      embeddingsRepository.listTracksNeedingAudioVibeEmbeddings({}),
    ]);

    const jobs: EmbeddingJob[] = [
      ...missingIdentity.map((t) => ({ ...t, kind: "identity" as const })),
      ...missingAudioVibe.map((t) => ({ ...t, kind: "audio_vibe" as const })),
    ];

    await this.enqueue(jobs);
    return { queued: jobs.length };
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
    const { queued } = await embeddingQueueService.sweepTick();
    if (queued > 0) {
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

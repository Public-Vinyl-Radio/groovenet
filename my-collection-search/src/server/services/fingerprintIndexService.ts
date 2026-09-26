import { randomUUID } from "crypto";
import { getRedisConnection } from "@/lib/redis";
import { fingerprintRepository } from "@/server/repositories/fingerprintRepository";
import type {
  FingerprintEngine,
  FingerprintIndexRun,
  FingerprintIndexScope,
} from "@/types/fingerprint";

/**
 * Deliberately not `download_queue`, and not `fingerprint_queue` either. A full
 * library pass is thousands of jobs deep, and `fingerprint-service` pops both
 * of its lists in one BRPOP with the live queue first — so a vinyl chunk
 * captured mid-run is served between two reference tracks instead of behind all
 * of them.
 */
export const INDEX_QUEUE_KEY =
  process.env.FINGERPRINT_INDEX_QUEUE_KEY || "fingerprint_index_queue";

/** Published by the worker on its heartbeat cycle; see `publish_engine`. */
export const ENGINE_KEY = process.env.FINGERPRINT_ENGINE_KEY || "fingerprint:engine";

export const RUN_KEY_PREFIX =
  process.env.FINGERPRINT_INDEX_RUN_PREFIX || "fpindex:run:";

export const RUN_TTL_SECONDS = parseInt(
  process.env.FINGERPRINT_INDEX_RUN_TTL || "86400",
  10
);

/**
 * Pushed in batches rather than one pipeline of 3,653. Keeps a single Redis
 * round trip bounded in size without making the enqueue itself slow.
 */
const ENQUEUE_BATCH_SIZE = 500;

export class NoFingerprintEngineError extends Error {
  constructor() {
    super(
      "No fingerprint engine registered. Is fingerprint-service running? " +
        "It advertises its engine and version on its heartbeat cycle."
    );
    this.name = "NoFingerprintEngineError";
  }
}

export function runKey(runId: string): string {
  return `${RUN_KEY_PREFIX}${runId}`;
}

function describeScope(scope: FingerprintIndexScope): string {
  switch (scope.kind) {
    case "track":
      return `track:${scope.track_id}`;
    case "release":
      return `release:${scope.release_id}`;
    default:
      return scope.kind;
  }
}

export class FingerprintIndexService {
  private redis = getRedisConnection();

  /**
   * Which engine the worker is currently running.
   *
   * The app never configures this. `fingerprint_type` and `fingerprint_version`
   * are attributes of the matcher class in `fingerprint-service`, and a second
   * copy in this app's env is precisely how half a library ends up indexed
   * under a version nothing will ever query. The key carries the heartbeat's
   * TTL, so a stopped worker stops advertising and this returns null rather
   * than a stale identity.
   */
  async getEngine(): Promise<FingerprintEngine | null> {
    const stored = await this.redis.hgetall(ENGINE_KEY);
    if (!stored?.fingerprint_type || !stored?.fingerprint_version) return null;
    return {
      fingerprint_type: stored.fingerprint_type,
      fingerprint_version: stored.fingerprint_version,
    };
  }

  /**
   * Resolve a scope to candidates and queue one job per track (#277).
   *
   * Each job carries the hash stored for that track under the active engine, so
   * the worker can decide skip-or-regenerate from the file in front of it
   * without asking back. That is what makes a second run free: it queues the
   * same jobs, and every one of them skips.
   */
  async startRun(
    scope: FingerprintIndexScope,
    options: { force?: boolean } = {}
  ): Promise<FingerprintIndexRun> {
    const engine = await this.getEngine();
    if (!engine) throw new NoFingerprintEngineError();

    const [candidates, unindexable] = await Promise.all([
      fingerprintRepository.listIndexCandidates(scope, engine),
      fingerprintRepository.countUnindexableTracks(scope),
    ]);

    const runId = randomUUID();
    const now = Date.now();
    const key = runKey(runId);

    // Seed before enqueuing, or a fast worker could increment a counter on a
    // run the status endpoint does not yet know the size of.
    await this.redis
      .multi()
      .hset(key, {
        run_id: runId,
        scope: describeScope(scope),
        fingerprint_type: engine.fingerprint_type,
        fingerprint_version: engine.fingerprint_version,
        queued: String(candidates.length),
        unindexable: String(unindexable),
        started_at: String(now),
        updated_at: String(now),
      })
      .expire(key, RUN_TTL_SECONDS)
      .exec();

    for (let i = 0; i < candidates.length; i += ENQUEUE_BATCH_SIZE) {
      const batch = candidates.slice(i, i + ENQUEUE_BATCH_SIZE);
      const pipeline = this.redis.pipeline();
      for (const candidate of batch) {
        pipeline.lpush(
          INDEX_QUEUE_KEY,
          JSON.stringify({
            run_id: runId,
            track_id: candidate.track_id,
            friend_id: candidate.friend_id,
            file_path: candidate.local_audio_url,
            fingerprint_type: engine.fingerprint_type,
            fingerprint_version: engine.fingerprint_version,
            stored_audio_sha256: candidate.stored_audio_sha256,
            // What the file looked like when fingerprinted: a match lets the
            // worker skip without hashing (#303). Null on older rows, which
            // are hashed as before and gain them.
            stored_audio_size_bytes: candidate.stored_audio_size_bytes,
            stored_audio_mtime_ms: candidate.stored_audio_mtime_ms,
            force: options.force === true,
          })
        );
      }
      await pipeline.exec();
    }

    console.log(
      `Started fingerprint index run ${runId} (${describeScope(scope)}): ` +
        `${candidates.length} queued, ${unindexable} unindexable`
    );

    return {
      run_id: runId,
      scope: describeScope(scope),
      fingerprint_type: engine.fingerprint_type,
      fingerprint_version: engine.fingerprint_version,
      queued: candidates.length,
      unindexable,
      indexed: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      started_at: now,
      updated_at: now,
      complete: candidates.length === 0,
    };
  }

  /** Counters for one run, as the worker has left them. */
  async getRun(runId: string): Promise<FingerprintIndexRun | null> {
    const key = runKey(runId);
    const [stored, errors] = await Promise.all([
      this.redis.hgetall(key),
      this.redis.lrange(`${key}:errors`, 0, -1),
    ]);
    if (!stored || Object.keys(stored).length === 0) return null;

    const queued = toInt(stored.queued);
    const indexed = toInt(stored.indexed);
    const skipped = toInt(stored.skipped);
    const failed = toInt(stored.failed);

    return {
      run_id: stored.run_id ?? runId,
      scope: stored.scope ?? "",
      fingerprint_type: stored.fingerprint_type ?? "",
      fingerprint_version: stored.fingerprint_version ?? "",
      queued,
      unindexable: toInt(stored.unindexable),
      indexed,
      skipped,
      failed,
      errors: errors ?? [],
      started_at: toInt(stored.started_at),
      updated_at: toInt(stored.updated_at),
      complete: indexed + skipped + failed >= queued,
    };
  }
}

function toInt(value: string | undefined): number {
  const parsed = parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const fingerprintIndexService = new FingerprintIndexService();

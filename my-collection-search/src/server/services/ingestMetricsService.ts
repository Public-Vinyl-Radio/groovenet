import { getRedisConnection } from "@/lib/redis";
import type { IngestCounters } from "@/types/audioIngest";

/**
 * Counters for the parts of the vinyl pipeline that leave no row behind (#280).
 *
 * Most of what the pipeline does is already countable from Postgres —
 * `ingestDebugService` reads statuses, match rates and confidence bands
 * straight from `audio_ingests` and `play_detections`, and they stay the
 * source of truth for those. What a table cannot tell you is what never made
 * it into one: an upload refused before a row existed, a retry answered with
 * the original id, and how long a confirmed play took to get there. Those are
 * counted here.
 *
 * Kept in Redis rather than process memory so they survive a deploy and agree
 * across restarts, in five-minute hash buckets so the stats endpoint can sum
 * the same window it reports everything else over:
 *
 *     HINCRBY ingest:metrics:<bucket> chunks.rejected.audio_too_short 1
 */

export const METRICS_PREFIX = "ingest:metrics:";
export const BUCKET_MS = 5 * 60_000;
/** A day past the stats endpoint's seven-day ceiling. */
export const METRICS_TTL_SECONDS = 8 * 24 * 60 * 60;

/** Where confirmed-play latency is bucketed, upper bound in seconds. */
export const LATENCY_BANDS: Array<[label: string, maxSeconds: number]> = [
  ["le_30s", 30],
  ["le_60s", 60],
  ["le_120s", 120],
  ["le_300s", 300],
  ["gt_300s", Infinity],
];

export function latencyBand(latencyMs: number): string {
  const seconds = latencyMs / 1000;
  // The last band is unbounded, so there is always a match.
  return LATENCY_BANDS.find(([, max]) => seconds <= max)![0];
}

export function bucketKey(at: number): string {
  return `${METRICS_PREFIX}${Math.floor(at / BUCKET_MS)}`;
}

/** Every bucket key overlapping [since, now]. */
export function bucketKeys(since: number, now: number): string[] {
  const keys: string[] = [];
  for (let b = Math.floor(since / BUCKET_MS); b <= Math.floor(now / BUCKET_MS); b++) {
    keys.push(`${METRICS_PREFIX}${b}`);
  }
  return keys;
}

export class IngestMetricsService {
  private get redis() {
    return getRedisConnection();
  }

  /**
   * Bump counters. Never awaited by callers and never throws: a lost count
   * costs a number on a dashboard, and an upload or a callback waiting on a
   * Redis outage would cost the audio.
   */
  increment(counts: Record<string, number>, at: number = Date.now()): void {
    try {
      const key = bucketKey(at);
      const tx = this.redis.multi();
      for (const [field, by] of Object.entries(counts)) {
        if (by) tx.hincrby(key, field, Math.round(by));
      }
      tx.expire(key, METRICS_TTL_SECONDS);
      tx.exec().catch((error: unknown) => {
        console.error("Could not record ingest metrics:", error);
      });
    } catch (error) {
      console.error("Could not record ingest metrics:", error);
    }
  }

  chunkReceived(): void {
    this.increment({ "chunks.received": 1 });
  }

  chunkAccepted(): void {
    this.increment({ "chunks.accepted": 1 });
  }

  chunkDuplicate(): void {
    this.increment({ "chunks.duplicate": 1 });
  }

  chunkRejected(reason: string): void {
    this.increment({ [`chunks.rejected.${reason}`]: 1 });
  }

  chunkFailed(stage: string): void {
    this.increment({ [`chunks.failed.${stage}`]: 1 });
  }

  enqueueFailed(): void {
    this.increment({ "chunks.enqueue_failed": 1 });
  }

  /** A play turned into a spin, and how long after capture that happened. */
  playConfirmed(latencyMs: number | null): void {
    const counts: Record<string, number> = { "plays.confirmed": 1 };
    if (latencyMs !== null) {
      counts["plays.latency_measured"] = 1;
      counts["plays.latency_ms_sum"] = latencyMs;
      counts[`plays.latency.${latencyBand(latencyMs)}`] = 1;
    }
    this.increment(counts);
  }

  /** Raw field totals over a window, summed across its buckets. */
  async totals(since: Date, now: number = Date.now()): Promise<Record<string, number>> {
    const pipeline = this.redis.pipeline();
    for (const key of bucketKeys(since.getTime(), now)) pipeline.hgetall(key);
    const results = (await pipeline.exec()) ?? [];

    const totals: Record<string, number> = {};
    for (const [error, hash] of results) {
      if (error) throw error;
      for (const [field, value] of Object.entries((hash ?? {}) as Record<string, string>)) {
        totals[field] = (totals[field] ?? 0) + Number(value);
      }
    }
    return totals;
  }

  /** The counters as the stats endpoint reports them. */
  async summarize(since: Date, now: number = Date.now()): Promise<IngestCounters> {
    const totals = await this.totals(since, now);
    const count = (field: string) => totals[field] ?? 0;
    const prefixed = (prefix: string) =>
      Object.entries(totals)
        .filter(([field]) => field.startsWith(prefix))
        .map(([field, count]) => [field.slice(prefix.length), count] as const)
        .filter(([, count]) => count > 0);

    const rejected = prefixed("chunks.rejected.")
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
    const failed = prefixed("chunks.failed.")
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count || a.stage.localeCompare(b.stage));
    const measured = count("plays.latency_measured");

    return {
      bucket_minutes: BUCKET_MS / 60_000,
      chunks: {
        received: count("chunks.received"),
        accepted: count("chunks.accepted"),
        duplicate: count("chunks.duplicate"),
        rejected: rejected.reduce((sum, r) => sum + r.count, 0),
        rejected_by_reason: rejected,
        failed_by_stage: failed,
        enqueue_failed: count("chunks.enqueue_failed"),
      },
      plays: {
        confirmed: count("plays.confirmed"),
        latency_ms_avg:
          measured > 0 ? Math.round(count("plays.latency_ms_sum") / measured) : null,
        latency_bands: LATENCY_BANDS.map(([band]) => ({
          band,
          count: count(`plays.latency.${band}`),
        })),
      },
    };
  }
}

export const ingestMetricsService = new IngestMetricsService();

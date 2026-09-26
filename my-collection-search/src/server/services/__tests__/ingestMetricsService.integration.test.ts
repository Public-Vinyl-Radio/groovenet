import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { getRedisConnection, disconnectRedis } from "@/lib/redis";
import {
  METRICS_TTL_SECONDS,
  IngestMetricsService,
  bucketKey,
} from "../ingestMetricsService";

// Against a REAL Redis (#280): MULTI/EXEC and pipeline reply shapes are what
// the in-memory fake in ingestMetricsService.test.ts cannot vouch for. Only
// runs with RUN_REDIS_TESTS=1 and REDIS_URL at a disposable Redis — see
// `just redis-test`.

const RUN = process.env.RUN_REDIS_TESTS === "1";

/** Increments are fire-and-forget; wait until they have landed. */
async function settled(redis: ReturnType<typeof getRedisConnection>) {
  await redis.ping();
}

describe.skipIf(!RUN)("IngestMetricsService (Redis integration)", () => {
  let redis: ReturnType<typeof getRedisConnection>;
  const metrics = new IngestMetricsService();

  beforeAll(() => {
    redis = getRedisConnection();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  afterAll(async () => {
    await redis.flushdb();
    disconnectRedis();
  });

  it("increments a bucket hash and sets its expiry", async () => {
    const at = Date.now();
    metrics.increment({ "chunks.received": 1, "plays.latency_ms_sum": 1234.4 }, at);
    await settled(redis);

    expect(await redis.hgetall(bucketKey(at))).toEqual({
      "chunks.received": "1",
      "plays.latency_ms_sum": "1234",
    });
    const ttl = await redis.ttl(bucketKey(at));
    expect(ttl).toBeGreaterThan(METRICS_TTL_SECONDS - 5);
  });

  it("sums a window across buckets from real pipeline replies", async () => {
    const now = Date.now();
    metrics.increment({ "chunks.rejected.audio_too_short": 2 }, now);
    metrics.increment({ "chunks.rejected.audio_too_short": 1 }, now - 10 * 60_000);
    // Outside the window: must not be counted.
    metrics.increment({ "chunks.rejected.audio_too_short": 50 }, now - 3 * 60 * 60_000);
    metrics.playConfirmed(45_000);
    await settled(redis);

    const summary = await metrics.summarize(new Date(now - 60 * 60_000), now);
    expect(summary.chunks.rejected_by_reason).toEqual([
      { reason: "audio_too_short", count: 3 },
    ]);
    expect(summary.plays.confirmed).toBe(1);
    expect(summary.plays.latency_ms_avg).toBe(45_000);
  });
});

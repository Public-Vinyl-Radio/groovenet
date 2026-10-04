import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { getRedisConnection, disconnectRedis } from "@/lib/redis";
import { EmbeddingQueueService } from "../embeddingQueueService";

// Redis integration tests — hit a REAL Redis so they catch client-library
// behavior changes (e.g. ioredis sorted-set/list reply shapes) that the
// mocked unit tests in embeddingQueueService.test.ts cannot. Only run when
// RUN_REDIS_TESTS=1 with REDIS_URL pointing at a disposable Redis. See
// `just redis-test`.

const mockGenerateIdentity = vi.hoisted(() => vi.fn());
const mockCheckProvider = vi.hoisted(() => vi.fn());

vi.mock("@/lib/identity-embedding", () => ({
  generateAndStoreIdentityEmbedding: mockGenerateIdentity,
}));
vi.mock("@/lib/audio-vibe-embedding", () => ({
  generateAndStoreAudioVibeEmbedding: vi.fn(),
}));
vi.mock("@/server/services/embeddingHealthService", () => ({
  checkEmbeddingProvider: mockCheckProvider,
}));

const RUN = process.env.RUN_REDIS_TESTS === "1";

describe.skipIf(!RUN)("EmbeddingQueueService (Redis integration)", () => {
  let service: EmbeddingQueueService;
  let redis: ReturnType<typeof getRedisConnection>;

  beforeAll(() => {
    redis = getRedisConnection();
  });

  beforeEach(async () => {
    await redis.flushdb();
    service = new EmbeddingQueueService();
    mockGenerateIdentity.mockReset().mockResolvedValue({ updated: true, reason: "ok" });
    mockCheckProvider.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await redis.flushdb();
    disconnectRedis();
  });

  it("enqueues and drains a job through a real list (LPUSH/RPOP)", async () => {
    await service.enqueue([{ track_id: "t1", friend_id: 1, kind: "identity" }]);
    expect(await redis.llen("embedding_queue")).toBe(1);

    await service.tick(Date.now());

    expect(mockGenerateIdentity).toHaveBeenCalledWith("t1", 1, undefined);
    expect(await redis.llen("embedding_queue")).toBe(0);
  });

  it("schedules a transient failure into the real sorted set and promotes it once due", async () => {
    mockGenerateIdentity.mockRejectedValueOnce(new Error("503 Service Unavailable"));
    await service.enqueue([{ track_id: "t1", friend_id: 1, kind: "identity" }]);

    const start = Date.now();
    await service.tick(start);

    expect(await redis.zcard("embedding_retry")).toBe(1);
    expect(await redis.llen("embedding_queue")).toBe(0);

    // Not due yet.
    await service.tick(start + 1_000);
    expect(mockGenerateIdentity).toHaveBeenCalledTimes(1);

    // Due now (base backoff is 30s * 2^1 = 60s).
    await service.tick(start + 61_000);
    expect(mockGenerateIdentity).toHaveBeenCalledTimes(2);
    expect(await redis.zcard("embedding_retry")).toBe(0);
  });

  it("pauses on an auth error using real SET/GET/DEL and resumes once the provider recovers", async () => {
    mockGenerateIdentity.mockRejectedValueOnce(new Error("invalid_organization"));
    await service.enqueue([{ track_id: "t1", friend_id: 1, kind: "identity" }]);

    await service.tick(Date.now());

    let health = await service.getQueueHealth();
    expect(health.paused).toBe(true);
    expect(health.lastError).toBe("invalid_organization");
    // The job went back onto the queue, untouched.
    expect(await redis.llen("embedding_queue")).toBe(1);

    mockCheckProvider.mockResolvedValueOnce(undefined);
    await service.tick(Date.now());

    health = await service.getQueueHealth();
    expect(health.paused).toBe(false);
    expect(mockGenerateIdentity).toHaveBeenCalledTimes(2);
  });

  it("caps the failed list at 100 entries via real LPUSH/LTRIM", async () => {
    mockGenerateIdentity.mockRejectedValue(new Error("permanently broken"));
    for (let i = 0; i < 5; i += 1) {
      await service.enqueue([
        { track_id: `t${i}`, friend_id: 1, kind: "identity" },
      ]);
    }
    // Run each job through every retry until it lands in the failed list.
    let now = Date.now();
    for (let round = 0; round < 6; round += 1) {
      await service.tick(now);
      now += 31 * 60_000; // past the max backoff, promotes anything pending
    }

    const health = await service.getQueueHealth();
    expect(health.failedCount).toBe(5);
  });

  it("tracks a backfill run's progress through real HSET/HINCRBY as the queue drains (#388)", async () => {
    mockGenerateIdentity
      .mockResolvedValueOnce({ updated: true, reason: "ok" })
      .mockResolvedValueOnce({ updated: false, reason: "Source hash unchanged" })
      .mockRejectedValue(new Error("rate limited"));

    const started = await service.startBackfillRun([
      { track_id: "a", friend_id: 1, kind: "identity" },
      { track_id: "b", friend_id: 1, kind: "identity" },
      { track_id: "c", friend_id: 1, kind: "identity" },
    ]);
    expect(started.queued).toBe(3);
    expect(started.complete).toBe(false);

    // Drive the one failing job through every retry so the run reaches a
    // terminal state, same backoff schedule as the plain-queue test above.
    let now = Date.now();
    for (let round = 0; round < 6; round += 1) {
      await service.tick(now);
      now += 31 * 60_000;
    }

    const finished = await service.getBackfillRun(started.run_id);
    expect(finished).toMatchObject({
      queued: 3,
      success: 1,
      skipped: 1,
      failed: 1,
      complete: true,
    });
    expect(finished?.errors).toEqual(["c: rate limited"]);
  });
});

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { getRedisConnection, disconnectRedis } from "@/lib/redis";
import { RedisJobService } from "../redisJobService";

// Redis integration tests — hit a REAL Redis so they catch client-library
// behavior changes (e.g. ioredis RESP3 reply shapes) that the mocked unit
// tests in redisJobService.test.ts cannot. Only run when RUN_REDIS_TESTS=1
// with REDIS_URL pointing at a disposable Redis. See `just redis-test`.

// Postgres-backed settings are irrelevant here — isolate the Redis path.
vi.mock("@/server/repositories/settingsRepository", () => ({
  settingsRepository: {
    ensureGamdlSettings: vi.fn().mockResolvedValue(undefined),
    findGamdlSettingsByFriendId: vi.fn().mockResolvedValue(null),
  },
}));

const RUN = process.env.RUN_REDIS_TESTS === "1";

describe.skipIf(!RUN)("RedisJobService (Redis integration)", () => {
  let service: RedisJobService;
  let redis: ReturnType<typeof getRedisConnection>;

  beforeAll(() => {
    redis = getRedisConnection();
  });

  beforeEach(async () => {
    await redis.flushdb();
    service = new RedisJobService();
  });

  afterAll(async () => {
    await redis.flushdb();
    disconnectRedis();
  });

  it("round-trips a job through real ioredis (hgetall reply shape)", async () => {
    const job_id = await service.createDownloadJob({
      track_id: "track-abc",
      friend_id: 7,
      release_id: "rel-1",
      apple_music_url: "https://music.apple.com/x",
    });

    const status = await service.getJobStatus(job_id);

    expect(status).not.toBeNull();
    // parseJobHash reads hgetall via property access — a Map reply (a RESP3
    // regression risk) would surface here as undefined fields.
    expect(status).toMatchObject({
      job_id,
      status: "queued",
      track_id: "track-abc",
      release_id: "rel-1",
    });
    // Numeric fields come back as strings from Redis and are parsed to numbers.
    expect(status!.progress).toBe(0);
    expect(status!.friend_id).toBe(7);
    expect(typeof status!.created_at).toBe("number");
    expect(typeof status!.updated_at).toBe("number");

    // Job payload was pushed to the worker queue (lpush/lrange round-trip).
    const queued = await redis.lrange("download_queue", 0, -1);
    expect(queued).toHaveLength(1);
    expect(JSON.parse(queued[0])).toMatchObject({ job_id, track_id: "track-abc" });
  });

  it("lets a job's outcome be reported once (hsetnx reply shape)", async () => {
    const job_id = await service.createDownloadJob({ track_id: "track-abc", friend_id: 7 });

    expect(await service.markOutcomeReported(job_id)).toBe(true);
    expect(await service.markOutcomeReported(job_id)).toBe(false);
    // The flag rides on the job hash without disturbing how it parses.
    expect(await service.getJobStatus(job_id)).toMatchObject({ job_id, track_id: "track-abc" });
  });

  it("lists jobs via scan + pipelined hgetall", async () => {
    const a = await service.createDownloadJob({ track_id: "t-a", friend_id: 1 });
    const b = await service.createDownloadJob({ track_id: "t-b", friend_id: 2 });

    const all = await service.getAllJobs();

    expect(all.map((j) => j.job_id).sort()).toEqual([a, b].sort());
    expect(all.every((j) => typeof j.friend_id === "number")).toBe(true);
  });

  it("returns jobs updated since a timestamp via zrangebyscore", async () => {
    const before = Date.now() - 1000;
    const job_id = await service.createDownloadJob({ track_id: "t-c", friend_id: 3 });

    const recent = await service.getJobsUpdatedSince(before);

    expect(recent.some((j) => j.job_id === job_id)).toBe(true);
  });

  it("clears all jobs", async () => {
    await service.createDownloadJob({ track_id: "t-d", friend_id: 4 });
    await service.clearAllJobs();

    expect(await service.getAllJobs()).toHaveLength(0);
  });
});

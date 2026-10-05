import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  EmbeddingQueueService,
  embeddingQueueService,
  isAuthError,
  queueIntervalSeconds,
  resetSweepClock,
  startEmbeddingQueueWorker,
  sweepIntervalMinutes,
} from "../embeddingQueueService";
import type { EmbeddingJob } from "@/types/embeddingQueue";

// ─── mocks ────────────────────────────────────────────────────────────────────

const mockPipeline = vi.hoisted(() => ({
  lpush: vi.fn(),
  rpush: vi.fn(),
  ltrim: vi.fn(),
  zrem: vi.fn(),
  hset: vi.fn(),
  hincrby: vi.fn(),
  expire: vi.fn(),
  exec: vi.fn(),
}));

const mockRedis = vi.hoisted(() => ({
  pipeline: vi.fn(),
  rpop: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  llen: vi.fn(),
  zcard: vi.fn(),
  zrangebyscore: vi.fn(),
  zadd: vi.fn(),
  hgetall: vi.fn(),
  lrange: vi.fn(),
}));

const mockGenerateIdentity = vi.hoisted(() => vi.fn());
const mockGenerateAudioVibe = vi.hoisted(() => vi.fn());
const mockCheckProvider = vi.hoisted(() => vi.fn());
const mockListIdentity = vi.hoisted(() => vi.fn());
const mockListAudioVibe = vi.hoisted(() => vi.fn());
const mockGenerateContext = vi.hoisted(() => vi.fn());
const mockListContext = vi.hoisted(() => vi.fn());

vi.mock("@/lib/redis", () => ({ getRedisConnection: () => mockRedis }));
vi.mock("@/lib/identity-embedding", () => ({
  generateAndStoreIdentityEmbedding: mockGenerateIdentity,
}));
vi.mock("@/lib/audio-vibe-embedding", () => ({
  generateAndStoreAudioVibeEmbedding: mockGenerateAudioVibe,
}));
vi.mock("@/lib/context-embedding", () => ({
  generateAndStoreContextEmbedding: mockGenerateContext,
}));
vi.mock("@/server/repositories/embeddingsRepository", () => ({
  embeddingsRepository: {
    listTracksNeedingIdentityEmbeddings: mockListIdentity,
    listTracksNeedingAudioVibeEmbeddings: mockListAudioVibe,
    listTracksNeedingContextEmbeddings: mockListContext,
  },
}));
vi.mock("@/server/services/embeddingHealthService", () => ({
  checkEmbeddingProvider: mockCheckProvider,
}));

const NOW = new Date("2026-10-03T00:00:00Z").getTime();

function job(
  overrides: Partial<EmbeddingJob & { attempts: number }> = {}
): EmbeddingJob & { attempts?: number } {
  return { track_id: "t1", friend_id: 1, kind: "identity", ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRedis.pipeline.mockReturnValue(mockPipeline);
  mockPipeline.exec.mockResolvedValue([]);
  mockRedis.rpop.mockResolvedValue(null);
  mockRedis.get.mockResolvedValue(null);
  mockRedis.zrangebyscore.mockResolvedValue([]);
  mockRedis.llen.mockResolvedValue(0);
  mockRedis.zcard.mockResolvedValue(0);
  mockRedis.hgetall.mockResolvedValue({});
  mockRedis.lrange.mockResolvedValue([]);
  mockListIdentity.mockResolvedValue([]);
  mockListAudioVibe.mockResolvedValue([]);
  mockListContext.mockResolvedValue([]);
  mockGenerateContext.mockResolvedValue({ updated: true, reason: "ok" });
  mockGenerateIdentity.mockResolvedValue({ updated: true, reason: "ok" });
  mockGenerateAudioVibe.mockResolvedValue({ updated: true, reason: "ok" });
  mockCheckProvider.mockResolvedValue(undefined);
});

// ─── isAuthError ──────────────────────────────────────────────────────────────

describe("isAuthError", () => {
  it.each([
    "You do not have access to the organization tied to the API key (invalid_organization)",
    "Incorrect API key provided",
    "401 Unauthorized",
    "unauthorized",
  ])("treats %s as an auth failure", (message) => {
    expect(isAuthError(message)).toBe(true);
  });

  it.each([
    "429 Too Many Requests",
    "ECONNRESET",
    "Request timed out",
    "500 Internal Server Error",
  ])("treats %s as transient, not auth", (message) => {
    expect(isAuthError(message)).toBe(false);
  });
});

// ─── enqueue ──────────────────────────────────────────────────────────────────

describe("enqueue", () => {
  it("lpushes one entry per job", async () => {
    const service = new EmbeddingQueueService();
    await service.enqueue([job({ track_id: "a" }), job({ track_id: "b" })]);
    expect(mockPipeline.lpush).toHaveBeenCalledTimes(2);
    expect(mockPipeline.lpush).toHaveBeenCalledWith(
      "embedding_queue",
      JSON.stringify(job({ track_id: "a" }))
    );
  });

  it("does nothing for an empty list", async () => {
    const service = new EmbeddingQueueService();
    await service.enqueue([]);
    expect(mockRedis.pipeline).not.toHaveBeenCalled();
  });
});

// ─── tick: happy path ─────────────────────────────────────────────────────────

describe("tick", () => {
  it("runs a popped identity job and leaves no retry/failure behind", async () => {
    mockRedis.rpop.mockResolvedValueOnce(JSON.stringify(job())).mockResolvedValue(null);
    const service = new EmbeddingQueueService();
    await service.tick(NOW);
    expect(mockGenerateIdentity).toHaveBeenCalledWith("t1", 1, undefined);
    expect(mockRedis.zadd).not.toHaveBeenCalled();
    expect(mockPipeline.lpush).not.toHaveBeenCalledWith(
      "embedding_queue:failed",
      expect.anything()
    );
  });

  it("runs an audio_vibe job via generateAndStoreAudioVibeEmbedding", async () => {
    mockRedis.rpop
      .mockResolvedValueOnce(JSON.stringify(job({ kind: "audio_vibe" })))
      .mockResolvedValue(null);
    const service = new EmbeddingQueueService();
    await service.tick(NOW);
    expect(mockGenerateAudioVibe).toHaveBeenCalledWith("t1", 1, undefined);
  });

  it("runs a context job via generateAndStoreContextEmbedding (#408)", async () => {
    mockRedis.rpop
      .mockResolvedValueOnce(JSON.stringify(job({ kind: "context", force: true })))
      .mockResolvedValue(null);
    const service = new EmbeddingQueueService();
    await service.tick(NOW);
    expect(mockGenerateContext).toHaveBeenCalledWith("t1", 1, true);
    expect(mockGenerateIdentity).not.toHaveBeenCalled();
  });

  it("drops a legacy prompt job left in Redis without retrying it", async () => {
    mockRedis.rpop
      .mockResolvedValueOnce(JSON.stringify(job({ kind: "prompt" as never })))
      .mockResolvedValue(null);
    const service = new EmbeddingQueueService();
    await service.tick(NOW);
    expect(mockGenerateIdentity).not.toHaveBeenCalled();
    expect(mockGenerateAudioVibe).not.toHaveBeenCalled();
    expect(mockRedis.zadd).not.toHaveBeenCalled();
  });

  it("stops draining once the queue is empty", async () => {
    mockRedis.rpop.mockResolvedValue(null);
    const service = new EmbeddingQueueService();
    await service.tick(NOW);
    expect(mockGenerateIdentity).not.toHaveBeenCalled();
  });
});

// ─── tick: transient failure → backoff ────────────────────────────────────────

describe("tick — transient failures", () => {
  it("schedules a retry with backoff on the first failure", async () => {
    mockRedis.rpop.mockResolvedValueOnce(JSON.stringify(job())).mockResolvedValue(null);
    mockGenerateIdentity.mockRejectedValueOnce(new Error("503 Service Unavailable"));
    const service = new EmbeddingQueueService();
    await service.tick(NOW);

    expect(mockRedis.zadd).toHaveBeenCalledTimes(1);
    const [key, score, member] = mockRedis.zadd.mock.calls[0];
    expect(key).toBe("embedding_retry");
    expect(score).toBe(NOW + 30_000 * 2 ** 1);
    expect(JSON.parse(member)).toMatchObject({ ...job(), attempts: 1 });
  });

  it("gives up after the max attempt count and records a failure instead", async () => {
    mockRedis.rpop
      .mockResolvedValueOnce(JSON.stringify(job({ attempts: 4 })))
      .mockResolvedValue(null);
    mockGenerateIdentity.mockRejectedValueOnce(new Error("still down"));
    const service = new EmbeddingQueueService();
    await service.tick(NOW);

    expect(mockRedis.zadd).not.toHaveBeenCalled();
    expect(mockPipeline.lpush).toHaveBeenCalledWith(
      "embedding_queue:failed",
      expect.stringContaining('"attempts":5')
    );
    expect(mockPipeline.ltrim).toHaveBeenCalledWith(
      "embedding_queue:failed",
      0,
      99
    );
  });

  it("handles a non-Error rejection (a thrown string) the same as a transient failure", async () => {
    mockRedis.rpop.mockResolvedValueOnce(JSON.stringify(job())).mockResolvedValue(null);
    mockGenerateIdentity.mockRejectedValueOnce("socket hang up");
    const service = new EmbeddingQueueService();
    await service.tick(NOW);
    const [, , member] = mockRedis.zadd.mock.calls[0];
    expect(JSON.parse(member)).toMatchObject({ ...job(), attempts: 1 });
  });

  it("does not pause the queue for a transient error", async () => {
    mockRedis.rpop.mockResolvedValueOnce(JSON.stringify(job())).mockResolvedValue(null);
    mockGenerateIdentity.mockRejectedValueOnce(new Error("ETIMEDOUT"));
    const service = new EmbeddingQueueService();
    await service.tick(NOW);
    expect(mockRedis.set).not.toHaveBeenCalledWith(
      "embedding_queue:paused",
      expect.anything()
    );
  });
});

// ─── tick: auth failure → pause ───────────────────────────────────────────────

describe("tick — auth failures", () => {
  it("pauses the queue and pushes the failing job and the rest of the batch back unconsumed", async () => {
    mockRedis.rpop
      .mockResolvedValueOnce(JSON.stringify(job({ track_id: "a" })))
      .mockResolvedValueOnce(JSON.stringify(job({ track_id: "b" })))
      .mockResolvedValue(null);
    mockGenerateIdentity.mockRejectedValueOnce(
      new Error("invalid_organization")
    );
    const service = new EmbeddingQueueService();
    await service.tick(NOW);

    expect(mockRedis.set).toHaveBeenCalledWith(
      "embedding_queue:paused",
      "invalid_organization"
    );
    // Only the first job was attempted; the second must never have run.
    expect(mockGenerateIdentity).toHaveBeenCalledTimes(1);
    // Both the failing job and the untouched second job go back, in order.
    expect(mockPipeline.rpush).toHaveBeenCalledWith(
      "embedding_queue",
      JSON.stringify(job({ track_id: "a" }))
    );
    expect(mockPipeline.rpush).toHaveBeenCalledWith(
      "embedding_queue",
      JSON.stringify(job({ track_id: "b" }))
    );
  });

  it("does not consume an attempt on an auth failure", async () => {
    mockRedis.rpop.mockResolvedValueOnce(JSON.stringify(job())).mockResolvedValue(null);
    mockGenerateIdentity.mockRejectedValueOnce(new Error("401 unauthorized"));
    const service = new EmbeddingQueueService();
    await service.tick(NOW);
    expect(mockPipeline.rpush).toHaveBeenCalledWith(
      "embedding_queue",
      JSON.stringify(job())
    );
  });
});

describe("tick — while paused", () => {
  it("does nothing and consumes no jobs when the provider is still broken", async () => {
    mockRedis.get.mockImplementation((key: string) =>
      Promise.resolve(key === "embedding_queue:paused" ? "invalid_organization" : null)
    );
    mockCheckProvider.mockRejectedValueOnce(new Error("still bad"));
    const service = new EmbeddingQueueService();
    await service.tick(NOW);
    expect(mockRedis.rpop).not.toHaveBeenCalled();
  });

  it("clears the pause and resumes once the provider check succeeds", async () => {
    mockRedis.get.mockImplementation((key: string) =>
      Promise.resolve(key === "embedding_queue:paused" ? "invalid_organization" : null)
    );
    mockCheckProvider.mockResolvedValueOnce(undefined);
    mockRedis.rpop.mockResolvedValueOnce(JSON.stringify(job())).mockResolvedValue(null);
    const service = new EmbeddingQueueService();
    await service.tick(NOW);
    expect(mockRedis.del).toHaveBeenCalledWith("embedding_queue:paused");
    expect(mockGenerateIdentity).toHaveBeenCalledWith("t1", 1, undefined);
  });
});

// ─── retry promotion ──────────────────────────────────────────────────────────

describe("tick — retry promotion", () => {
  it("moves due retries back onto the main queue before draining", async () => {
    const due = JSON.stringify(job({ attempts: 1 }));
    mockRedis.zrangebyscore.mockResolvedValueOnce([due]);
    const service = new EmbeddingQueueService();
    await service.tick(NOW);
    expect(mockRedis.zrangebyscore).toHaveBeenCalledWith("embedding_retry", 0, NOW);
    expect(mockPipeline.rpush).toHaveBeenCalledWith("embedding_queue", due);
    expect(mockPipeline.zrem).toHaveBeenCalledWith("embedding_retry", due);
  });
});

// ─── sweepTick ────────────────────────────────────────────────────────────────

describe("sweepTick", () => {
  beforeEach(() => {
    mockRedis.llen.mockResolvedValue(0);
    mockRedis.zcard.mockResolvedValue(0);
  });

  it("enqueues identity, audio_vibe and context jobs for whatever is missing", async () => {
    mockListIdentity.mockResolvedValueOnce([{ track_id: "a", friend_id: 1 }]);
    mockListAudioVibe.mockResolvedValueOnce([{ track_id: "b", friend_id: 2 }]);
    mockListContext.mockResolvedValueOnce([{ track_id: "c", friend_id: 3 }]);
    const service = new EmbeddingQueueService();
    const result = await service.sweepTick();
    expect(result).toEqual({ queued: 3, pending: 0 });
    expect(mockPipeline.lpush).toHaveBeenCalledWith(
      "embedding_queue",
      JSON.stringify({ track_id: "c", friend_id: 3, kind: "context" })
    );
    expect(mockPipeline.lpush).toHaveBeenCalledWith(
      "embedding_queue",
      JSON.stringify({ track_id: "a", friend_id: 1, kind: "identity" })
    );
    expect(mockPipeline.lpush).toHaveBeenCalledWith(
      "embedding_queue",
      JSON.stringify({ track_id: "b", friend_id: 2, kind: "audio_vibe" })
    );
  });

  it("queues nothing — and a second run does no work — when nothing is missing", async () => {
    const service = new EmbeddingQueueService();
    expect(await service.sweepTick()).toEqual({ queued: 0, pending: 0 });
    expect(await service.sweepTick()).toEqual({ queued: 0, pending: 0 });
    expect(mockRedis.pipeline).not.toHaveBeenCalled();
  });

  it.each([
    ["queued", 4, 0],
    ["waiting to retry", 0, 2],
  ])("skips without looking for missing tracks while jobs are %s (#419)", async (_label, queued, retrying) => {
    mockRedis.llen.mockResolvedValue(queued);
    mockRedis.zcard.mockResolvedValue(retrying);
    const service = new EmbeddingQueueService();

    expect(await service.sweepTick()).toEqual({ queued: 0, pending: queued + retrying });

    expect(mockRedis.llen).toHaveBeenCalledWith("embedding_queue");
    expect(mockRedis.zcard).toHaveBeenCalledWith("embedding_retry");
    expect(mockListIdentity).not.toHaveBeenCalled();
    expect(mockListContext).not.toHaveBeenCalled();
    expect(mockRedis.pipeline).not.toHaveBeenCalled();
  });
});

// ─── getQueueHealth ───────────────────────────────────────────────────────────

describe("getQueueHealth", () => {
  it("reports depth as queue length plus pending retries", async () => {
    mockRedis.llen.mockImplementation((key: string) =>
      Promise.resolve(key === "embedding_queue" ? 3 : 7)
    );
    mockRedis.zcard.mockResolvedValueOnce(2);
    const service = new EmbeddingQueueService();
    const health = await service.getQueueHealth();
    expect(health.queueDepth).toBe(5);
    expect(health.failedCount).toBe(7);
  });

  it("surfaces the paused error as lastError and paused:true", async () => {
    mockRedis.get.mockImplementation((key: string) =>
      Promise.resolve(key === "embedding_queue:paused" ? "invalid_organization" : null)
    );
    const service = new EmbeddingQueueService();
    const health = await service.getQueueHealth();
    expect(health.paused).toBe(true);
    expect(health.lastError).toBe("invalid_organization");
  });

  it("falls back to the last recorded error when not paused", async () => {
    mockRedis.get.mockImplementation((key: string) =>
      Promise.resolve(
        key === "embedding_queue:last_error"
          ? JSON.stringify({ message: "503 once, then recovered", at: NOW })
          : null
      )
    );
    const service = new EmbeddingQueueService();
    const health = await service.getQueueHealth();
    expect(health.paused).toBe(false);
    expect(health.lastError).toBe("503 once, then recovered");
  });
});

// ─── resetQueueState ──────────────────────────────────────────────────────────

describe("resetQueueState", () => {
  it("deletes every queue-related key", async () => {
    const service = new EmbeddingQueueService();
    await service.resetQueueState();
    expect(mockRedis.del).toHaveBeenCalledWith(
      "embedding_queue",
      "embedding_retry",
      "embedding_queue:failed",
      "embedding_queue:paused",
      "embedding_queue:last_error"
    );
  });
});

// ─── runJob edge cases ────────────────────────────────────────────────────────

describe("tick — runJob edge cases", () => {
  it("drops an unparseable queue entry instead of throwing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockRedis.rpop.mockResolvedValueOnce("not-json{{{").mockResolvedValue(null);
    const service = new EmbeddingQueueService();
    await expect(service.tick(NOW)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      "[embedding-queue] dropping unparseable job:",
      "not-json{{{",
      expect.anything()
    );
    expect(mockGenerateIdentity).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("getQueueHealth — last_error fallback", () => {
  it("falls back to the raw string when last_error isn't JSON", async () => {
    mockRedis.get.mockImplementation((key: string) =>
      Promise.resolve(key === "embedding_queue:last_error" ? "not json" : null)
    );
    const service = new EmbeddingQueueService();
    const health = await service.getQueueHealth();
    expect(health.paused).toBe(false);
    expect(health.lastError).toBe("not json");
  });
});

// ─── interval helpers ─────────────────────────────────────────────────────────

describe("interval helpers", () => {
  afterEach(() => {
    delete process.env.EMBEDDING_QUEUE_INTERVAL_SECONDS;
    delete process.env.EMBEDDING_SWEEP_INTERVAL_MINUTES;
  });

  it("queueIntervalSeconds reads from the environment, defaulting to 10", () => {
    expect(queueIntervalSeconds()).toBe(10);
    process.env.EMBEDDING_QUEUE_INTERVAL_SECONDS = "5";
    expect(queueIntervalSeconds()).toBe(5);
    process.env.EMBEDDING_QUEUE_INTERVAL_SECONDS = "0";
    expect(queueIntervalSeconds()).toBe(10);
  });

  it("sweepIntervalMinutes reads from the environment, defaulting to 30", () => {
    expect(sweepIntervalMinutes()).toBe(30);
    process.env.EMBEDDING_SWEEP_INTERVAL_MINUTES = "15";
    expect(sweepIntervalMinutes()).toBe(15);
    process.env.EMBEDDING_SWEEP_INTERVAL_MINUTES = "-1";
    expect(sweepIntervalMinutes()).toBe(30);
  });
});

// ─── startEmbeddingQueueWorker ────────────────────────────────────────────────

// Captured before any spy replaces it.
const timerImpl = globalThis.setInterval;

describe("startEmbeddingQueueWorker()", () => {
  const GUARD = "__groovenetEmbeddingQueueStarted";
  let timers: ReturnType<typeof setInterval>[];

  beforeEach(() => {
    delete (globalThis as Record<string, unknown>)[GUARD];
    resetSweepClock();
    timers = [];
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Remember every timer registered so a stray interval can't keep this
    // suite's event loop alive.
    vi.spyOn(globalThis, "setInterval").mockImplementation(((
      fn: () => void,
      ms: number
    ) => {
      const handle = timerImpl(fn, ms);
      timers.push(handle);
      return handle;
    }) as typeof setInterval);
  });

  afterEach(() => {
    for (const handle of timers) clearInterval(handle);
    vi.restoreAllMocks();
    delete (globalThis as Record<string, unknown>)[GUARD];
  });

  it("starts only once per process", () => {
    startEmbeddingQueueWorker();
    startEmbeddingQueueWorker();
    expect(globalThis.setInterval).toHaveBeenCalledTimes(1);
  });

  it("registers an interval at queueIntervalSeconds()", () => {
    startEmbeddingQueueWorker();
    expect(globalThis.setInterval).toHaveBeenCalledWith(expect.any(Function), 10_000);
  });

  it("ticks and sweeps on startup rather than waiting out the first interval", async () => {
    const tickSpy = vi.spyOn(embeddingQueueService, "tick").mockResolvedValue(undefined);
    const sweepSpy = vi
      .spyOn(embeddingQueueService, "sweepTick")
      .mockResolvedValue({ queued: 0, pending: 0 });

    startEmbeddingQueueWorker();

    await vi.waitFor(() => expect(tickSpy).toHaveBeenCalled());
    await vi.waitFor(() => expect(sweepSpy).toHaveBeenCalled());
  });

  it("hands the timer a callback that ticks and sweeps again", async () => {
    const tickSpy = vi.spyOn(embeddingQueueService, "tick").mockResolvedValue(undefined);
    vi.spyOn(embeddingQueueService, "sweepTick").mockResolvedValue({ queued: 0, pending: 0 });

    startEmbeddingQueueWorker();
    await vi.waitFor(() => expect(tickSpy).toHaveBeenCalledTimes(1));

    const registered = (globalThis.setInterval as unknown as {
      mock: { calls: [() => void, number][] };
    }).mock.calls[0][0];

    registered();
    await vi.waitFor(() => expect(tickSpy).toHaveBeenCalledTimes(2));
  });

  it("logs and swallows a tick failure instead of crashing the interval", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(embeddingQueueService, "tick").mockRejectedValue(new Error("boom"));
    vi.spyOn(embeddingQueueService, "sweepTick").mockResolvedValue({ queued: 0, pending: 0 });

    startEmbeddingQueueWorker();

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        "[embedding-queue] tick failed:",
        expect.any(Error)
      )
    );
  });

  it("logs and swallows a sweep failure", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(embeddingQueueService, "tick").mockResolvedValue(undefined);
    vi.spyOn(embeddingQueueService, "sweepTick").mockRejectedValue(new Error("db down"));

    startEmbeddingQueueWorker();

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        "[embedding-queue] sweep tick failed:",
        expect.any(Error)
      )
    );
  });

  it("logs a skipped sweep with the pending count, not a queued one", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(embeddingQueueService, "tick").mockResolvedValue(undefined);
    vi.spyOn(embeddingQueueService, "sweepTick").mockResolvedValue({ queued: 0, pending: 21472 });

    startEmbeddingQueueWorker();

    await vi.waitFor(() =>
      expect(logSpy).toHaveBeenCalledWith("[embedding-queue] sweep skipped: 21472 job(s) still pending")
    );
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("sweep queued"));
  });

  it("logs a count when the sweep finds missing embeddings", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(embeddingQueueService, "tick").mockResolvedValue(undefined);
    vi.spyOn(embeddingQueueService, "sweepTick").mockResolvedValue({ queued: 3, pending: 0 });

    startEmbeddingQueueWorker();

    await vi.waitFor(() =>
      expect(logSpy).toHaveBeenCalledWith(
        "[embedding-queue] sweep queued 3 track(s) missing an embedding"
      )
    );
  });
});

// ─── startBackfillRun / getBackfillRun (#388) ──────────────────────────────────

describe("startBackfillRun", () => {
  it("seeds the run hash with zeroed counters and the queued count", async () => {
    const service = new EmbeddingQueueService();
    const run = await service.startBackfillRun([job({ track_id: "a" }), job({ track_id: "b" })]);

    expect(run).toMatchObject({
      queued: 2,
      success: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      complete: false,
    });
    expect(run.run_id).toMatch(/^[0-9a-f-]{36}$/);

    expect(mockPipeline.hset).toHaveBeenCalledWith(
      `embedding_backfill_run:${run.run_id}`,
      expect.objectContaining({ run_id: run.run_id, queued: 2 })
    );
    expect(mockPipeline.expire).toHaveBeenCalledWith(
      `embedding_backfill_run:${run.run_id}`,
      86_400
    );
  });

  it("is complete for an empty job list", async () => {
    const service = new EmbeddingQueueService();
    const run = await service.startBackfillRun([]);
    expect(run).toMatchObject({ queued: 0, complete: true });
  });

  it("tags every enqueued job with the run_id", async () => {
    const service = new EmbeddingQueueService();
    const run = await service.startBackfillRun([job({ track_id: "a" })]);

    expect(mockPipeline.lpush).toHaveBeenCalledWith(
      "embedding_queue",
      JSON.stringify({ ...job({ track_id: "a" }), run_id: run.run_id })
    );
  });
});

describe("getBackfillRun", () => {
  it("returns null when the run doesn't exist or has expired", async () => {
    const service = new EmbeddingQueueService();
    expect(await service.getBackfillRun("missing")).toBeNull();
  });

  it("parses counters and reports complete once every job has settled", async () => {
    mockRedis.hgetall.mockResolvedValueOnce({
      run_id: "run-1",
      queued: "2",
      success: "1",
      skipped: "1",
      failed: "0",
      started_at: "100",
      updated_at: "200",
    });
    const service = new EmbeddingQueueService();
    const run = await service.getBackfillRun("run-1");

    expect(run).toEqual({
      run_id: "run-1",
      queued: 2,
      success: 1,
      skipped: 1,
      failed: 0,
      errors: [],
      started_at: 100,
      updated_at: 200,
      complete: true,
    });
  });

  it("is not complete while jobs remain outstanding", async () => {
    mockRedis.hgetall.mockResolvedValueOnce({
      run_id: "run-1",
      queued: "5",
      success: "1",
      skipped: "0",
      failed: "0",
      started_at: "100",
      updated_at: "200",
    });
    const service = new EmbeddingQueueService();
    const run = await service.getBackfillRun("run-1");
    expect(run?.complete).toBe(false);
  });

  it("includes errors recorded against the run", async () => {
    mockRedis.hgetall.mockResolvedValueOnce({
      run_id: "run-1",
      queued: "1",
      success: "0",
      skipped: "0",
      failed: "1",
      started_at: "100",
      updated_at: "200",
    });
    mockRedis.lrange.mockResolvedValueOnce(["t1: rate limited"]);
    const service = new EmbeddingQueueService();
    const run = await service.getBackfillRun("run-1");
    expect(run?.errors).toEqual(["t1: rate limited"]);
  });

  it("falls back to the requested run id and zeroed counters for a sparse or malformed hash", async () => {
    mockRedis.hgetall.mockResolvedValueOnce({ success: "not-a-number" });
    const service = new EmbeddingQueueService();
    const run = await service.getBackfillRun("run-9");

    expect(run).toMatchObject({
      run_id: "run-9",
      queued: 0,
      success: 0,
      skipped: 0,
      failed: 0,
      started_at: 0,
      updated_at: 0,
    });
  });
});

describe("tick — run progress tagging (#388)", () => {
  it("bumps the run's success counter when a tagged job succeeds", async () => {
    mockRedis.rpop
      .mockResolvedValueOnce(JSON.stringify(job({ run_id: "run-1" })))
      .mockResolvedValue(null);
    mockGenerateIdentity.mockResolvedValueOnce({ updated: true, reason: "ok" });
    const service = new EmbeddingQueueService();
    await service.tick(NOW);

    expect(mockPipeline.hincrby).toHaveBeenCalledWith(
      "embedding_backfill_run:run-1",
      "success",
      1
    );
  });

  it("bumps the run's skipped counter when a tagged job's source hash is unchanged", async () => {
    mockRedis.rpop
      .mockResolvedValueOnce(JSON.stringify(job({ run_id: "run-1" })))
      .mockResolvedValue(null);
    mockGenerateIdentity.mockResolvedValueOnce({
      updated: false,
      reason: "Source hash unchanged",
    });
    const service = new EmbeddingQueueService();
    await service.tick(NOW);

    expect(mockPipeline.hincrby).toHaveBeenCalledWith(
      "embedding_backfill_run:run-1",
      "skipped",
      1
    );
  });

  it("touches no run counters for a job with no run_id", async () => {
    mockRedis.rpop.mockResolvedValueOnce(JSON.stringify(job())).mockResolvedValue(null);
    const service = new EmbeddingQueueService();
    await service.tick(NOW);
    expect(mockPipeline.hincrby).not.toHaveBeenCalled();
  });

  it("bumps the run's failed counter and records the real error once attempts are exhausted", async () => {
    mockRedis.rpop
      .mockResolvedValueOnce(JSON.stringify(job({ run_id: "run-2", attempts: 4 })))
      .mockResolvedValue(null);
    mockGenerateIdentity.mockRejectedValueOnce(new Error("rate limited"));
    const service = new EmbeddingQueueService();
    await service.tick(NOW);

    expect(mockPipeline.hincrby).toHaveBeenCalledWith(
      "embedding_backfill_run:run-2",
      "failed",
      1
    );
    expect(mockPipeline.rpush).toHaveBeenCalledWith(
      "embedding_backfill_run:run-2:errors",
      "t1: rate limited"
    );
  });

  it("does not bump a run's failed counter while a transient failure still has attempts left", async () => {
    mockRedis.rpop
      .mockResolvedValueOnce(JSON.stringify(job({ run_id: "run-3" })))
      .mockResolvedValue(null);
    mockGenerateIdentity.mockRejectedValueOnce(new Error("503"));
    const service = new EmbeddingQueueService();
    await service.tick(NOW);
    expect(mockPipeline.hincrby).not.toHaveBeenCalled();
  });
});

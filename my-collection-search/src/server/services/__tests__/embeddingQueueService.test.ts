import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmbeddingQueueService, isAuthError } from "../embeddingQueueService";
import type { EmbeddingJob } from "@/types/embeddingQueue";

// ─── mocks ────────────────────────────────────────────────────────────────────

const mockPipeline = vi.hoisted(() => ({
  lpush: vi.fn(),
  rpush: vi.fn(),
  ltrim: vi.fn(),
  zrem: vi.fn(),
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
}));

const mockGenerateIdentity = vi.hoisted(() => vi.fn());
const mockGenerateAudioVibe = vi.hoisted(() => vi.fn());
const mockGetTrackEmbedding = vi.hoisted(() => vi.fn());
const mockFindTrackRaw = vi.hoisted(() => vi.fn());
const mockUpdateTrackEmbedding = vi.hoisted(() => vi.fn());
const mockCheckProvider = vi.hoisted(() => vi.fn());
const mockListIdentity = vi.hoisted(() => vi.fn());
const mockListAudioVibe = vi.hoisted(() => vi.fn());

vi.mock("@/lib/redis", () => ({ getRedisConnection: () => mockRedis }));
vi.mock("@/lib/identity-embedding", () => ({
  generateAndStoreIdentityEmbedding: mockGenerateIdentity,
}));
vi.mock("@/lib/audio-vibe-embedding", () => ({
  generateAndStoreAudioVibeEmbedding: mockGenerateAudioVibe,
}));
vi.mock("@/lib/track-embedding", () => ({
  getTrackEmbedding: mockGetTrackEmbedding,
}));
vi.mock("@/server/repositories/trackRepository", () => ({
  trackRepository: {
    findTrackByTrackIdAndFriendIdRaw: mockFindTrackRaw,
    updateTrackEmbedding: mockUpdateTrackEmbedding,
  },
}));
vi.mock("@/server/repositories/embeddingsRepository", () => ({
  embeddingsRepository: {
    listTracksNeedingIdentityEmbeddings: mockListIdentity,
    listTracksNeedingAudioVibeEmbeddings: mockListAudioVibe,
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
    expect(mockGenerateIdentity).toHaveBeenCalledWith("t1", 1);
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
    expect(mockGenerateAudioVibe).toHaveBeenCalledWith("t1", 1);
  });

  it("runs a prompt job by fetching the track and writing tracks.embedding", async () => {
    mockRedis.rpop
      .mockResolvedValueOnce(JSON.stringify(job({ kind: "prompt" })))
      .mockResolvedValue(null);
    mockFindTrackRaw.mockResolvedValueOnce({ track_id: "t1", friend_id: 1 });
    mockGetTrackEmbedding.mockResolvedValueOnce([0.1, 0.2]);
    const service = new EmbeddingQueueService();
    await service.tick(NOW);
    expect(mockGetTrackEmbedding).toHaveBeenCalled();
    expect(mockUpdateTrackEmbedding).toHaveBeenCalledWith("t1", 1, [0.1, 0.2]);
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
    expect(mockGenerateIdentity).toHaveBeenCalledWith("t1", 1);
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
  it("enqueues identity and audio_vibe jobs for whatever is missing", async () => {
    mockListIdentity.mockResolvedValueOnce([{ track_id: "a", friend_id: 1 }]);
    mockListAudioVibe.mockResolvedValueOnce([{ track_id: "b", friend_id: 2 }]);
    const service = new EmbeddingQueueService();
    const result = await service.sweepTick();
    expect(result).toEqual({ queued: 2 });
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
    mockListIdentity.mockResolvedValue([]);
    mockListAudioVibe.mockResolvedValue([]);
    const service = new EmbeddingQueueService();
    expect(await service.sweepTick()).toEqual({ queued: 0 });
    expect(await service.sweepTick()).toEqual({ queued: 0 });
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

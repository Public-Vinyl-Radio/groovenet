import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
}));
const embed = vi.hoisted(() => vi.fn());
const createProvider = vi.hoisted(() => vi.fn());

vi.mock("@/lib/redis", () => ({ getRedisConnection: () => redis }));
vi.mock("@/lib/embeddings/openaiProvider", () => ({
  createOpenAiEmbeddingProvider: createProvider,
}));

import {
  QUERY_EMBEDDING_CACHE_PREFIX,
  QUERY_EMBEDDING_CACHE_TTL_SECONDS,
  QUERY_RATE_LIMIT_MAX,
  QueryRateLimitError,
  embedSearchQuery,
  normalizeQuery,
  queryEmbeddingCacheKey,
} from "../queryEmbeddingService";

const base = { query: "  Late-Night   CUMBIA ", model: "m", dims: 3, caller: "friend:1:ip:x" };
// 10s into a one-minute window.
const NOW = 1_700_000_000_000 - (1_700_000_000_000 % 60_000) + 10_000;

beforeEach(() => {
  for (const fn of Object.values(redis)) fn.mockReset();
  embed.mockReset().mockResolvedValue([[0.1, 0.2, 0.3]]);
  createProvider.mockReset().mockReturnValue({ model: "m", dims: 3, embed });
  redis.get.mockResolvedValue(null);
  redis.set.mockResolvedValue("OK");
  redis.incr.mockResolvedValue(1);
  redis.expire.mockResolvedValue(1);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("normalizeQuery / queryEmbeddingCacheKey", () => {
  it("folds case, Unicode form and whitespace", () => {
    expect(normalizeQuery("  Ｃumbia\tAMAZÓNICA \n")).toBe("cumbia amazónica");
  });

  it("keys on the query, model and dims", () => {
    const key = queryEmbeddingCacheKey("q", "m", 3);
    expect(key).toMatch(new RegExp(`^${QUERY_EMBEDDING_CACHE_PREFIX}[0-9a-f]{64}$`));
    expect(queryEmbeddingCacheKey("q", "m", 3)).toBe(key);
    expect(queryEmbeddingCacheKey("q", "m", 4)).not.toBe(key);
    expect(queryEmbeddingCacheKey("q", "other", 3)).not.toBe(key);
  });
});

describe("embedSearchQuery", () => {
  it("returns a cached vector without counting or embedding", async () => {
    redis.get.mockResolvedValue("[1,2,3]");

    await expect(embedSearchQuery(base)).resolves.toEqual({ embedding: [1, 2, 3], cacheHit: true });
    expect(redis.get).toHaveBeenCalledWith(queryEmbeddingCacheKey("late-night cumbia", "m", 3));
    expect(redis.incr).not.toHaveBeenCalled();
    expect(embed).not.toHaveBeenCalled();
  });

  it("embeds the normalized query on a miss, then caches it with a TTL", async () => {
    const result = await embedSearchQuery({ ...base, now: NOW });

    expect(result).toEqual({ embedding: [0.1, 0.2, 0.3], cacheHit: false });
    expect(createProvider).toHaveBeenCalledWith("m", 3);
    expect(embed).toHaveBeenCalledWith(["late-night cumbia"]);
    expect(redis.set).toHaveBeenCalledWith(
      queryEmbeddingCacheKey("late-night cumbia", "m", 3),
      "[0.1,0.2,0.3]",
      "EX",
      QUERY_EMBEDDING_CACHE_TTL_SECONDS
    );
    const window = Math.floor(NOW / 60_000);
    expect(redis.incr).toHaveBeenCalledWith(`search:qembed:rl:friend:1:ip:x:${window}`);
    // The first hit in a window sets its expiry; later ones don't.
    expect(redis.expire).toHaveBeenCalledWith(`search:qembed:rl:friend:1:ip:x:${window}`, 120);
  });

  it("only sets the window expiry once", async () => {
    redis.incr.mockResolvedValue(2);
    await embedSearchQuery(base);
    expect(redis.expire).not.toHaveBeenCalled();
  });

  it("ignores a cached value that isn't a vector", async () => {
    redis.get.mockResolvedValue('{"not":"a vector"}');
    await expect(embedSearchQuery(base)).resolves.toMatchObject({ cacheHit: false });
  });

  it("throws a rate-limit error with the seconds left in the window", async () => {
    redis.incr.mockResolvedValue(QUERY_RATE_LIMIT_MAX + 1);

    const error = await embedSearchQuery({ ...base, now: NOW }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(QueryRateLimitError);
    expect((error as QueryRateLimitError).retryAfterSeconds).toBe(50);
    expect(embed).not.toHaveBeenCalled();
  });

  it("allows the last request in the window", async () => {
    redis.incr.mockResolvedValue(QUERY_RATE_LIMIT_MAX);
    await expect(embedSearchQuery(base)).resolves.toMatchObject({ cacheHit: false });
  });

  it("searches without cache or limit when Redis fails", async () => {
    redis.get.mockRejectedValue(new Error("down"));
    redis.incr.mockRejectedValue(new Error("down"));
    redis.set.mockRejectedValue(new Error("down"));

    await expect(embedSearchQuery(base)).resolves.toEqual({
      embedding: [0.1, 0.2, 0.3],
      cacheHit: false,
    });
    expect(console.warn).toHaveBeenCalledTimes(3);
  });

  it("doesn't wait on a Redis that never answers", async () => {
    vi.useFakeTimers();
    const never = () => new Promise<never>(() => {});
    redis.get.mockImplementation(never);
    redis.incr.mockImplementation(never);
    redis.set.mockImplementation(never);

    const pending = embedSearchQuery(base);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toMatchObject({ cacheHit: false });
    expect(console.warn).toHaveBeenCalledWith(
      "[search] query embedding cache read failed:",
      "Redis timed out"
    );
  });

  it("propagates an embedding failure", async () => {
    embed.mockRejectedValue(new Error("openai down"));
    await expect(embedSearchQuery(base)).rejects.toThrow("openai down");
    expect(redis.set).not.toHaveBeenCalled();
  });
});

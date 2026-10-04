import { createHash } from "node:crypto";
import { getRedisConnection } from "@/lib/redis";
import { createOpenAiEmbeddingProvider } from "@/lib/embeddings/openaiProvider";

/**
 * Embeds a natural-language search query (#409) with the `context` serving
 * model. A query costs about $0.0000002, so the cache and the rate limit are
 * about latency and runaway callers, not spend:
 *
 * - The vector is cached in Redis by `sha256(normalized query, model, dims)`,
 *   so a repeat — including the same words typed again — skips OpenAI.
 * - Only cache misses count against the per-caller limit.
 *
 * Redis is an optimisation here, never a dependency: each call is bounded by
 * `REDIS_TIMEOUT_MS` (the shared connection queues commands indefinitely
 * while disconnected), and a Redis failure means "no cache, no limit", not a
 * failed search.
 */

export const QUERY_EMBEDDING_CACHE_PREFIX = "search:qembed:v1:";
export const QUERY_EMBEDDING_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
export const QUERY_RATE_LIMIT_PREFIX = "search:qembed:rl:";
export const QUERY_RATE_LIMIT_WINDOW_SECONDS = 60;
export const QUERY_RATE_LIMIT_MAX = 30;
const REDIS_TIMEOUT_MS = 250;

export class QueryRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many semantic searches; try again shortly");
    this.name = "QueryRateLimitError";
  }
}

/** Case, Unicode form and whitespace don't change what a query means. */
export function normalizeQuery(query: string): string {
  return query.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

export function queryEmbeddingCacheKey(normalized: string, model: string, dims: number): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([normalized, model, dims]))
    .digest("hex");
  return `${QUERY_EMBEDDING_CACHE_PREFIX}${digest}`;
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Redis timed out")), REDIS_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function readCache(key: string): Promise<number[] | null> {
  try {
    const cached = await withTimeout(getRedisConnection().get(key));
    if (!cached) return null;
    const parsed: unknown = JSON.parse(cached);
    return Array.isArray(parsed) ? (parsed as number[]) : null;
  } catch (error) {
    console.warn("[search] query embedding cache read failed:", (error as Error).message);
    return null;
  }
}

async function writeCache(key: string, embedding: number[]): Promise<void> {
  try {
    await withTimeout(
      getRedisConnection().set(
        key,
        JSON.stringify(embedding),
        "EX",
        QUERY_EMBEDDING_CACHE_TTL_SECONDS
      )
    );
  } catch (error) {
    console.warn("[search] query embedding cache write failed:", (error as Error).message);
  }
}

/**
 * Fixed one-minute window per caller. Throws `QueryRateLimitError` over the
 * limit; fails open when Redis can't answer.
 */
async function consumeRateLimit(caller: string, now: number): Promise<void> {
  const windowStart = Math.floor(now / 1000 / QUERY_RATE_LIMIT_WINDOW_SECONDS);
  const key = `${QUERY_RATE_LIMIT_PREFIX}${caller}:${windowStart}`;
  let count: number;
  try {
    const redis = getRedisConnection();
    count = await withTimeout(redis.incr(key));
    if (count === 1) {
      await withTimeout(redis.expire(key, QUERY_RATE_LIMIT_WINDOW_SECONDS * 2));
    }
  } catch (error) {
    console.warn("[search] query rate limit unavailable:", (error as Error).message);
    return;
  }
  if (count > QUERY_RATE_LIMIT_MAX) {
    const windowEndsAt = (windowStart + 1) * QUERY_RATE_LIMIT_WINDOW_SECONDS * 1000;
    throw new QueryRateLimitError(Math.max(1, Math.ceil((windowEndsAt - now) / 1000)));
  }
}

export async function embedSearchQuery(params: {
  query: string;
  model: string;
  dims: number;
  /** Who the rate limit counts against, e.g. `friend:3:ip:10.0.0.4`. */
  caller: string;
  now?: number;
}): Promise<{ embedding: number[]; cacheHit: boolean }> {
  const normalized = normalizeQuery(params.query);
  const key = queryEmbeddingCacheKey(normalized, params.model, params.dims);

  const cached = await readCache(key);
  if (cached) return { embedding: cached, cacheHit: true };

  await consumeRateLimit(params.caller, params.now ?? Date.now());

  const provider = createOpenAiEmbeddingProvider(params.model, params.dims);
  const [embedding] = await provider.embed([normalized]);
  await writeCache(key, embedding);
  return { embedding, cacheHit: false };
}

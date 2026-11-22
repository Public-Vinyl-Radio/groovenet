import { getRedisConnection } from "@/lib/redis";

/**
 * Rate limiting for the endpoints that cost something or can be abused (#1074):
 * the Discogs import, download enqueueing, audio ingest and every call that
 * spends money on a third-party API. A fixed window counted in Redis, which the
 * app already depends on, so the count is shared by every app process.
 *
 * Fails open: if Redis is slow or down, requests go through. A limiter that
 * takes the app down with Redis is worse than the abuse it prevents.
 */

export interface RateLimitPolicy {
  /** Short, stable name; part of the Redis key and the 429 body. */
  name: string;
  /** Requests allowed per client in one window. */
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMIT_POLICIES = {
  /** A full Discogs sync is minutes of API calls and database writes. */
  discogsImport: { name: "discogs-import", limit: 6, windowSeconds: 600 },
  /** One request queues one album's tracks; the UI queues albums one at a time. */
  downloadEnqueue: { name: "download-enqueue", limit: 60, windowSeconds: 60 },
  /** A listener posts a ~15 s chunk, so about 4 a minute per device. */
  audioIngest: { name: "audio-ingest", limit: 120, windowSeconds: 60 },
  /** OpenAI, Apple Music and YouTube: every call is billed or quota-limited. */
  paidApi: { name: "paid-api", limit: 30, windowSeconds: 60 },
  /**
   * Hook for per-user login (#569): apply with `withRateLimit` to the sign-in
   * route, keyed by `clientKey` (or by the username once there is one). Unused
   * until that route exists.
   */
  login: { name: "login", limit: 10, windowSeconds: 900 },
} as const satisfies Record<string, RateLimitPolicy>;

/** How long a limiter call may take before it is ignored (fail open). */
const REDIS_TIMEOUT_MS = 250;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets (0 when the limiter was skipped). */
  resetSeconds: number;
}

/**
 * Who a request counts against.
 *
 * Without login that is the client address. Behind a reverse proxy the real
 * client is in X-Forwarded-For; `TRUSTED_PROXY_HOPS` (default 1) says how many
 * proxies append to it, so the address taken is the one the nearest trusted
 * proxy saw, not whatever the client wrote at the front. With no header it falls
 * back to X-Real-IP, then one shared bucket.
 *
 * #569: once requests carry a signed-in user, return `user:<id>` here, and every
 * policy limits per person instead of per address.
 */
export function clientKey(req: Request): string {
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1);
  const forwarded = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (forwarded.length > 0) {
    return `ip:${forwarded[Math.max(0, forwarded.length - hops)]}`;
  }
  const real = req.headers.get("x-real-ip")?.trim();
  return real ? `ip:${real}` : "ip:unknown";
}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("rate limiter timed out")), REDIS_TIMEOUT_MS);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Counts one request against `key`; never throws. */
export async function checkRateLimit(
  policy: RateLimitPolicy,
  key: string,
): Promise<RateLimitResult> {
  const open: RateLimitResult = {
    allowed: true,
    limit: policy.limit,
    remaining: policy.limit,
    resetSeconds: 0,
  };
  try {
    const redisKey = `ratelimit:${policy.name}:${key}`;
    const redis = getRedisConnection();
    // INCR then EXPIRE NX in one transaction: the window starts at the first
    // request and a crash between the two cannot leave a key that never expires.
    const replies = await withTimeout(
      redis
        .multi()
        .incr(redisKey)
        .expire(redisKey, policy.windowSeconds, "NX")
        .ttl(redisKey)
        .exec(),
    );
    const count = Number(replies?.[0]?.[1]);
    const ttl = Number(replies?.[2]?.[1]);
    if (!Number.isFinite(count)) return open;
    return {
      allowed: count <= policy.limit,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - count),
      resetSeconds: ttl > 0 ? ttl : policy.windowSeconds,
    };
  } catch (error) {
    console.warn(
      `[rate-limit] ${policy.name}: skipped, ${error instanceof Error ? error.message : error}`,
    );
    return open;
  }
}

export function rateLimitResponse(policy: RateLimitPolicy, result: RateLimitResult): Response {
  return Response.json(
    {
      error: "rate_limited",
      message: `Too many requests; try again in ${result.resetSeconds} seconds.`,
      policy: policy.name,
      retry_after_seconds: result.resetSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.resetSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

/**
 * Wraps a route handler so a request over the policy gets a 429 with
 * `Retry-After` and never reaches the handler. `RATE_LIMIT_DISABLED=true` turns
 * it off (tests, or a deployment that limits at the proxy).
 *
 *   export const POST = withRateLimit(RATE_LIMIT_POLICIES.paidApi, async (req) => { ... });
 */
export function withRateLimit<Req extends Request, Rest extends unknown[]>(
  policy: RateLimitPolicy,
  handler: (req: Req, ...rest: Rest) => Promise<Response>,
): (req: Req, ...rest: Rest) => Promise<Response> {
  return async (req, ...rest) => {
    if (process.env.RATE_LIMIT_DISABLED === "true") return handler(req, ...rest);
    const result = await checkRateLimit(policy, clientKey(req));
    if (!result.allowed) return rateLimitResponse(policy, result);
    return handler(req, ...rest);
  };
}

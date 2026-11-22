import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exec = vi.fn();
const chain = { incr: vi.fn(), expire: vi.fn(), ttl: vi.fn(), exec };
chain.incr.mockReturnValue(chain);
chain.expire.mockReturnValue(chain);
chain.ttl.mockReturnValue(chain);
const multi = vi.fn(() => chain);

vi.mock("@/lib/redis", () => ({ getRedisConnection: () => ({ multi }) }));

import {
  RATE_LIMIT_POLICIES,
  checkRateLimit,
  clientKey,
  rateLimitResponse,
  withRateLimit,
} from "../rateLimit";

const policy = { name: "test", limit: 3, windowSeconds: 60 };

function req(headers: Record<string, string> = {}) {
  return new Request("http://app/api/x", { method: "POST", headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  chain.incr.mockReturnValue(chain);
  chain.expire.mockReturnValue(chain);
  chain.ttl.mockReturnValue(chain);
  delete process.env.RATE_LIMIT_DISABLED;
  delete process.env.TRUSTED_PROXY_HOPS;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("clientKey", () => {
  it("uses the last forwarded address by default, ignoring what the client wrote first", () => {
    expect(clientKey(req({ "x-forwarded-for": "6.6.6.6, 10.0.0.9" }))).toBe("ip:10.0.0.9");
  });

  it("counts trusted proxy hops from the right", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    expect(clientKey(req({ "x-forwarded-for": "6.6.6.6, 1.2.3.4, 10.0.0.9" }))).toBe("ip:1.2.3.4");
  });

  it("never reaches past the start of the header", () => {
    process.env.TRUSTED_PROXY_HOPS = "5";
    expect(clientKey(req({ "x-forwarded-for": "1.2.3.4" }))).toBe("ip:1.2.3.4");
  });

  it("falls back to x-real-ip, then one shared bucket", () => {
    expect(clientKey(req({ "x-real-ip": " 9.9.9.9 " }))).toBe("ip:9.9.9.9");
    expect(clientKey(req())).toBe("ip:unknown");
  });

  it("treats a bad hop count as one", () => {
    process.env.TRUSTED_PROXY_HOPS = "nope";
    expect(clientKey(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("ip:2.2.2.2");
  });
});

describe("checkRateLimit", () => {
  it("allows requests up to the limit and reports what is left", async () => {
    exec.mockResolvedValue([
      [null, 2],
      [null, 1],
      [null, 42],
    ]);
    const result = await checkRateLimit(policy, "ip:1.1.1.1");
    expect(result).toEqual({ allowed: true, limit: 3, remaining: 1, resetSeconds: 42 });
    expect(chain.incr).toHaveBeenCalledWith("ratelimit:test:ip:1.1.1.1");
    expect(chain.expire).toHaveBeenCalledWith("ratelimit:test:ip:1.1.1.1", 60, "NX");
  });

  it("allows the request that reaches the limit and blocks the next", async () => {
    exec.mockResolvedValueOnce([
      [null, 3],
      [null, 0],
      [null, 10],
    ]);
    expect((await checkRateLimit(policy, "k")).allowed).toBe(true);
    exec.mockResolvedValueOnce([
      [null, 4],
      [null, 0],
      [null, 9],
    ]);
    const blocked = await checkRateLimit(policy, "k");
    expect(blocked).toMatchObject({ allowed: false, remaining: 0, resetSeconds: 9 });
  });

  it("reports the whole window when the key has no ttl yet", async () => {
    exec.mockResolvedValue([
      [null, 1],
      [null, 1],
      [null, -1],
    ]);
    expect((await checkRateLimit(policy, "k")).resetSeconds).toBe(60);
  });

  it("fails open when Redis errors", async () => {
    exec.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await checkRateLimit(policy, "k");
    expect(result.allowed).toBe(true);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("ECONNREFUSED"));
  });

  it("fails open when Redis answers with something unreadable", async () => {
    exec.mockResolvedValue(null);
    expect((await checkRateLimit(policy, "k")).allowed).toBe(true);
  });

  it("fails open, and says so, when Redis hangs", async () => {
    vi.useFakeTimers();
    exec.mockReturnValue(new Promise(() => {}));
    const pending = checkRateLimit(policy, "k");
    await vi.advanceTimersByTimeAsync(300);
    expect((await pending).allowed).toBe(true);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("timed out"));
  });

  it("fails open when the connection cannot be made", async () => {
    multi.mockImplementationOnce(() => {
      throw new Error("no connection");
    });
    expect((await checkRateLimit(policy, "k")).allowed).toBe(true);
  });

  it("reports a non-Error failure too", async () => {
    exec.mockRejectedValue("boom");
    expect((await checkRateLimit(policy, "k")).allowed).toBe(true);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("boom"));
  });
});

describe("rateLimitResponse", () => {
  it("is a 429 with Retry-After and a body a client can act on", async () => {
    const res = rateLimitResponse(policy, {
      allowed: false,
      limit: 3,
      remaining: 0,
      resetSeconds: 17,
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("17");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("3");
    expect(await res.json()).toMatchObject({
      error: "rate_limited",
      policy: "test",
      retry_after_seconds: 17,
    });
  });
});

describe("withRateLimit", () => {
  it("passes the request and extra arguments to the handler while under the limit", async () => {
    exec.mockResolvedValue([
      [null, 1],
      [null, 1],
      [null, 60],
    ]);
    const handler = vi.fn<(req: Request, ctx: unknown) => Promise<Response>>(
      async () => new Response("ok"),
    );
    const wrapped = withRateLimit(policy, handler);
    const request = req({ "x-forwarded-for": "1.1.1.1" });
    const ctx = { params: Promise.resolve({ id: "1" }) };
    const res = await wrapped(request, ctx);
    expect(await res.text()).toBe("ok");
    expect(handler).toHaveBeenCalledWith(request, ctx);
    expect(chain.incr).toHaveBeenCalledWith("ratelimit:test:ip:1.1.1.1");
  });

  it("answers 429 and never calls the handler over the limit", async () => {
    exec.mockResolvedValue([
      [null, 99],
      [null, 0],
      [null, 30],
    ]);
    const handler = vi.fn(async () => new Response("ok"));
    const res = await withRateLimit(policy, handler)(req());
    expect(res.status).toBe(429);
    expect(handler).not.toHaveBeenCalled();
  });

  it("does nothing when RATE_LIMIT_DISABLED is true", async () => {
    process.env.RATE_LIMIT_DISABLED = "true";
    const handler = vi.fn(async () => new Response("ok"));
    await withRateLimit(policy, handler)(req());
    expect(handler).toHaveBeenCalled();
    expect(multi).not.toHaveBeenCalled();
  });
});

describe("policies", () => {
  it("have unique names, so no two share a counter", () => {
    const names = Object.values(RATE_LIMIT_POLICIES).map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("leave an ingesting listener room: more than one chunk every 15 seconds", () => {
    const { limit, windowSeconds } = RATE_LIMIT_POLICIES.audioIngest;
    expect(limit / windowSeconds).toBeGreaterThan(1 / 15);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbQuery: vi.fn(),
  ping: vi.fn(),
  checkEmbeddingProvider: vi.fn(),
  getQueueHealth: vi.fn(),
}));
vi.mock("@/lib/serverDb", () => ({ dbQuery: mocks.dbQuery }));
vi.mock("@/lib/redis", () => ({ getRedisConnection: () => ({ ping: mocks.ping }) }));
vi.mock("@/server/services/embeddingHealthService", () => ({
  checkEmbeddingProvider: mocks.checkEmbeddingProvider,
}));
vi.mock("@/server/services/embeddingQueueService", () => ({
  embeddingQueueService: { getQueueHealth: mocks.getQueueHealth },
}));

import { GET } from "./route";

const fetchMock = vi.fn();

type Service = { service: string; status: string; detail?: string; meta?: unknown };
const byName = (body: { services: Service[] }, name: string) =>
  body.services.find((s) => s.service === name)!;

describe("GET /api/status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    mocks.dbQuery.mockResolvedValue({ rows: [] });
    mocks.ping.mockResolvedValue("PONG");
    mocks.checkEmbeddingProvider.mockResolvedValue(undefined);
    mocks.getQueueHealth.mockResolvedValue({ paused: false, queueDepth: 2, failedCount: 1 });
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("reports every service up when each probe succeeds", async () => {
    const body = await (await GET()).json();
    expect(body.services.map((s: Service) => [s.service, s.status])).toEqual([
      ["app", "up"],
      ["database", "up"],
      ["redis", "up"],
      ["essentia", "up"],
      ["ga-service", "up"],
      ["embeddings", "up"],
      ["embedding_queue", "up"],
    ]);
    expect(byName(body, "embedding_queue").meta).toEqual({ queueDepth: 2, failedCount: 1 });
    expect(typeof body.checkedAt).toBe("string");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://essentia:8001/health",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(fetchMock).toHaveBeenCalledWith("http://ga-service:8002/health", expect.anything());
  });

  it("derives health urls from the configured service urls and falls back on bad ones", async () => {
    vi.stubEnv("ESSENTIA_API_URL", "http://ess.local:9000/analyze");
    vi.stubEnv("GA_SERVICE_URL", "not a url");
    await GET();
    expect(fetchMock).toHaveBeenCalledWith("http://ess.local:9000/health", expect.anything());
    expect(fetchMock).toHaveBeenCalledWith("http://ga-service:8002/health", expect.anything());

    fetchMock.mockClear();
    vi.stubEnv("ESSENTIA_API_URL", "::bad");
    await GET();
    expect(fetchMock).toHaveBeenCalledWith("http://essentia:8001/health", expect.anything());
  });

  it("reports failing probes as down with their detail", async () => {
    mocks.dbQuery.mockRejectedValue(new Error("db down"));
    mocks.ping.mockResolvedValue("NOPE");
    fetchMock.mockResolvedValue({ ok: false, status: 502 });
    mocks.checkEmbeddingProvider.mockRejectedValue("quota");
    const body = await (await GET()).json();
    expect(byName(body, "database")).toMatchObject({ status: "down", detail: "db down" });
    expect(byName(body, "redis")).toMatchObject({
      status: "down",
      detail: "unexpected reply: NOPE",
    });
    expect(byName(body, "essentia")).toMatchObject({ status: "down", detail: "HTTP 502" });
    expect(byName(body, "embeddings")).toMatchObject({ status: "down", detail: "quota" });
  });

  it("marks a paused embedding queue down, and an unreadable one unknown", async () => {
    mocks.getQueueHealth.mockResolvedValue({
      paused: true,
      lastError: "auth",
      queueDepth: 0,
      failedCount: 0,
    });
    let body = await (await GET()).json();
    expect(byName(body, "embedding_queue")).toMatchObject({ status: "down", detail: "auth" });

    mocks.getQueueHealth.mockRejectedValue(new Error("redis gone"));
    body = await (await GET()).json();
    expect(byName(body, "embedding_queue")).toMatchObject({
      status: "unknown",
      detail: "redis gone",
    });
    mocks.getQueueHealth.mockRejectedValue("gone");
    body = await (await GET()).json();
    expect(byName(body, "embedding_queue").detail).toBe("gone");
  });

  it("times out a probe that never answers", async () => {
    vi.useFakeTimers();
    try {
      mocks.dbQuery.mockReturnValue(new Promise(() => {}));
      const pending = GET();
      await vi.advanceTimersByTimeAsync(3100);
      const body = await (await pending).json();
      expect(byName(body, "database")).toMatchObject({ status: "down", detail: "timeout" });
    } finally {
      vi.useRealTimers();
    }
  });
});

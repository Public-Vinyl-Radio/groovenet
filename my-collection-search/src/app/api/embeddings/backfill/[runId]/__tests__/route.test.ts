import { describe, it, expect, vi, beforeEach } from "vitest";

const queue = vi.hoisted(() => ({ getBackfillRun: vi.fn() }));

vi.mock("@/server/services/embeddingQueueService", () => ({
  embeddingQueueService: queue,
}));

import { GET } from "../route";

const request = new Request("http://app/api/embeddings/backfill/run-1");

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    run_id: "run-1",
    queued: 10,
    success: 7,
    skipped: 2,
    failed: 1,
    errors: [],
    started_at: 1,
    updated_at: 2,
    complete: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/embeddings/backfill/[runId]", () => {
  it("returns the run's counters", async () => {
    queue.getBackfillRun.mockResolvedValue(makeRun());

    const res = await GET(request, { params: Promise.resolve({ runId: "run-1" }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: 7, skipped: 2, failed: 1 });
  });

  it("404s an unknown or expired run", async () => {
    queue.getBackfillRun.mockResolvedValue(null);

    const res = await GET(request, { params: Promise.resolve({ runId: "gone" }) });

    expect(res.status).toBe(404);
  });

  it("reports a lookup failure as 500", async () => {
    queue.getBackfillRun.mockRejectedValue(new Error("redis is gone"));

    const res = await GET(request, { params: Promise.resolve({ runId: "run-1" }) });

    expect(res.status).toBe(500);
  });

  it("stringifies a non-Error rejection", async () => {
    queue.getBackfillRun.mockRejectedValue("redis is gone");

    const res = await GET(request, { params: Promise.resolve({ runId: "run-1" }) });

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("redis is gone");
  });

  it("falls back to a generic message for an empty Error message", async () => {
    queue.getBackfillRun.mockRejectedValue(new Error(""));

    const res = await GET(request, { params: Promise.resolve({ runId: "run-1" }) });

    expect((await res.json()).error).toBe("Failed to read backfill run");
  });
});

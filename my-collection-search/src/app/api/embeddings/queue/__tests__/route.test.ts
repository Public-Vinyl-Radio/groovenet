import { describe, it, expect, vi, beforeEach } from "vitest";

const service = vi.hoisted(() => ({
  getQueueStatus: vi.fn(),
}));

vi.mock("@/server/services/embeddingQueueService", () => ({
  embeddingQueueService: service,
}));

import { GET } from "../route";

const STATUS = {
  lanes: { interactive: 0, sync: 0, bulk: 0 },
  retrying: 0,
  failed_count: 0,
  paused: false,
  last_error: undefined,
  interval_seconds: 10,
  batch_size: 100,
  drain_rate_per_minute: 600,
  eta_seconds: 0,
  by_kind: { identity: 0, audio_vibe: 0, context: 0 },
  by_kind_sampled: false,
  active_backfill_runs: [],
  failed: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  service.getQueueStatus.mockResolvedValue(STATUS);
});

describe("GET /api/embeddings/queue", () => {
  it("returns the queue status as-is", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(STATUS);
  });

  it("reports a lookup failure as 500", async () => {
    service.getQueueStatus.mockRejectedValue(new Error("redis is gone"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("redis is gone");
  });

  it("stringifies a non-Error rejection", async () => {
    service.getQueueStatus.mockRejectedValue("redis is gone");
    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("redis is gone");
  });

  it("falls back to a generic message for an empty Error message", async () => {
    service.getQueueStatus.mockRejectedValue(new Error(""));
    const res = await GET();
    expect((await res.json()).error).toBe("Failed to read embedding queue status");
  });
});

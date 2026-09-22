/**
 * Manual aggregation backfill (#304).
 *
 * Both automatic triggers are bounded by PLAY_AGGREGATION_LOOKBACK_MINUTES, so
 * a backlog older than that only gets picked up here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const detections = vi.hoisted(() => ({ listActiveSourceIds: vi.fn() }));
const aggregation = vi.hoisted(() => ({ aggregateSource: vi.fn() }));

vi.mock("@/server/repositories/playDetectionRepository", () => ({
  playDetectionRepository: detections,
}));
vi.mock("@/server/services/playAggregationService", () => ({
  playAggregationService: aggregation,
}));

import { POST } from "../route";

function post(body: unknown): Request {
  return new Request("http://app/api/spins/aggregate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  detections.listActiveSourceIds.mockResolvedValue([]);
  aggregation.aggregateSource.mockResolvedValue({ created: 0, skipped: 0 });
});

describe("POST /api/spins/aggregate", () => {
  it("400s a missing since", async () => {
    const res = await POST(post({}));
    expect(res.status).toBe(400);
    expect(detections.listActiveSourceIds).not.toHaveBeenCalled();
  });

  it("aggregates every active source when no source_id is given", async () => {
    detections.listActiveSourceIds.mockResolvedValue(["a", "b"]);
    aggregation.aggregateSource
      .mockResolvedValueOnce({ created: 2, skipped: 1 })
      .mockResolvedValueOnce({ created: 0, skipped: 3 });

    const res = await POST(post({ since: "2026-08-01T00:00:00Z" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(detections.listActiveSourceIds).toHaveBeenCalledWith("2026-08-01T00:00:00Z");
    expect(aggregation.aggregateSource).toHaveBeenCalledWith("a", "2026-08-01T00:00:00Z");
    expect(aggregation.aggregateSource).toHaveBeenCalledWith("b", "2026-08-01T00:00:00Z");
    expect(body).toEqual({
      since: "2026-08-01T00:00:00Z",
      created: 2,
      skipped: 4,
      sources: [
        { source_id: "a", created: 2, skipped: 1 },
        { source_id: "b", created: 0, skipped: 3 },
      ],
    });
  });

  it("scopes to one source, without listing active sources", async () => {
    aggregation.aggregateSource.mockResolvedValue({ created: 1, skipped: 0 });

    const res = await POST(
      post({ since: "2026-08-01T00:00:00Z", source_id: "living-room-vinyl" })
    );
    const body = await res.json();

    expect(detections.listActiveSourceIds).not.toHaveBeenCalled();
    expect(aggregation.aggregateSource).toHaveBeenCalledWith(
      "living-room-vinyl",
      "2026-08-01T00:00:00Z"
    );
    expect(body.sources).toEqual([
      { source_id: "living-room-vinyl", created: 1, skipped: 0 },
    ]);
  });

  it("reports nothing to do rather than erroring when no source is active", async () => {
    detections.listActiveSourceIds.mockResolvedValue([]);

    const res = await POST(post({ since: "2026-08-01T00:00:00Z" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      since: "2026-08-01T00:00:00Z",
      created: 0,
      skipped: 0,
      sources: [],
    });
    expect(aggregation.aggregateSource).not.toHaveBeenCalled();
  });

  it("500s when aggregation fails", async () => {
    detections.listActiveSourceIds.mockResolvedValue(["a"]);
    aggregation.aggregateSource.mockRejectedValue(new Error("db exploded"));

    const res = await POST(post({ since: "2026-08-01T00:00:00Z" }));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("db exploded");
  });

  it("500s a rejection that is not an Error", async () => {
    detections.listActiveSourceIds.mockRejectedValue("boom");

    const res = await POST(post({ since: "2026-08-01T00:00:00Z" }));

    expect(res.status).toBe(500);
  });
});

/**
 * The pipeline health summary (#299).
 *
 * Mostly about one failure: an empty reference index makes every other number
 * look healthy while nothing can possibly match.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const ingests = vi.hoisted(() => ({ statsSince: vi.fn() }));
const detections = vi.hoisted(() => ({ statsSince: vi.fn() }));
const fingerprints = vi.hoisted(() => ({ countFingerprints: vi.fn() }));
const redis = vi.hoisted(() => ({ llen: vi.fn(), hgetall: vi.fn() }));

vi.mock("@/server/repositories/audioIngestRepository", () => ({
  audioIngestRepository: ingests,
}));
vi.mock("@/server/repositories/playDetectionRepository", () => ({
  playDetectionRepository: detections,
}));
vi.mock("@/server/repositories/fingerprintRepository", () => ({
  fingerprintRepository: fingerprints,
}));
vi.mock("@/lib/redis", () => ({ getRedisConnection: () => redis }));

const sweeper = vi.hoisted(() => ({ ingestDirWritable: vi.fn(() => true) }));
vi.mock("@/server/services/ingestSweeperService", () => sweeper);

import { IngestDebugService } from "../ingestDebugService";

const service = new IngestDebugService();

beforeEach(() => {
  vi.clearAllMocks();
  sweeper.ingestDirWritable.mockReturnValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
  ingests.statsSince.mockResolvedValue({
    byStatus: { processed: 10, failed: 1 },
    failures: [{ error: "decode failed", count: 1 }],
    oldestInFlight: null,
  });
  detections.statsSince.mockResolvedValue({
    windows: 10, matched: 8, noMatch: 2,
    bands: [{ band: "0.90-1.00", count: 8 }],
  });
  fingerprints.countFingerprints.mockResolvedValue(3783);
  redis.llen.mockResolvedValue(3);
  redis.hgetall.mockResolvedValue({
    fingerprint_type: "chromaprint",
    fingerprint_version: "1",
  });
});

describe("stats() — the index", () => {
  it("reports the index for the engine the worker advertises", async () => {
    const s = await service.stats();

    expect(s.index).toMatchObject({
      engine_registered: true,
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
      indexed_tracks: 3783,
      empty: false,
    });
    expect(fingerprints.countFingerprints).toHaveBeenCalledWith({
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
    });
  });

  it("says outright when the index is empty", async () => {
    // The failure this whole endpoint exists for: everything downstream looks
    // fine, and not one window can ever match.
    fingerprints.countFingerprints.mockResolvedValue(0);

    const s = await service.stats();

    expect(s.index.empty).toBe(true);
  });

  it("reports no engine rather than an index of zero when the worker is down", async () => {
    // Those are different problems and want different fixes.
    redis.hgetall.mockResolvedValue({});

    const s = await service.stats();

    expect(s.index.engine_registered).toBe(false);
    expect(s.index.fingerprint_type).toBeNull();
    expect(fingerprints.countFingerprints).not.toHaveBeenCalled();
  });
});

describe("stats() — counters", () => {
  it("summarises ingests and their failures", async () => {
    const s = await service.stats();

    expect(s.ingests.by_status).toEqual({ processed: 10, failed: 1 });
    expect(s.ingests.failures).toEqual([{ error: "decode failed", count: 1 }]);
  });

  it("computes the match rate", async () => {
    const s = await service.stats();
    expect(s.detections.match_rate).toBe(0.8);
  });

  it("reports a null match rate rather than dividing by zero", async () => {
    detections.statsSince.mockResolvedValue({
      windows: 0, matched: 0, noMatch: 0, bands: [],
    });

    const s = await service.stats();

    expect(s.detections.match_rate).toBeNull();
  });

  it("carries the confidence bands through", async () => {
    const s = await service.stats();
    expect(s.detections.confidence_bands).toEqual([{ band: "0.90-1.00", count: 8 }]);
  });

  it("surfaces the oldest in-flight chunk", async () => {
    ingests.statsSince.mockResolvedValue({
      byStatus: {}, failures: [],
      oldestInFlight: {
        id: "i9", status: "processing",
        received_at: new Date("2026-09-21T02:00:00Z"),
      },
    });

    const s = await service.stats();

    expect(s.ingests.oldest_in_flight).toEqual({
      ingest_id: "i9", status: "processing",
      received_at: "2026-09-21T02:00:00.000Z",
    });
  });
});

describe("stats() — the volume", () => {
  it("reports a writable volume", async () => {
    expect((await service.stats()).ingest_writable).toBe(true);
  });

  it("reports an unwritable volume, which makes everything else moot", async () => {
    sweeper.ingestDirWritable.mockReturnValue(false);

    const s = await service.stats();

    expect(s.ingest_writable).toBe(false);
  });
});

describe("stats() — resilience", () => {
  it("reports a null queue depth rather than failing when redis is down", async () => {
    // Redis being unreachable is worth showing, not worth losing the rest over.
    redis.llen.mockRejectedValue(new Error("connection refused"));

    const s = await service.stats();

    expect(s.queue_depth).toBeNull();
    expect(s.detections.windows).toBe(10);
  });

  it("scopes the window and the source", async () => {
    await service.stats(15, "aswitch");

    expect(detections.statsSince.mock.calls[0][1]).toBe("aswitch");
    expect(ingests.statsSince.mock.calls[0][1]).toBe("aswitch");
    const since = ingests.statsSince.mock.calls[0][0] as Date;
    expect(Date.now() - since.getTime()).toBeGreaterThanOrEqual(15 * 60_000 - 50);
  });

  it("reports the window it summarised", async () => {
    const s = await service.stats(15, "aswitch");
    expect(s).toMatchObject({ window_minutes: 15, source_id: "aswitch" });
  });
});

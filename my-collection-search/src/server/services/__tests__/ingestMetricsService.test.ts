/**
 * Counters for what leaves no row behind (#280).
 *
 * Against a small in-memory fake: the Redis semantics that matter (MULTI,
 * pipeline reply shapes) are checked for real in
 * ingestMetricsService.integration.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const store = vi.hoisted(() => new Map<string, Map<string, number>>());
const expiries = vi.hoisted(() => new Map<string, number>());
const fail = vi.hoisted(() => ({
  exec: false,
  read: false,
  multi: false,
  /** When set, what the pipeline's exec resolves to instead of real replies. */
  reply: undefined as unknown,
}));

vi.mock("@/lib/redis", () => ({
  getRedisConnection: () => ({
    multi: () => {
      if (fail.multi) throw new Error("connection is closed");
      const ops: Array<() => void> = [];
      const tx = {
        hincrby(key: string, field: string, by: number) {
          ops.push(() => {
            const hash = store.get(key) ?? new Map<string, number>();
            hash.set(field, (hash.get(field) ?? 0) + by);
            store.set(key, hash);
          });
          return tx;
        },
        expire(key: string, seconds: number) {
          ops.push(() => expiries.set(key, seconds));
          return tx;
        },
        exec: async () => {
          if (fail.exec) throw new Error("ECONNREFUSED");
          ops.forEach((op) => op());
          return [];
        },
      };
      return tx;
    },
    pipeline: () => {
      const keys: string[] = [];
      const p = {
        hgetall(key: string) {
          keys.push(key);
          return p;
        },
        exec: async () => {
          if (fail.read) throw new Error("ECONNREFUSED");
          if (fail.reply !== undefined) return fail.reply;
          return keys.map((key) => [
            null,
            Object.fromEntries(
              [...(store.get(key) ?? new Map()).entries()].map(([f, v]) => [f, String(v)])
            ),
          ]);
        },
      };
      return p;
    },
  }),
}));

import {
  BUCKET_MS,
  IngestMetricsService,
  METRICS_TTL_SECONDS,
  bucketKey,
  bucketKeys,
  latencyBand,
} from "../ingestMetricsService";

const metrics = new IngestMetricsService();
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  store.clear();
  expiries.clear();
  fail.exec = false;
  fail.read = false;
  fail.multi = false;
  fail.reply = undefined;
  vi.restoreAllMocks();
});

describe("buckets", () => {
  it("covers every five-minute bucket a window touches", () => {
    const now = 10 * BUCKET_MS + 1;
    expect(bucketKeys(now - BUCKET_MS, now)).toEqual([bucketKey(9 * BUCKET_MS), bucketKey(now)]);
  });

  it.each([
    [5_000, "le_30s"],
    [30_000, "le_30s"],
    [45_000, "le_60s"],
    [119_000, "le_120s"],
    [200_000, "le_300s"],
    [3_600_000, "gt_300s"],
  ])("puts %ims of latency in %s", (ms, band) => {
    expect(latencyBand(ms)).toBe(band);
  });
});

describe("IngestMetricsService", () => {
  it("counts into the current bucket and keeps it only as long as the stats can ask", async () => {
    metrics.chunkReceived();
    metrics.chunkRejected("audio_too_short");
    await flush();

    const [key] = [...store.keys()];
    expect(store.get(key)?.get("chunks.received")).toBe(1);
    expect(store.get(key)?.get("chunks.rejected.audio_too_short")).toBe(1);
    expect(expiries.get(key)).toBe(METRICS_TTL_SECONDS);
  });

  it("never throws, whatever Redis does", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fail.exec = true;
    expect(() => metrics.chunkAccepted()).not.toThrow();
    await flush();
    expect(error).toHaveBeenCalledWith("Could not record ingest metrics:", expect.any(Error));
  });

  it("never throws when the client refuses the transaction outright", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fail.multi = true;
    expect(() => metrics.chunkReceived()).not.toThrow();
    expect(error).toHaveBeenCalledWith("Could not record ingest metrics:", expect.any(Error));
  });

  it("skips zero increments rather than writing them", async () => {
    metrics.increment({ "chunks.received": 0, "chunks.accepted": 1 });
    await flush();
    const [hash] = [...store.values()];
    expect([...hash.keys()]).toEqual(["chunks.accepted"]);
  });

  it("orders ties by name, so the output is stable", async () => {
    metrics.chunkRejected("audio_too_short");
    metrics.chunkRejected("audio_too_long");
    metrics.chunkFailed("upload");
    metrics.chunkFailed("store");
    metrics.chunkFailed("store");
    metrics.chunkFailed("validation");
    await flush();

    const summary = await metrics.summarize(new Date(Date.now() - 60_000));
    expect(summary.chunks.rejected_by_reason.map((r) => r.reason)).toEqual([
      "audio_too_long",
      "audio_too_short",
    ]);
    expect(summary.chunks.failed_by_stage).toEqual([
      { stage: "store", count: 2 },
      { stage: "upload", count: 1 },
      { stage: "validation", count: 1 },
    ]);
  });

  it("treats an empty pipeline reply and a missing hash as nothing counted", async () => {
    fail.reply = null;
    expect((await metrics.summarize(new Date(Date.now() - 60_000))).chunks.received).toBe(0);
    fail.reply = [[null, null]];
    expect((await metrics.summarize(new Date(Date.now() - 60_000))).chunks.received).toBe(0);
  });

  it("surfaces an error inside a pipeline reply", async () => {
    fail.reply = [[new Error("WRONGTYPE"), null]];
    await expect(metrics.summarize(new Date(Date.now() - 60_000))).rejects.toThrow("WRONGTYPE");
  });

  it("summarizes a window into the stats shape", async () => {
    const now = Date.now();
    metrics.chunkReceived();
    metrics.chunkReceived();
    metrics.chunkReceived();
    metrics.chunkReceived();
    metrics.chunkAccepted();
    metrics.chunkDuplicate();
    metrics.chunkRejected("audio_too_short");
    metrics.chunkRejected("audio_too_short");
    metrics.chunkRejected("invalid_audio_stream");
    metrics.chunkFailed("store");
    metrics.enqueueFailed();
    metrics.playConfirmed(20_000);
    metrics.playConfirmed(40_000);
    metrics.playConfirmed(null);
    await flush();

    const summary = await metrics.summarize(new Date(now - 60 * 60_000), now);

    expect(summary.bucket_minutes).toBe(5);
    expect(summary.chunks).toEqual({
      received: 4,
      accepted: 1,
      duplicate: 1,
      rejected: 3,
      rejected_by_reason: [
        { reason: "audio_too_short", count: 2 },
        { reason: "invalid_audio_stream", count: 1 },
      ],
      failed_by_stage: [{ stage: "store", count: 1 }],
      enqueue_failed: 1,
    });
    // Three confirmed, two with a known latency: the average is over those two.
    expect(summary.plays.confirmed).toBe(3);
    expect(summary.plays.latency_ms_avg).toBe(30_000);
    expect(summary.plays.latency_bands).toEqual([
      { band: "le_30s", count: 1 },
      { band: "le_60s", count: 1 },
      { band: "le_120s", count: 0 },
      { band: "le_300s", count: 0 },
      { band: "gt_300s", count: 0 },
    ]);
  });

  it("reports zeros, not nothing, for a quiet window", async () => {
    const summary = await metrics.summarize(new Date(Date.now() - 60_000));
    expect(summary.chunks.received).toBe(0);
    expect(summary.chunks.rejected_by_reason).toEqual([]);
    expect(summary.plays.latency_ms_avg).toBeNull();
  });

  it("lets a failed read surface, for the caller to report as unknown", async () => {
    fail.read = true;
    await expect(metrics.summarize(new Date(Date.now() - 60_000))).rejects.toThrow();
  });
});

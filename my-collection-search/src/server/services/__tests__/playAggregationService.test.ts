import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { listRecentBySource, listActiveSourceIds, findAutomaticSessionByDetectionId, createAutomaticSpinSession } = vi.hoisted(() => ({
  listRecentBySource: vi.fn(), listActiveSourceIds: vi.fn(), findAutomaticSessionByDetectionId: vi.fn(), createAutomaticSpinSession: vi.fn(),
}));
vi.mock("@/server/repositories/playDetectionRepository", () => ({ playDetectionRepository: { listRecentBySource, listActiveSourceIds } }));
vi.mock("@/server/services/spinLoggingService", () => ({ spinLoggingService: { findAutomaticSessionByDetectionId, createAutomaticSpinSession } }));
import {
  aggregationIntervalMs,
  aggregationLookbackMs,
  aggregationTick,
  groupDetections,
  PlayAggregationService,
  resetAggregationClock,
  startPlayAggregation,
} from "../playAggregationService";
import type { PlayDetectionRow } from "@/types/playDetection";

function detection(overrides: Partial<PlayDetectionRow> = {}): PlayDetectionRow {
  return {
    id: "d1", ingest_id: "i1", source_id: "listener", session_id: null,
    track_id: "track-a", friend_id: 1, confidence: 0.9, offset_seconds: null,
    window_start_at: "2026-09-20T12:00:00Z", fingerprint_type: "chromaprint",
    fingerprint_version: "1", created_at: "2026-09-20T12:00:00Z", ...overrides,
  };
}

describe("groupDetections", () => {
  it("groups repeated detections of one track into one play", () => {
    const plays = groupDetections([
      detection(), detection({ id: "d2", window_start_at: "2026-09-20T12:00:15Z" }),
    ]);
    expect(plays).toHaveLength(1);
    expect(plays[0]).toMatchObject({ confidence: 0.9, first: { id: "d1" }, last: { id: "d2" } });
  });

  it("starts a new play after the configured gap", () => {
    const plays = groupDetections([
      detection(), detection({ id: "d2", window_start_at: "2026-09-20T12:01:00Z" }),
    ], { gapSeconds: 45 });
    expect(plays).toHaveLength(2);
  });

  it("does not let an unmatched or low-confidence window create a play", () => {
    expect(groupDetections([
      detection({ track_id: null, friend_id: null, confidence: null }),
      detection({ id: "low", confidence: 0.5 }),
    ], { confidenceFloor: 0.75 })).toEqual([]);
  });

  it("ignores every incomplete or invalid candidate shape", () => {
    expect(groupDetections([
      detection({ track_id: null }),
      detection({ id: "no-friend", friend_id: null }),
      detection({ id: "no-confidence", confidence: null }),
      detection({ id: "no-window", window_start_at: null }),
      detection({ id: "bad-window", window_start_at: "not-a-date" }),
    ])).toEqual([]);
  });

  it("splits a play when the detected track changes", () => {
    expect(groupDetections([
      detection(), detection({ id: "d2", track_id: "track-b" }),
    ])).toHaveLength(2);
  });

  it("creates only plays that have not already been aggregated", async () => {
    listRecentBySource.mockResolvedValue([detection(), detection({ id: "d2", track_id: "track-b", window_start_at: "2026-09-20T12:00:15Z" })]);
    findAutomaticSessionByDetectionId.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);
    const result = await new PlayAggregationService().aggregateSource("listener", "2026-09-20T11:00:00Z");
    expect(result).toEqual({ created: 1, skipped: 1 });
    expect(createAutomaticSpinSession).toHaveBeenCalledWith(expect.objectContaining({ detection_id: "d2", source_id: "listener", track_id: "track-b" }));
  });
});

// ─── countPending (#304) — the read-only twin used by vinyl status ───────────

describe("countPending", () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts plays that have not yet been written to spins, without writing", async () => {
    listRecentBySource.mockResolvedValue([detection(), detection({ id: "d2", track_id: "track-b", window_start_at: "2026-09-20T12:00:15Z" })]);
    findAutomaticSessionByDetectionId.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);

    const count = await new PlayAggregationService().countPending("listener", "2026-09-20T11:00:00Z");

    expect(count).toBe(1);
    expect(createAutomaticSpinSession).not.toHaveBeenCalled();
  });

  it("is zero when everything in scope is already aggregated", async () => {
    listRecentBySource.mockResolvedValue([detection()]);
    findAutomaticSessionByDetectionId.mockResolvedValue({ id: 1 });

    expect(await new PlayAggregationService().countPending("listener", "2026-09-20T11:00:00Z")).toBe(0);
  });

  it("is zero when there is nothing to group into a play", async () => {
    listRecentBySource.mockResolvedValue([]);
    expect(await new PlayAggregationService().countPending("listener", "2026-09-20T11:00:00Z")).toBe(0);
    expect(findAutomaticSessionByDetectionId).not.toHaveBeenCalled();
  });
});

// ─── scheduler (#304) ─────────────────────────────────────────────────────────
//
// Wiring, not grouping: `aggregateSource` was fully built and tested by #279
// and never called from anywhere. These tests are about the two triggers this
// fixes, not the grouping rule above, which they reuse unchanged.

describe("aggregationIntervalMs() / aggregationLookbackMs()", () => {
  afterEach(() => {
    delete process.env.PLAY_AGGREGATION_INTERVAL_MINUTES;
    delete process.env.PLAY_AGGREGATION_LOOKBACK_MINUTES;
  });

  it("defaults to 5 minutes between passes and a 60 minute lookback", () => {
    expect(aggregationIntervalMs()).toBe(5 * 60_000);
    expect(aggregationLookbackMs()).toBe(60 * 60_000);
  });

  it("reads both from the environment", () => {
    process.env.PLAY_AGGREGATION_INTERVAL_MINUTES = "2";
    process.env.PLAY_AGGREGATION_LOOKBACK_MINUTES = "30";
    expect(aggregationIntervalMs()).toBe(2 * 60_000);
    expect(aggregationLookbackMs()).toBe(30 * 60_000);
  });

  it("falls back to the default for a non-positive or junk value", () => {
    process.env.PLAY_AGGREGATION_INTERVAL_MINUTES = "0";
    process.env.PLAY_AGGREGATION_LOOKBACK_MINUTES = "nope";
    expect(aggregationIntervalMs()).toBe(5 * 60_000);
    expect(aggregationLookbackMs()).toBe(60 * 60_000);
  });
});

describe("aggregationTick()", () => {
  const NOW = new Date("2026-09-22T00:00:00Z").getTime();
  const MINUTE = 60_000;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAggregationClock();
    listActiveSourceIds.mockResolvedValue([]);
    listRecentBySource.mockResolvedValue([]);
  });

  it("aggregates every active source on the first tick", async () => {
    listActiveSourceIds.mockResolvedValue(["listener-1", "listener-2"]);
    listRecentBySource.mockResolvedValue([]);

    await aggregationTick(NOW);

    expect(listRecentBySource).toHaveBeenCalledWith("listener-1", expect.any(Date));
    expect(listRecentBySource).toHaveBeenCalledWith("listener-2", expect.any(Date));
  });

  it("does nothing again until the interval has elapsed", async () => {
    await aggregationTick(NOW);
    listActiveSourceIds.mockClear();

    await aggregationTick(NOW + 1 * MINUTE); // default interval is 5 minutes

    expect(listActiveSourceIds).not.toHaveBeenCalled();
  });

  it("ticks again once the interval has elapsed", async () => {
    await aggregationTick(NOW);
    listActiveSourceIds.mockClear();

    await aggregationTick(NOW + 6 * MINUTE);

    expect(listActiveSourceIds).toHaveBeenCalled();
  });

  it("one source's failure does not stop the others", async () => {
    listActiveSourceIds.mockResolvedValue(["bad", "good"]);
    listRecentBySource.mockImplementation((sourceId: string) =>
      sourceId === "bad" ? Promise.reject(new Error("db exploded")) : Promise.resolve([])
    );
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(aggregationTick(NOW)).resolves.toBeUndefined();

    expect(listRecentBySource).toHaveBeenCalledWith("good", expect.any(Date));
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("survives the active-sources query itself failing", async () => {
    listActiveSourceIds.mockRejectedValue(new Error("connection reset"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(aggregationTick(NOW)).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe("startPlayAggregation()", () => {
  const GUARD = "__groovenetPlayAggregationStarted";
  const timerImpl = globalThis.setInterval;
  let timers: ReturnType<typeof setInterval>[];

  beforeEach(() => {
    vi.clearAllMocks();
    resetAggregationClock();
    delete (globalThis as Record<string, unknown>)[GUARD];
    listActiveSourceIds.mockResolvedValue([]);
    timers = [];
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(globalThis, "setInterval").mockImplementation(((fn: () => void, ms: number) => {
      const handle = timerImpl(fn, ms);
      timers.push(handle);
      return handle;
    }) as typeof setInterval);
  });

  afterEach(() => {
    for (const handle of timers) clearInterval(handle);
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (globalThis as Record<string, unknown>)[GUARD];
  });

  it("starts only once per process", () => {
    startPlayAggregation();
    startPlayAggregation();
    expect(globalThis.setInterval).toHaveBeenCalledTimes(1);
  });

  it("ticks every minute", () => {
    startPlayAggregation();
    expect(globalThis.setInterval).toHaveBeenCalledWith(expect.any(Function), 60_000);
  });

  it("aggregates on startup rather than waiting out the first interval", async () => {
    vi.useRealTimers();
    startPlayAggregation();
    await vi.waitFor(() => expect(listActiveSourceIds).toHaveBeenCalled());
  });
});

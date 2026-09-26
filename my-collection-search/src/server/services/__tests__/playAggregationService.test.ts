import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { listRecentBySource, listActiveSourceIds, findAutomaticSessionByDetectionId, createAutomaticSpinSession } = vi.hoisted(() => ({
  listRecentBySource: vi.fn(), listActiveSourceIds: vi.fn(), findAutomaticSessionByDetectionId: vi.fn(), createAutomaticSpinSession: vi.fn(),
}));
vi.mock("@/server/repositories/playDetectionRepository", () => ({ playDetectionRepository: { listRecentBySource, listActiveSourceIds } }));
vi.mock("@/server/services/spinLoggingService", () => ({ spinLoggingService: { findAutomaticSessionByDetectionId, createAutomaticSpinSession } }));
const { playConfirmed } = vi.hoisted(() => ({ playConfirmed: vi.fn() }));
vi.mock("@/server/services/ingestMetricsService", () => ({ ingestMetricsService: { playConfirmed } }));
import {
  aggregationIntervalMs,
  aggregationLookbackMs,
  aggregationTick,
  groupDetections,
  isRealPlay,
  PlayAggregationService,
  resetAggregationClock,
  startPlayAggregation,
} from "../playAggregationService";
import type { PlayDetectionRow } from "@/types/playDetection";

function detection(overrides: Partial<PlayDetectionRow> = {}): PlayDetectionRow {
  return {
    id: "d1", ingest_id: "i1", source_id: "listener", session_id: null,
    track_id: "track-a", friend_id: 1, confidence: 0.9, offset_seconds: null, level_dbfs: null,
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
    listRecentBySource.mockResolvedValue([
      detection(), detection({ id: "d1b", window_start_at: "2026-09-20T12:00:15Z" }),
      detection({ id: "d2", track_id: "track-b", window_start_at: "2026-09-20T12:00:30Z" }),
      detection({ id: "d2b", track_id: "track-b", window_start_at: "2026-09-20T12:00:45Z" }),
    ]);
    findAutomaticSessionByDetectionId.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);
    const result = await new PlayAggregationService().aggregateSource("listener", "2026-09-20T11:00:00Z");
    expect(result).toEqual({ created: 1, skipped: 1 });
    expect(createAutomaticSpinSession).toHaveBeenCalledWith(expect.objectContaining({ detection_id: "d2", source_id: "listener", track_id: "track-b" }));
  });

  it("logs each confirmed play with its capture-to-spin latency (#280)", async () => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: new Date("2026-09-20T12:01:00Z"), toFake: ["Date"] });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      listRecentBySource.mockResolvedValue([
        detection({ session_id: "sess-1" }),
        detection({ id: "d1b", ingest_id: "i2", window_start_at: "2026-09-20T12:00:15Z", confidence: 0.95 }),
      ]);
      findAutomaticSessionByDetectionId.mockResolvedValue(null);

      await new PlayAggregationService().aggregateSource("listener", "2026-09-20T11:00:00Z");

      // From the capture of the newest window, 12:00:15, to now, 12:01:00.
      expect(playConfirmed).toHaveBeenCalledWith(45_000);
      const line = JSON.parse(log.mock.calls[0][0] as string);
      expect(line).toMatchObject({
        event: "play.confirmed",
        ingest_id: "i2",
        source_id: "listener",
        session_id: "sess-1",
        detection_id: "d1",
        track_id: "track-a",
        confidence: 0.95,
        windows: 2,
        captured_at: "2026-09-20T12:00:15.000Z",
        latency_ms: 45_000,
      });
    } finally {
      vi.useRealTimers();
      log.mockRestore();
    }
  });

  it("does not count a play it skipped as already aggregated", async () => {
    vi.clearAllMocks();
    listRecentBySource.mockResolvedValue([detection(), detection({ id: "d1b", window_start_at: "2026-09-20T12:00:15Z" })]);
    findAutomaticSessionByDetectionId.mockResolvedValue({ id: 1 });
    await new PlayAggregationService().aggregateSource("listener", "2026-09-20T11:00:00Z");
    expect(playConfirmed).not.toHaveBeenCalled();
  });
});

// ─── countPending (#304) — the read-only twin used by vinyl status ───────────

describe("countPending", () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts plays that have not yet been written to spins, without writing", async () => {
    listRecentBySource.mockResolvedValue([
      detection(), detection({ id: "d1b", window_start_at: "2026-09-20T12:00:15Z" }),
      detection({ id: "d2", track_id: "track-b", window_start_at: "2026-09-20T12:00:30Z" }),
      detection({ id: "d2b", track_id: "track-b", window_start_at: "2026-09-20T12:00:45Z" }),
    ]);
    findAutomaticSessionByDetectionId.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);

    const count = await new PlayAggregationService().countPending("listener", "2026-09-20T11:00:00Z");

    expect(count).toBe(1);
    expect(createAutomaticSpinSession).not.toHaveBeenCalled();
  });

  it("is zero when everything in scope is already aggregated", async () => {
    listRecentBySource.mockResolvedValue([detection(), detection({ id: "d1b", window_start_at: "2026-09-20T12:00:15Z" })]);
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

// ─── what counts as a play ────────────────────────────────────────────────────

describe("isRealPlay", () => {
  it("needs two windows by default", () => {
    expect(isRealPlay({ windows: 1, rate: null })).toBe(false);
    expect(isRealPlay({ windows: 2, rate: null })).toBe(true);
    expect(isRealPlay({ windows: 1, rate: null }, { minWindows: 1 })).toBe(true);
  });

  it("needs the position to advance with the clock where it is known", () => {
    expect(isRealPlay({ windows: 5, rate: 1.0 })).toBe(true);
    expect(isRealPlay({ windows: 5, rate: 0.92 })).toBe(true); // -8% pitch
    expect(isRealPlay({ windows: 5, rate: 1.08 })).toBe(true); // +8% pitch
    expect(isRealPlay({ windows: 5, rate: 0 })).toBe(false); // stuck on one spot
    expect(isRealPlay({ windows: 5, rate: 0.5 })).toBe(false);
    expect(isRealPlay({ windows: 5, rate: 1.6 })).toBe(false);
  });
});

describe("groupDetections rate", () => {
  const at = (s: number) => new Date(Date.parse("2026-09-26T04:00:00Z") + s * 1000).toISOString();
  const win = (id: string, s: number, offset: number | null) =>
    detection({ id, window_start_at: at(s), offset_seconds: offset });

  it("is the median step, so one window on a repeat cannot sink a long play", () => {
    const plays = groupDetections([
      win("a", 0, 10), win("b", 15, 25), win("c", 30, 40), win("d", 45, -1 + 56), win("e", 60, 70), win("f", 75, 85),
    ]);
    expect(plays[0].windows).toBe(6);
    expect(plays[0].rate).toBeCloseTo(1.0, 5);
  });

  it("ignores clamped zero offsets, and is unknown with fewer than two positions", () => {
    expect(groupDetections([win("a", 0, 0), win("b", 15, 12)])[0].rate).toBeNull();
    expect(groupDetections([win("a", 0, null), win("b", 15, null)])[0].rate).toBeNull();
  });

  it("skips two positions reported for the same moment", () => {
    // A window can carry more than one candidate row; they share a start time.
    expect(groupDetections([win("a", 0, 10), win("b", 0, 11)])[0].rate).toBeNull();
  });

  it("averages the middle two of an even count", () => {
    const plays = groupDetections([win("a", 0, 10), win("b", 15, 25), win("c", 30, 40.3)]);
    expect(plays[0].rate).toBeCloseTo((1 + 15.3 / 15) / 2, 5);
  });
});

describe("the 2026-09-25 evening (Bandalos Chinos on aswitch)", () => {
  // From real detections: two genuine plays, three single-window false matches
  // at track boundaries, and idle-chain hiss that matched Gnonnas Pedro at the
  // same spot (7:08) window after window.
  const T0 = Date.parse("2026-09-26T03:58:31Z");
  let n = 0;
  const w = (s: number, track: string | null, offset: number | null, confidence = 0.9) =>
    detection({
      id: `w${n++}`,
      window_start_at: new Date(T0 + s * 1000).toISOString(),
      track_id: track,
      friend_id: track ? 1 : null,
      confidence: track ? confidence : null,
      offset_seconds: offset,
    });

  const evening = [
    ...[0, 15, 30, 45].map((s, i) => w(s, "bandalos-hermanos", 167 + i * 15)),
    w(60, null, null),
    w(75, null, null),
    w(90, "beach-house-irene", 787, 0.824),
    w(105, null, null),
    w(120, null, null),
    ...Array.from({ length: 18 }, (_, i) => w(135 + i * 15, "bandalos-tema-de-susana", 2 + i * 15)),
    w(405, "los-reyes-adeoy", 202, 0.813),
    w(420, "gnonnas-la-musica", 428, 0.876),
    w(435, null, null),
    // Needle up: hiss matching the same spot, over and over.
    ...[450, 465, 480].map((s) => w(s, "gnonnas-la-musica", 428, 0.87)),
  ];

  it("makes spins for the two records played, and none for the noise", async () => {
    listRecentBySource.mockResolvedValue(evening);
    findAutomaticSessionByDetectionId.mockResolvedValue(null);
    createAutomaticSpinSession.mockClear();

    // Five runs group; one window each for Beach House and Los Reyes, and four
    // for Gnonnas Pedro — a lone window plus the hiss — which passes a window
    // minimum alone. It is rejected because its position never moves.
    const runs = groupDetections(evening);
    expect(runs.map((r) => [r.first.track_id, r.windows, r.rate])).toEqual([
      ["bandalos-hermanos", 4, 1],
      ["beach-house-irene", 1, null],
      ["bandalos-tema-de-susana", 18, 1],
      ["los-reyes-adeoy", 1, null],
      ["gnonnas-la-musica", 4, 0],
    ]);

    const result = await new PlayAggregationService().aggregateSource("aswitch", "2026-09-26T03:00:00Z");

    expect(result.created).toBe(2);
    expect(createAutomaticSpinSession.mock.calls.map((c) => c[0].track_id)).toEqual([
      "bandalos-hermanos",
      "bandalos-tema-de-susana",
    ]);
  });

  it("counts the same two as pending", async () => {
    listRecentBySource.mockResolvedValue(evening);
    findAutomaticSessionByDetectionId.mockResolvedValue(null);
    expect(await new PlayAggregationService().countPending("aswitch", "2026-09-26T03:00:00Z")).toBe(2);
  });
});

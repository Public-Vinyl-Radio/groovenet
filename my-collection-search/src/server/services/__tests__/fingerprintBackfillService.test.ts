import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const indexService = vi.hoisted(() => ({ startRun: vi.fn() }));
vi.mock("@/server/services/fingerprintIndexService", () => ({
  fingerprintIndexService: indexService,
}));

import {
  backfillIntervalMinutes,
  backfillTick,
  resetBackfillClock,
  startFingerprintBackfill,
  verifyIntervalMinutes,
  verifyTick,
} from "../fingerprintBackfillService";

const NOW = new Date("2026-09-22T00:00:00Z").getTime();
const MINUTE = 60_000;

beforeEach(() => {
  vi.clearAllMocks();
  resetBackfillClock();
  indexService.startRun.mockResolvedValue({ run_id: "r1", queued: 0 });
});

afterEach(() => {
  delete process.env.FINGERPRINT_BACKFILL_INTERVAL_MINUTES;
  delete process.env.FINGERPRINT_VERIFY_INTERVAL_MINUTES;
});

// ─── verify pass (#303) ───────────────────────────────────────────────────────

describe("verifyTick()", () => {
  // The missing pass never looks at a track that already has a fingerprint;
  // this is what catches audio replaced behind an unchanged path.

  it("re-checks every fingerprinted track: the changed scope", async () => {
    await verifyTick(NOW);
    expect(indexService.startRun).toHaveBeenCalledWith({ kind: "changed" });
  });

  it("runs hourly by default, on its own clock", async () => {
    await verifyTick(NOW);
    await verifyTick(NOW + 59 * MINUTE);
    expect(indexService.startRun).toHaveBeenCalledTimes(1);

    // The missing pass keeping its own interval does not reset this one.
    await backfillTick(NOW + 59 * MINUTE);
    expect(indexService.startRun).toHaveBeenLastCalledWith({ kind: "missing" });

    await verifyTick(NOW + 60 * MINUTE);
    expect(indexService.startRun).toHaveBeenLastCalledWith({ kind: "changed" });
  });

  it("reads its interval from the environment", () => {
    expect(verifyIntervalMinutes()).toBe(60);
    process.env.FINGERPRINT_VERIFY_INTERVAL_MINUTES = "15";
    expect(verifyIntervalMinutes()).toBe(15);
    process.env.FINGERPRINT_VERIFY_INTERVAL_MINUTES = "0";
    expect(verifyIntervalMinutes()).toBe(60);
  });

  it("says how many tracks it is verifying, and stays quiet when none", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    indexService.startRun.mockResolvedValueOnce({ run_id: "r1", queued: 3900 });
    await verifyTick(NOW);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("verifying 3900"));

    log.mockClear();
    await verifyTick(NOW + 61 * MINUTE);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("logs a failure rather than throwing, and tries again next interval", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    indexService.startRun.mockRejectedValueOnce(new Error("no engine registered"));
    await expect(verifyTick(NOW)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("[fingerprint-backfill] verify tick failed:", expect.any(Error));
    error.mockRestore();
  });
});

// ─── backfillIntervalMinutes ────────────────────────────────────────────────────

describe("backfillIntervalMinutes()", () => {
  it("defaults to 30 minutes", () => {
    expect(backfillIntervalMinutes()).toBe(30);
  });

  it("reads the configured interval", () => {
    process.env.FINGERPRINT_BACKFILL_INTERVAL_MINUTES = "5";
    expect(backfillIntervalMinutes()).toBe(5);
  });

  it("falls back to the default for a non-positive value", () => {
    process.env.FINGERPRINT_BACKFILL_INTERVAL_MINUTES = "0";
    expect(backfillIntervalMinutes()).toBe(30);
  });

  it("falls back to the default for junk", () => {
    process.env.FINGERPRINT_BACKFILL_INTERVAL_MINUTES = "soon";
    expect(backfillIntervalMinutes()).toBe(30);
  });
});

// ─── backfillTick ───────────────────────────────────────────────────────────────

describe("backfillTick()", () => {
  it("queues the missing scope on the first tick", async () => {
    await backfillTick(NOW);
    expect(indexService.startRun).toHaveBeenCalledWith({ kind: "missing" });
  });

  it("does nothing again until the interval has elapsed", async () => {
    await backfillTick(NOW);
    indexService.startRun.mockClear();

    await backfillTick(NOW + 5 * MINUTE); // default interval is 30 minutes

    expect(indexService.startRun).not.toHaveBeenCalled();
  });

  it("ticks again once the interval has elapsed", async () => {
    await backfillTick(NOW);
    indexService.startRun.mockClear();

    await backfillTick(NOW + 31 * MINUTE);

    expect(indexService.startRun).toHaveBeenCalledWith({ kind: "missing" });
  });

  it("logs how many tracks it queued", async () => {
    indexService.startRun.mockResolvedValue({ run_id: "r1", queued: 29 });
    const logged = vi.spyOn(console, "log").mockImplementation(() => {});

    await backfillTick(NOW);

    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("queued 29 track(s)")
    );
    logged.mockRestore();
  });

  it("never queues a track scope — this pass is library-wide by design", async () => {
    await backfillTick(NOW);
    const [scope] = indexService.startRun.mock.calls[0];
    expect(scope).not.toHaveProperty("track_id");
  });

  it("survives a tick that throws — e.g. no fingerprint engine registered", async () => {
    // Routine when fingerprint-service is down; the next tick tries again.
    indexService.startRun.mockRejectedValue(
      new Error("No fingerprint engine registered")
    );
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(backfillTick(NOW)).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

// ─── startFingerprintBackfill ─────────────────────────────────────────────────

// Captured before any spy replaces it.
const timerImpl = globalThis.setInterval;

describe("startFingerprintBackfill()", () => {
  const GUARD = "__groovenetFingerprintBackfillStarted";
  let timers: ReturnType<typeof setInterval>[];

  beforeEach(() => {
    delete (globalThis as Record<string, unknown>)[GUARD];
    timers = [];
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    // Remember every timer registered. One test runs on real timers, and a
    // stray 60s interval would keep the suite's event loop alive.
    vi.spyOn(globalThis, "setInterval").mockImplementation(((
      fn: () => void,
      ms: number
    ) => {
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
    startFingerprintBackfill();
    startFingerprintBackfill();

    expect(globalThis.setInterval).toHaveBeenCalledTimes(1);
  });

  it("ticks every minute", () => {
    startFingerprintBackfill();

    expect(globalThis.setInterval).toHaveBeenCalledWith(expect.any(Function), 60_000);
  });

  it("queues a backfill run on startup rather than waiting out the first interval", async () => {
    // Real timers: the tick resolves through a mocked promise, which fake
    // timers do not advance on their own.
    vi.useRealTimers();

    startFingerprintBackfill();

    await vi.waitFor(() =>
      expect(indexService.startRun).toHaveBeenCalledWith({ kind: "missing" })
    );
    await vi.waitFor(() =>
      expect(indexService.startRun).toHaveBeenCalledWith({ kind: "changed" })
    );
  });

  it("hands the timer a callback that ticks again", async () => {
    startFingerprintBackfill();
    const registered = (globalThis.setInterval as unknown as {
      mock: { calls: [() => void, number][] };
    }).mock.calls[0][0];

    indexService.startRun.mockClear();
    resetBackfillClock();
    vi.useRealTimers();

    registered();

    await vi.waitFor(() =>
      expect(indexService.startRun).toHaveBeenCalledWith({ kind: "missing" })
    );
    await vi.waitFor(() =>
      expect(indexService.startRun).toHaveBeenCalledWith({ kind: "changed" })
    );
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const indexService = vi.hoisted(() => ({ startRun: vi.fn() }));
vi.mock("@/server/services/fingerprintIndexService", () => ({
  fingerprintIndexService: indexService,
}));

import {
  backfillIntervalMinutes,
  backfillTick,
  resetBackfillClock,
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

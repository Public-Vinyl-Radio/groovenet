import { fingerprintIndexService } from "@/server/services/fingerprintIndexService";

/**
 * Backstop for #303.
 *
 * The transition trigger in `PATCH /api/tracks` covers the common case —
 * audio arriving through the download worker — immediately. This covers
 * everything else: audio that appears by some other path, and a transition
 * that fired while `fingerprint-service` had no engine registered and so
 * failed to queue. Re-running the "missing" scope on a timer is the same
 * query the CLI's `fingerprint-library --missing` already uses, so nothing
 * new is added to the matching side — only when it runs.
 *
 * Ticks every minute like the ingest sweeper (#269) and reaper (#276) and
 * decides internally whether enough time has passed, so the interval is
 * configurable without restarting the timer. Idempotent by construction: a
 * tick that finds no track missing a fingerprint queues nothing.
 */

const GLOBAL_BACKFILL_KEY = "__groovenetFingerprintBackfillStarted";

type GlobalWithBackfill = typeof globalThis & {
  [GLOBAL_BACKFILL_KEY]?: boolean;
};

function positiveNumber(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function backfillIntervalMinutes(): number {
  return positiveNumber(process.env.FINGERPRINT_BACKFILL_INTERVAL_MINUTES, 30);
}

/**
 * How often every fingerprinted track is checked for replaced audio (#303).
 * Cheap because the worker `stat`s first and hashes only files whose size or
 * mtime moved — except once, after deploy, for rows fingerprinted before
 * those were recorded.
 */
export function verifyIntervalMinutes(): number {
  return positiveNumber(process.env.FINGERPRINT_VERIFY_INTERVAL_MINUTES, 60);
}

let lastBackfillAtMs = 0;
let lastVerifyAtMs = 0;

/** One scheduler tick: queue the "missing" scope if the interval has elapsed. */
export async function backfillTick(now: number = Date.now()): Promise<void> {
  if (now - lastBackfillAtMs < backfillIntervalMinutes() * 60_000) return;
  lastBackfillAtMs = now;

  try {
    const run = await fingerprintIndexService.startRun({ kind: "missing" });
    if (run.queued > 0) {
      console.log(
        `[fingerprint-backfill] queued ${run.queued} track(s) with no fingerprint`
      );
    }
  } catch (error) {
    // No engine registered (fingerprint-service down) is routine, not an
    // error worth escalating — the next tick tries again. A missed pass
    // costs latency until then, never availability.
    console.error("[fingerprint-backfill] tick failed:", error);
  }
}

/**
 * One scheduler tick: queue the "changed" scope if its interval has elapsed.
 *
 * The "missing" pass above never looks at a track that already has a
 * fingerprint, so audio replaced behind an unchanged path — a re-rip, a
 * re-download — was invisible to every automatic pass. This re-checks them
 * all; the worker skips everything whose file has not moved.
 */
export async function verifyTick(now: number = Date.now()): Promise<void> {
  if (now - lastVerifyAtMs < verifyIntervalMinutes() * 60_000) return;
  lastVerifyAtMs = now;

  try {
    const run = await fingerprintIndexService.startRun({ kind: "changed" });
    if (run.queued > 0) {
      console.log(
        `[fingerprint-backfill] verifying ${run.queued} fingerprinted track(s) against their audio`
      );
    }
  } catch (error) {
    // Same as the missing pass: an engine that is not up yet is routine.
    console.error("[fingerprint-backfill] verify tick failed:", error);
  }
}

/** Exported for tests: the ticks' interval bookkeeping is module state. */
export function resetBackfillClock(): void {
  lastBackfillAtMs = 0;
  lastVerifyAtMs = 0;
}

/** Start the backfill scheduler, once per process. */
export function startFingerprintBackfill(): void {
  const g = globalThis as GlobalWithBackfill;
  if (g[GLOBAL_BACKFILL_KEY]) return;
  g[GLOBAL_BACKFILL_KEY] = true;

  void backfillTick();
  void verifyTick();
  setInterval(() => {
    void backfillTick();
    void verifyTick();
  }, 60_000);

  console.log("[fingerprint-backfill] started");
}

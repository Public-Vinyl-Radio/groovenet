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

let lastBackfillAtMs = 0;

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

/** Exported for tests: the tick's interval bookkeeping is module state. */
export function resetBackfillClock(): void {
  lastBackfillAtMs = 0;
}

/** Start the backfill scheduler, once per process. */
export function startFingerprintBackfill(): void {
  const g = globalThis as GlobalWithBackfill;
  if (g[GLOBAL_BACKFILL_KEY]) return;
  g[GLOBAL_BACKFILL_KEY] = true;

  void backfillTick();
  setInterval(() => {
    void backfillTick();
  }, 60_000);

  console.log("[fingerprint-backfill] started");
}

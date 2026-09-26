import fsp from "node:fs/promises";
import path from "node:path";
import {
  audioIngestRepository,
  type AudioIngestRow,
} from "@/server/repositories/audioIngestRepository";
import { playDetectionRepository } from "@/server/repositories/playDetectionRepository";
import { ingestDir } from "@/server/services/ingestSweeperService";
import {
  aggregationLookbackMs,
  playAggregationService,
} from "@/server/services/playAggregationService";
import type { IngestResultReport, ReapSummary } from "@/types/audioIngest";

/**
 * The `audio_ingests` lifecycle after `received` (#276).
 *
 * `POST /api/audio/ingest` answers `202` because the answer is not known yet;
 * this is where it arrives. `fingerprint-service` claims a chunk, works on it,
 * and reports a terminal result — and whatever happens, the raw audio is
 * released, because a listener produces four chunks a minute and nothing here
 * is worth keeping once it has been identified.
 *
 *     received ──claim──▶ processing ──report──▶ processed
 *        │                    │                     failed
 *        └────────────────────┴───────reap──────▶ failed
 */

const GLOBAL_REAPER_KEY = "__groovenetIngestReaperStarted";

type GlobalWithReaper = typeof globalThis & { [GLOBAL_REAPER_KEY]?: boolean };

/** How long a chunk may sit un-claimed or in-flight before it is written off. */
export function stalledAfterMs(): number {
  const minutes = Number(process.env.AUDIO_INGEST_STALL_MINUTES);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 10) * 60_000;
}

export function reapIntervalMs(): number {
  const minutes = Number(process.env.AUDIO_INGEST_REAP_INTERVAL_MINUTES);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 5) * 60_000;
}

export class IngestNotFound extends Error {
  constructor(id: string) {
    super(`no ingest ${id}`);
    this.name = "IngestNotFound";
  }
}

export class IngestLifecycleService {
  /**
   * Mark a chunk as being worked on.
   *
   * Only from `received`: a replayed or duplicated job must not drag an
   * already-finished ingest back into flight. Returns the row either way, so a
   * worker that lost the race still knows what it is holding.
   */
  async claim(ingestId: string): Promise<AudioIngestRow> {
    const claimed = await audioIngestRepository.transitionStatus(
      ingestId,
      "processing",
      ["received"]
    );
    if (claimed) return claimed;

    const existing = await audioIngestRepository.findById(ingestId);
    if (!existing) throw new IngestNotFound(ingestId);
    return existing;
  }

  /**
   * Record what the matcher found and close the ingest out.
   *
   * Detections are written before the status moves: if this process dies
   * between the two, an ingest still in `processing` with rows already stored
   * is recoverable by the reaper, whereas a `processed` ingest with no rows
   * looks exactly like a window that genuinely matched nothing.
   */
  async report(report: IngestResultReport): Promise<AudioIngestRow> {
    const ingest = await audioIngestRepository.findById(report.ingest_id);
    if (!ingest) throw new IngestNotFound(report.ingest_id);

    if (report.status === "processed") {
      await this.recordDetections(ingest, report);
      // Turn a confident detection into a spin right away (#304), rather than
      // waiting on the periodic backstop (`aggregationTick`). A no-match
      // window has nothing to aggregate, so this only fires on a real match.
      if (report.candidates.length > 0) {
        await this.triggerAggregation(
          ingest.source_id,
          report.window_start_at ?? ingest.captured_at ?? null
        );
      }
    }

    const terminal = await audioIngestRepository.transitionStatus(
      report.ingest_id,
      report.status,
      ["received", "processing"],
      report.error ?? null
    );

    // Terminal either way: the audio has served its purpose, and a file kept
    // because a status update raced is a file nothing will ever come back for.
    await this.releaseFile(ingest);

    return terminal ?? ingest;
  }

  /**
   * One row per window, including the ones that matched nothing.
   *
   * A no-match window is data, not an absence: #279 finds the boundary between
   * one play and the next precisely by looking for the gap.
   */
  private async recordDetections(
    ingest: AudioIngestRow,
    report: IngestResultReport
  ): Promise<void> {
    const windowStart = report.window_start_at ?? ingest.captured_at ?? null;
    const shared = {
      ingest_id: ingest.id,
      source_id: ingest.source_id,
      session_id: ingest.session_id,
      window_start_at: windowStart,
      fingerprint_type: report.fingerprint_type ?? null,
      fingerprint_version: report.fingerprint_version ?? null,
      level_dbfs: report.level_dbfs ?? null,
    };

    if (report.candidates.length === 0) {
      await playDetectionRepository.create({
        ...shared,
        track_id: null,
        friend_id: null,
        confidence: null,
        offset_seconds: null,
      });
      return;
    }

    for (const candidate of report.candidates) {
      await playDetectionRepository.create({
        ...shared,
        track_id: candidate.track_id,
        friend_id: candidate.friend_id,
        confidence: candidate.confidence,
        offset_seconds: candidate.offset_seconds,
      });
    }
  }

  /**
   * Aggregate this source's recent detections into spin sessions.
   *
   * Best-effort: a failure here must not fail the callback that
   * `fingerprint-service` is waiting on, or leave the ingest un-terminated.
   * The periodic pass catches whatever this missed.
   */
  private async triggerAggregation(
    sourceId: string,
    capturedAt: Date | string | null
  ): Promise<void> {
    try {
      // Look back from when the window was *captured*, not from now. A
      // listener catching up on a backlog — after a DNS failure, a reboot —
      // reports windows hours old, and a lookback from now never reached
      // them: detections arrived and no spin was ever made.
      const captured = capturedAt ? new Date(capturedAt).getTime() : NaN;
      const anchor = Number.isFinite(captured) ? Math.min(captured, Date.now()) : Date.now();
      const since = new Date(anchor - aggregationLookbackMs());
      await playAggregationService.aggregateSource(sourceId, since);
    } catch (error) {
      console.error(`Failed to aggregate detections for ${sourceId}:`, error);
    }
  }

  /** Delete the raw chunk. Failure costs disk, never the result. */
  private async releaseFile(ingest: AudioIngestRow): Promise<void> {
    if (!ingest.file_path) return;
    const target = path.resolve(ingestDir(), ingest.file_path);
    const root = path.resolve(ingestDir());
    if (target !== root && !target.startsWith(root + path.sep)) {
      console.error(`Refusing to delete ${ingest.file_path}: outside the ingest volume`);
      return;
    }
    try {
      await fsp.unlink(target);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // Already gone is the outcome we wanted; the sweeper may have taken it.
      if (code !== "ENOENT") {
        console.error(`Failed to release ${ingest.file_path}:`, error);
      }
    }
  }

  /**
   * Write off ingests that never came back.
   *
   * Without this a crashed worker strands its chunk in `processing` forever,
   * and the retention sweeper (#269) will not touch a non-terminal file until
   * its age backstop fires hours later. Marking them `failed` is what lets the
   * sweeper do its job promptly — and it is the honest record of what happened.
   */
  async reapStalled(now: number = Date.now()): Promise<ReapSummary> {
    const cutoff = new Date(now - stalledAfterMs());
    const stale = await audioIngestRepository.listStale(cutoff);
    const summary: ReapSummary = { examined: stale.length, failed: 0, neverClaimed: 0 };

    for (const ingest of stale) {
      const reason =
        ingest.status === "received"
          ? "never claimed by the fingerprint service"
          : "abandoned while processing";
      // The status guard makes this safe beside a live worker: a chunk that
      // finished a moment ago is not dragged back on top of its real result.
      const failed = await audioIngestRepository.transitionStatus(
        ingest.id,
        "failed",
        [ingest.status],
        `stalled: ${reason}`
      );
      if (!failed) continue;

      summary.failed += 1;
      if (ingest.status === "received") summary.neverClaimed += 1;
      await this.releaseFile(ingest);
    }

    return summary;
  }
}

export const ingestLifecycleService = new IngestLifecycleService();

let lastReapAt = 0;

export async function reapTick(now: number = Date.now()): Promise<void> {
  if (now - lastReapAt < reapIntervalMs()) return;
  lastReapAt = now;

  try {
    const summary = await ingestLifecycleService.reapStalled(now);
    if (summary.failed > 0) {
      console.log(
        `[ingest-reaper] failed ${summary.failed} stalled ingest(s), ` +
          `${summary.neverClaimed} never claimed`
      );
    }
  } catch (error) {
    // A failed reap costs disk and accuracy, never availability.
    console.error("[ingest-reaper] reap failed:", error);
  }
}

/** Exported for tests: the interval is module state. */
export function resetReapClock(): void {
  lastReapAt = 0;
}

export function startIngestReaper(): void {
  const g = globalThis as GlobalWithReaper;
  if (g[GLOBAL_REAPER_KEY]) return;
  g[GLOBAL_REAPER_KEY] = true;

  void reapTick();
  setInterval(() => {
    void reapTick();
  }, 60_000);

  console.log("[ingest-reaper] started");
}

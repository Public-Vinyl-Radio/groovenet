import { getRedisConnection } from "@/lib/redis";
import {
  setDerivationRepository,
  type SetDerivationRepository,
} from "@/server/repositories/setDerivationRepository";
import {
  NoFingerprintEngineError,
  fingerprintIndexService,
} from "@/server/services/fingerprintIndexService";
import {
  setRecordingService,
  type SetRecordingService,
} from "@/server/services/setRecordingService";
import {
  derivePlays,
  diffAgainstPlan,
  findUnidentified,
  identifiedSeconds,
} from "@/server/services/setTracklist";
import type {
  DerivedPlay,
  SetDerivationResultReport,
  SetDerivationRow,
  SetDerivationView,
  SetTrackRef,
} from "@/types/setDerivation";

/**
 * Deriving a tracklist from a whole set recording (#282).
 *
 * The app owns the record; `fingerprint-set-worker` does the CPU work. A run
 * is created and queued here, claimed and reported by the worker, and read
 * back as a tracklist and — given a playlist — a diff against the plan.
 *
 *     queued ──claim──▶ processing ──report──▶ processed
 *                                              failed
 *
 * What the worker stores is the per-window matches, which depend only on the
 * recording, the engine and the window settings. Grouping them into plays
 * and diffing against a plan happens on read, so the same run answers for any
 * playlist and a corrected playlist diffs cleaner the next time it is read.
 */

export const SET_QUEUE_KEY = process.env.FINGERPRINT_SET_QUEUE_KEY || "fingerprint_set_queue";

export const DEFAULT_WINDOW_SECONDS = 15;
export const DEFAULT_STEP_SECONDS = 15;

/**
 * A run still queued or processing after this long is presumed dead — the
 * worker crashed or the job was lost — and a new request replaces it rather
 * than handing back a run that will never finish. A 3-hour set takes under a
 * minute, so this is generous.
 */
export function stalledAfterMs(): number {
  const minutes = Number(process.env.SET_DERIVATION_STALL_MINUTES);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 30) * 60_000;
}

export class SetDerivationNotFound extends Error {
  constructor(what: string) {
    super(`no ${what}`);
    this.name = "SetDerivationNotFound";
  }
}

export class SetDerivationQueueError extends Error {
  constructor(cause: unknown) {
    super(`could not queue the derivation: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "SetDerivationQueueError";
  }
}

export type CreateDerivationRequest = {
  recording_sha256: string;
  window_seconds?: number;
  step_seconds?: number;
  /** Start a new run even if an equivalent one exists. */
  force?: boolean;
  /** Also list the recording in this live set's media. */
  live_set_id?: number | null;
};

export type ViewOptions = { playlist_id?: number | null; live_set_id?: number | null };

type Redis = Pick<ReturnType<typeof getRedisConnection>, "lpush">;

export class SetDerivationService {
  constructor(
    private repository: SetDerivationRepository = setDerivationRepository,
    private recordings: Pick<SetRecordingService, "find"> = setRecordingService,
    private engines: Pick<typeof fingerprintIndexService, "getEngine"> = fingerprintIndexService,
    private redis: Redis = getRedisConnection()
  ) {}

  /**
   * Start a derivation, or return the equivalent one already done or running.
   *
   * "Equivalent" is the same recording, engine and window settings. A failed
   * run is never reused, and neither is one that has sat unfinished past
   * `stalledAfterMs` — that one is written off so the new run replaces it.
   */
  async create(
    request: CreateDerivationRequest,
    now: number = Date.now()
  ): Promise<{ derivation: SetDerivationRow; reused: boolean }> {
    const recording = await this.recordings.find(request.recording_sha256);
    if (!recording) throw new SetDerivationNotFound(`recording ${request.recording_sha256}`);

    const engine = await this.engines.getEngine();
    if (!engine) throw new NoFingerprintEngineError();

    if (request.live_set_id != null) {
      await this.repository.attachToLiveSet(
        request.live_set_id,
        `/api/set-recordings/${recording.sha256}`,
        recording.original_filename
      );
    }

    const key = {
      recording_sha256: recording.sha256,
      fingerprint_type: engine.fingerprint_type,
      fingerprint_version: engine.fingerprint_version,
      window_seconds: request.window_seconds ?? DEFAULT_WINDOW_SECONDS,
      step_seconds: request.step_seconds ?? DEFAULT_STEP_SECONDS,
    };

    if (!request.force) {
      const existing = await this.repository.findReusable(key);
      if (existing && !this.isStalled(existing, now)) {
        return { derivation: existing, reused: true };
      }
      if (existing) {
        await this.repository.transitionStatus(
          existing.id,
          "failed",
          ["queued", "processing"],
          "stalled: no result from the worker"
        );
      }
    }

    const derivation = await this.repository.create(key);
    try {
      await this.redis.lpush(
        SET_QUEUE_KEY,
        JSON.stringify({
          derivation_id: derivation.id,
          file_path: recording.file_path,
          window_seconds: key.window_seconds,
          step_seconds: key.step_seconds,
        })
      );
    } catch (error) {
      // Unlike an ingest, nothing retries this on its own: fail the run so it
      // is not handed back as "running" forever, and tell the caller.
      await this.repository.transitionStatus(derivation.id, "failed", ["queued"], "could not be queued");
      throw new SetDerivationQueueError(error);
    }
    return { derivation, reused: false };
  }

  private isStalled(derivation: SetDerivationRow, now: number): boolean {
    if (derivation.status !== "queued" && derivation.status !== "processing") return false;
    return now - new Date(derivation.updated_at).getTime() > stalledAfterMs();
  }

  /** The worker has picked a run up. Only from `queued`; see ingest claims. */
  async claim(id: string): Promise<SetDerivationRow> {
    const claimed = await this.repository.transitionStatus(id, "processing", ["queued"]);
    if (claimed) return claimed;
    const existing = await this.repository.findById(id);
    if (!existing) throw new SetDerivationNotFound(`derivation ${id}`);
    return existing;
  }

  /**
   * Store what the worker found and close the run. A late or duplicate report
   * for a run already terminal is ignored, and the run returned as it stands.
   */
  async report(report: SetDerivationResultReport): Promise<SetDerivationRow> {
    const completed = await this.repository.complete(report.derivation_id, {
      status: report.status,
      error: report.status === "failed" ? report.error ?? "failed without a reason" : null,
      duration_seconds: report.duration_seconds ?? null,
      windows: report.status === "processed" ? report.windows : [],
    });
    if (completed) return completed;
    const existing = await this.repository.findById(report.derivation_id);
    if (!existing) throw new SetDerivationNotFound(`derivation ${report.derivation_id}`);
    return existing;
  }

  /**
   * A run as a tracklist, its unidentified stretches, and — given a playlist
   * or live set — how the performance differed from the plan.
   */
  async view(id: string, options: ViewOptions = {}): Promise<SetDerivationView> {
    const row = await this.repository.findById(id);
    if (!row) throw new SetDerivationNotFound(`derivation ${id}`);
    const recording = await this.recordings.find(row.recording_sha256);
    if (!recording) throw new SetDerivationNotFound(`recording ${row.recording_sha256}`);

    const { windows, ...derivation } = row;
    const playlistId = await this.resolvePlaylist(options);

    if (row.status !== "processed" || !windows) {
      return { derivation, recording, summary: null, tracklist: [], unidentified: [], diff: null };
    }

    const engine = { fingerprint_type: row.fingerprint_type, fingerprint_version: row.fingerprint_version };
    const plays = derivePlays(windows);
    const tracks = await this.repository.findTracks(plays);
    const byKey = new Map(tracks.map((t) => [`${t.track_id}\u0000${t.friend_id}`, t]));
    const tracklist: DerivedPlay[] = plays.map((play) => ({
      ...play,
      track: byKey.get(`${play.track_id}\u0000${play.friend_id}`) ?? null,
    }));

    const duration = row.duration_seconds ?? recording.duration_seconds ?? null;
    const identified = identifiedSeconds(tracklist);
    const regions = duration != null ? findUnidentified(tracklist, duration) : [];
    const unidentified = await this.withUnindexedNeighbours(regions, tracklist, engine);

    const diff =
      playlistId != null
        ? diffAgainstPlan(tracklist, await this.repository.listPlannedEntries(playlistId, engine), playlistId)
        : null;

    return {
      derivation,
      recording,
      summary: {
        plays: tracklist.length,
        duration_seconds: duration,
        identified_seconds: identified,
        identified_fraction: duration ? Math.round((identified / duration) * 1000) / 1000 : null,
      },
      tracklist,
      unidentified,
      diff,
    };
  }

  private async resolvePlaylist(options: ViewOptions): Promise<number | null> {
    if (options.playlist_id != null) {
      if (!(await this.repository.playlistExists(options.playlist_id))) {
        throw new SetDerivationNotFound(`playlist ${options.playlist_id}`);
      }
      return options.playlist_id;
    }
    if (options.live_set_id != null) {
      const playlistId = await this.repository.findPlaylistIdForLiveSet(options.live_set_id);
      if (playlistId == null) throw new SetDerivationNotFound(`live set ${options.live_set_id}`);
      return playlistId;
    }
    return null;
  }

  /**
   * For each unidentified stretch, the unfingerprinted tracks on the releases
   * played either side of it. An unmatched gap between two sides of the same
   * record is usually a track that was never indexed.
   */
  private async withUnindexedNeighbours(
    regions: ReturnType<typeof findUnidentified>,
    tracklist: DerivedPlay[],
    engine: { fingerprint_type: string; fingerprint_version: string }
  ): Promise<SetDerivationView["unidentified"]> {
    const releasesFor = (region: (typeof regions)[number]) =>
      [region.before, region.after]
        .map((i) => (i == null ? null : tracklist[i]?.track?.release_id ?? null))
        .filter((r): r is string => r != null);

    const releases = [...new Set(regions.flatMap(releasesFor))];
    const unindexed: SetTrackRef[] = await this.repository.listUnindexedOnReleases(releases, engine);

    return regions.map((region) => {
      const near = new Set(releasesFor(region));
      return {
        start_seconds: region.start_seconds,
        end_seconds: region.end_seconds,
        unindexed_neighbours: unindexed.filter((t) => t.release_id != null && near.has(t.release_id)),
      };
    });
  }
}

export const setDerivationService = new SetDerivationService();

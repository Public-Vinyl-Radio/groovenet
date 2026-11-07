import { randomUUID } from "crypto";
import fs from "fs";
import type { AudioMetadataBackfillRequest, AudioMetadataBackfillRun } from "@groovenet/contracts";
import { classifyAudioSource } from "@/lib/audioSourceClassifier";
import { getRedisConnection } from "@/lib/redis";
import {
  trackRepository,
  type AudioBackfillCandidate,
} from "@/server/repositories/trackRepository";
import {
  audioFieldsFromProbe,
  trackAudioMetadataService,
} from "@/server/services/trackAudioMetadataService";

/**
 * Probe every existing local file once and fill the `audio_*` columns (#1049).
 *
 * New downloads and uploads are probed as they arrive (#1048); this covers
 * everything that was already on disk, including `audio_source`, which old
 * tracks never had. The run is in-process and in the background: `start`
 * returns the run's totals and the loop carries on, writing counters to a Redis
 * hash that `getRun` reads back. Idempotent: a track probed after its file's
 * mtime is skipped unless `force`.
 */
export const RUN_KEY_PREFIX = "audiobackfill:run:";
const RUN_TTL_SECONDS = 86_400;
const MAX_ERRORS = 50;

const SOURCES = ["apple_music", "youtube", "soundcloud", "upload", "unknown"] as const;

export const runKey = (runId: string) => `${RUN_KEY_PREFIX}${runId}`;

/** Pause between ffprobe calls so a library-wide pass doesn't hog the disk. */
function throttleMs(): number {
  const parsed = Number(process.env.AUDIO_BACKFILL_DELAY_MS);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 25;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const toInt = (value: string | undefined) => {
  const parsed = parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

type Outcome = "probed" | "skipped" | "missing" | "failed";

export class AudioMetadataBackfillService {
  private redis = getRedisConnection();

  async start(request: AudioMetadataBackfillRequest = {}): Promise<AudioMetadataBackfillRun> {
    const candidates = await trackRepository.listAudioBackfillCandidates(request.friend_id);
    const runId = randomUUID();
    const now = Date.now();
    const key = runKey(runId);

    await this.redis
      .multi()
      .hset(key, {
        run_id: runId,
        total: String(candidates.length),
        started_at: String(now),
        updated_at: String(now),
      })
      .expire(key, RUN_TTL_SECONDS)
      .exec();

    void this.execute(runId, candidates, request.force === true).catch((error) => {
      console.error(`[audio-backfill] run ${runId} aborted:`, error);
    });

    return {
      run_id: runId,
      total: candidates.length,
      probed: 0,
      skipped: 0,
      missing_files: 0,
      probe_failures: 0,
      sources: { apple_music: 0, youtube: 0, soundcloud: 0, upload: 0, unknown: 0 },
      weak_youtube_hints: 0,
      errors: [],
      started_at: now,
      updated_at: now,
      complete: candidates.length === 0,
    };
  }

  /** Runs to completion; exported for tests, which await it instead of polling. */
  async execute(
    runId: string,
    candidates: AudioBackfillCandidate[],
    force: boolean,
  ): Promise<void> {
    const key = runKey(runId);
    const delay = throttleMs();
    for (const candidate of candidates) {
      let outcome: Outcome = "failed";
      let source: string | null = null;
      let weak = false;
      let error: string | null = null;
      try {
        const result = await this.backfillOne(candidate, force);
        outcome = result.outcome;
        source = result.source ?? null;
        weak = result.weak === true;
      } catch (err) {
        error = `${candidate.track_id}: ${err instanceof Error ? err.message : String(err)}`;
      }

      const pipeline = this.redis.pipeline();
      pipeline.hincrby(key, outcome, 1);
      if (source) pipeline.hincrby(key, `source_${source}`, 1);
      if (weak) pipeline.hincrby(key, "weak_youtube_hints", 1);
      if (error) {
        pipeline.rpush(`${key}:errors`, error);
        pipeline.ltrim(`${key}:errors`, 0, MAX_ERRORS - 1);
        pipeline.expire(`${key}:errors`, RUN_TTL_SECONDS);
      }
      pipeline.hset(key, "updated_at", String(Date.now()));
      await pipeline.exec();

      if (outcome === "probed" && delay > 0) await sleep(delay);
    }
  }

  private async backfillOne(
    candidate: AudioBackfillCandidate,
    force: boolean,
  ): Promise<{ outcome: Outcome; source?: string; weak?: boolean }> {
    const filePath = trackAudioMetadataService.resolveAudioFilePath(candidate.local_audio_url);
    if (!filePath) return { outcome: "missing" };

    if (!force && candidate.audio_probed_at) {
      const probedAt = new Date(candidate.audio_probed_at).getTime();
      if (probedAt > fs.statSync(filePath).mtimeMs) return { outcome: "skipped" };
    }

    const probe = await trackAudioMetadataService.runFfprobe(filePath);
    const fields = audioFieldsFromProbe(probe);
    const classified = classifyAudioSource(probe, filePath);
    // A writer that knew where the file came from (the download worker, the
    // upload route) beats any guess from its tags.
    const source =
      candidate.audio_source && candidate.audio_source !== "unknown"
        ? candidate.audio_source
        : classified.source;

    await trackRepository.updateTrackFields({
      track_id: candidate.track_id,
      friend_id: candidate.friend_id,
      ...fields,
      audio_source: source,
    });
    return { outcome: "probed", source, weak: source === "unknown" && classified.weakYoutubeHint };
  }

  async getRun(runId: string): Promise<AudioMetadataBackfillRun | null> {
    const key = runKey(runId);
    const [stored, errors] = await Promise.all([
      this.redis.hgetall(key),
      this.redis.lrange(`${key}:errors`, 0, -1),
    ]);
    if (!stored || Object.keys(stored).length === 0) return null;

    const total = toInt(stored.total);
    const probed = toInt(stored.probed);
    const skipped = toInt(stored.skipped);
    const missing = toInt(stored.missing);
    const failed = toInt(stored.failed);
    return {
      run_id: stored.run_id ?? runId,
      total,
      probed,
      skipped,
      missing_files: missing,
      probe_failures: failed,
      sources: Object.fromEntries(SOURCES.map((s) => [s, toInt(stored[`source_${s}`])])) as Record<
        (typeof SOURCES)[number],
        number
      >,
      weak_youtube_hints: toInt(stored.weak_youtube_hints),
      errors: errors ?? [],
      started_at: toInt(stored.started_at),
      updated_at: toInt(stored.updated_at),
      complete: probed + skipped + missing + failed >= total,
    };
  }
}

export const audioMetadataBackfillService = new AudioMetadataBackfillService();

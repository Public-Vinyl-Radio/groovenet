import { randomUUID } from "crypto";
import fs from "fs";
import type { EmbeddedTagsBackfillRequest, EmbeddedTagsBackfillRun } from "@groovenet/contracts";
import { getRedisConnection } from "@/lib/redis";
import { trackRepository, type EmbeddedTagsCandidate } from "@/server/repositories/trackRepository";
import {
  embeddedTagsFromProbe,
  trackAudioMetadataService,
} from "@/server/services/trackAudioMetadataService";

/**
 * Read composer, genre and lyrics from files that were on disk before #673.
 *
 * New downloads and uploads are read as they arrive; this covers everything
 * already there. Same shape as the audio-metadata backfill: `start` returns the
 * totals, the loop carries on in the background and writes counters to a Redis
 * hash that `getRun` reads. Idempotent: a track read after its file's mtime is
 * skipped unless `force`, and writing a read twice changes nothing (composer is
 * only ever filled while empty; see `TrackRepository.saveEmbeddedTags`).
 */
export const RUN_KEY_PREFIX = "embeddedtags:run:";
const RUN_TTL_SECONDS = 86_400;
const MAX_ERRORS = 50;

export const runKey = (runId: string) => `${RUN_KEY_PREFIX}${runId}`;

const toInt = (value: string | undefined) => {
  const parsed = parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

type Outcome = "read" | "skipped" | "missing" | "failed";
type Found = { composer: boolean; genre: boolean; lyrics: boolean };

export class EmbeddedTagsBackfillService {
  private redis = getRedisConnection();

  async start(request: EmbeddedTagsBackfillRequest = {}): Promise<EmbeddedTagsBackfillRun> {
    const candidates = await trackRepository.listEmbeddedTagsCandidates(request.friend_id);
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
      console.error(`[embedded-tags] run ${runId} aborted:`, error);
    });

    return {
      run_id: runId,
      total: candidates.length,
      read: 0,
      skipped: 0,
      missing_files: 0,
      read_failures: 0,
      with_composer: 0,
      with_genre: 0,
      with_lyrics: 0,
      errors: [],
      started_at: now,
      updated_at: now,
      complete: candidates.length === 0,
    };
  }

  /** Runs to completion; exported for tests, which await it instead of polling. */
  async execute(runId: string, candidates: EmbeddedTagsCandidate[], force: boolean): Promise<void> {
    const key = runKey(runId);
    for (const candidate of candidates) {
      let outcome: Outcome = "failed";
      let found: Found | undefined;
      let error: string | null = null;
      try {
        const result = await this.readOne(candidate, force);
        outcome = result.outcome;
        found = result.found;
      } catch (err) {
        error = `${candidate.track_id}: ${err instanceof Error ? err.message : String(err)}`;
      }

      const pipeline = this.redis.pipeline();
      pipeline.hincrby(key, outcome, 1);
      if (found?.composer) pipeline.hincrby(key, "with_composer", 1);
      if (found?.genre) pipeline.hincrby(key, "with_genre", 1);
      if (found?.lyrics) pipeline.hincrby(key, "with_lyrics", 1);
      if (error) {
        pipeline.rpush(`${key}:errors`, error);
        pipeline.ltrim(`${key}:errors`, 0, MAX_ERRORS - 1);
        pipeline.expire(`${key}:errors`, RUN_TTL_SECONDS);
      }
      pipeline.hset(key, "updated_at", String(Date.now()));
      await pipeline.exec();
    }
  }

  private async readOne(
    candidate: EmbeddedTagsCandidate,
    force: boolean,
  ): Promise<{ outcome: Outcome; found?: Found }> {
    const filePath = trackAudioMetadataService.resolveAudioFilePath(candidate.local_audio_url);
    if (!filePath) return { outcome: "missing" };

    if (!force && candidate.embedded_tags_read_at) {
      const readAt = new Date(candidate.embedded_tags_read_at).getTime();
      if (readAt > fs.statSync(filePath).mtimeMs) return { outcome: "skipped" };
    }

    const tags = embeddedTagsFromProbe(await trackAudioMetadataService.runFfprobe(filePath));
    await trackRepository.saveEmbeddedTags(candidate.track_id, candidate.friend_id, tags);
    return {
      outcome: "read",
      found: {
        composer: tags.composer !== null,
        genre: tags.genres.length > 0,
        lyrics: tags.lyrics !== null,
      },
    };
  }

  async getRun(runId: string): Promise<EmbeddedTagsBackfillRun | null> {
    const key = runKey(runId);
    const [stored, errors] = await Promise.all([
      this.redis.hgetall(key),
      this.redis.lrange(`${key}:errors`, 0, -1),
    ]);
    if (!stored || Object.keys(stored).length === 0) return null;

    const total = toInt(stored.total);
    const read = toInt(stored.read);
    const skipped = toInt(stored.skipped);
    const missing = toInt(stored.missing);
    const failed = toInt(stored.failed);
    return {
      run_id: stored.run_id ?? runId,
      total,
      read,
      skipped,
      missing_files: missing,
      read_failures: failed,
      with_composer: toInt(stored.with_composer),
      with_genre: toInt(stored.with_genre),
      with_lyrics: toInt(stored.with_lyrics),
      errors: errors ?? [],
      started_at: toInt(stored.started_at),
      updated_at: toInt(stored.updated_at),
      complete: read + skipped + missing + failed >= total,
    };
  }
}

export const embeddedTagsBackfillService = new EmbeddedTagsBackfillService();

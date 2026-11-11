import { randomUUID } from "crypto";
import type { IsrcBackfillRequest, IsrcBackfillRun } from "@groovenet/contracts";
import { appleSongFromUrl, normalizeIsrc, type AppleSongRef } from "@/lib/isrc";
import { getRedisConnection } from "@/lib/redis";
import { trackRepository, type IsrcCandidate } from "@/server/repositories/trackRepository";
import { appleMusicCatalogService } from "@/server/services/appleMusicCatalogService";

/**
 * Resolve Apple Music links to ISRCs (#1156).
 *
 * `start` sorts every track in scope into an outcome it can decide without the
 * network (already has one, no usable link), hands the rest to a background loop
 * and returns the totals; counters live in a Redis hash that `getRun` reads, the
 * same shape as the audio-metadata and embedded-tags backfills. Idempotent: a
 * track Apple answered for, even with no ISRC, is stamped `isrc_checked_at` and
 * skipped next time unless `force`. A lookup that failed is not stamped, so the
 * next run retries it.
 */
export const RUN_KEY_PREFIX = "isrc:run:";
const RUN_TTL_SECONDS = 86_400;
const MAX_ERRORS = 50;

export const runKey = (runId: string) => `${RUN_KEY_PREFIX}${runId}`;

const toInt = (value: string | undefined) => {
  const parsed = parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

type Outcome = "filled" | "not_found" | "failed";
export type IsrcTarget = { candidate: IsrcCandidate; song: AppleSongRef };

export class IsrcService {
  private redis = getRedisConnection();

  async start(request: IsrcBackfillRequest = {}): Promise<IsrcBackfillRun> {
    appleMusicCatalogService.assertConfigured();

    const candidates = await trackRepository.listIsrcCandidates(request.friend_id);
    let skipped = 0;
    let noLink = 0;
    let targets: IsrcTarget[] = [];
    for (const candidate of candidates) {
      const song = appleSongFromUrl(candidate.apple_music_url);
      if (!song) noLink++;
      else if (!request.force && (candidate.isrc || candidate.isrc_checked_at)) skipped++;
      else targets.push({ candidate, song });
    }
    if (request.limit !== undefined) targets = targets.slice(0, request.limit);

    const runId = randomUUID();
    const now = Date.now();
    const key = runKey(runId);
    const dryRun = request.dry_run === true;
    const total = skipped + noLink + targets.length;

    await this.redis
      .multi()
      .hset(key, {
        run_id: runId,
        total: String(total),
        skipped: String(skipped),
        no_link: String(noLink),
        dry_run: dryRun ? "1" : "0",
        started_at: String(now),
        updated_at: String(now),
      })
      .expire(key, RUN_TTL_SECONDS)
      .exec();

    void this.execute(runId, targets, dryRun).catch((error) => {
      console.error(`[isrc] run ${runId} aborted:`, error);
    });

    return {
      run_id: runId,
      total,
      filled: 0,
      skipped,
      no_link: noLink,
      not_found: 0,
      failed: 0,
      dry_run: dryRun,
      errors: [],
      started_at: now,
      updated_at: now,
      complete: targets.length === 0,
    };
  }

  /** Runs to completion; exported for tests, which await it instead of polling. */
  async execute(runId: string, targets: IsrcTarget[], dryRun: boolean): Promise<void> {
    const key = runKey(runId);
    const byStorefront = new Map<string, IsrcTarget[]>();
    for (const target of targets) {
      const group = byStorefront.get(target.song.storefront) ?? [];
      group.push(target);
      byStorefront.set(target.song.storefront, group);
    }

    for (const [storefront, group] of byStorefront) {
      for (let i = 0; i < group.length; i += 100) {
        await this.resolveBatch(key, storefront, group.slice(i, i + 100), dryRun);
      }
    }
  }

  private async resolveBatch(
    key: string,
    storefront: string,
    batch: IsrcTarget[],
    dryRun: boolean,
  ): Promise<void> {
    const outcomes = new Map<Outcome, number>();
    const errors: string[] = [];
    const toSave: { track_id: string; friend_id: number; isrc: string | null }[] = [];
    try {
      const isrcs = await appleMusicCatalogService.fetchIsrcs(
        batch.map((t) => t.song.id),
        storefront,
      );
      for (const { candidate, song } of batch) {
        const isrc = isrcs.get(song.id) ?? null;
        toSave.push({ track_id: candidate.track_id, friend_id: candidate.friend_id, isrc });
        const outcome: Outcome = isrc ? "filled" : "not_found";
        outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
      }
      if (!dryRun) await trackRepository.saveIsrcs(toSave);
    } catch (err) {
      // The whole batch failed (lookup or write): nothing is stamped, so the next run retries it.
      outcomes.clear();
      outcomes.set("failed", batch.length);
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${batch[0].candidate.track_id}+${batch.length - 1}: ${message}`);
    }

    const pipeline = this.redis.pipeline();
    for (const [outcome, count] of outcomes) pipeline.hincrby(key, outcome, count);
    for (const error of errors) {
      pipeline.rpush(`${key}:errors`, error);
      pipeline.ltrim(`${key}:errors`, 0, MAX_ERRORS - 1);
      pipeline.expire(`${key}:errors`, RUN_TTL_SECONDS);
    }
    pipeline.hset(key, "updated_at", String(Date.now()));
    await pipeline.exec();
  }

  async getRun(runId: string): Promise<IsrcBackfillRun | null> {
    const key = runKey(runId);
    const [stored, errors] = await Promise.all([
      this.redis.hgetall(key),
      this.redis.lrange(`${key}:errors`, 0, -1),
    ]);
    if (!stored || Object.keys(stored).length === 0) return null;

    const total = toInt(stored.total);
    const filled = toInt(stored.filled);
    const skipped = toInt(stored.skipped);
    const noLink = toInt(stored.no_link);
    const notFound = toInt(stored.not_found);
    const failed = toInt(stored.failed);
    return {
      run_id: stored.run_id ?? runId,
      total,
      filled,
      skipped,
      no_link: noLink,
      not_found: notFound,
      failed,
      dry_run: stored.dry_run === "1",
      errors,
      started_at: toInt(stored.started_at),
      updated_at: toInt(stored.updated_at),
      complete: filled + skipped + noLink + notFound + failed >= total,
    };
  }

  /**
   * Keep one track's ISRC in step with its Apple Music link (#1156): called
   * after the link was edited. `knownIsrc` is what the caller already has (the
   * enrichment wizard picked an Apple result, which carries its ISRC); without
   * it the song is looked up. Never throws: a failed lookup leaves the ISRC
   * empty for the backfill to fill later.
   */
  async syncForLinkChange(
    track: { track_id: string; friend_id: number; apple_music_url?: string | null },
    knownIsrc?: unknown,
  ): Promise<void> {
    try {
      await trackRepository.clearIsrc(track.track_id, track.friend_id);
      const song = appleSongFromUrl(track.apple_music_url);
      if (!song) return;
      const isrc =
        normalizeIsrc(knownIsrc) ??
        (await appleMusicCatalogService.fetchIsrcs([song.id], song.storefront)).get(song.id) ??
        null;
      await trackRepository.saveIsrcs([
        { track_id: track.track_id, friend_id: track.friend_id, isrc },
      ]);
    } catch (error) {
      console.error(`[isrc] could not sync ${track.track_id}:`, error);
    }
  }
}

export const isrcService = new IsrcService();

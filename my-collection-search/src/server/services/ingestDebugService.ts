import { getRedisConnection } from "@/lib/redis";
import { audioIngestRepository } from "@/server/repositories/audioIngestRepository";
import { fingerprintRepository } from "@/server/repositories/fingerprintRepository";
import { playDetectionRepository } from "@/server/repositories/playDetectionRepository";
import {
  ENGINE_KEY,
  FingerprintIndexService,
} from "@/server/services/fingerprintIndexService";
import { FINGERPRINT_QUEUE_KEY } from "@/server/services/audioIngestService";
import { ingestDirWritable } from "@/server/services/ingestSweeperService";
import { ingestMetricsService } from "@/server/services/ingestMetricsService";
import { playAggregationService } from "@/server/services/playAggregationService";
import type { IngestCounters, IngestPipelineStats } from "@/types/audioIngest";

/**
 * One view of whether the vinyl pipeline is actually working (#299).
 *
 * It exists because of a specific failure: with an **empty reference index**
 * every stage looks healthy. Chunks arrive, decode, the callbacks post, the
 * ingests reach `processed` — and every single window returns no candidates.
 * Nothing short of reading a startup log line tells you.
 *
 * So `index` is reported first and unconditionally, and `indexEmpty` is stated
 * outright rather than left to be inferred from a zero.
 */
export class IngestDebugService {
  private redis = getRedisConnection();
  private indexService = new FingerprintIndexService();

  async stats(
    sinceMinutes = 60,
    sourceId?: string
  ): Promise<IngestPipelineStats> {
    const since = new Date(Date.now() - sinceMinutes * 60_000);

    const [ingest, detections, engine, queueDepth, pendingSpins, counters] = await Promise.all([
      audioIngestRepository.statsSince(since, sourceId),
      playDetectionRepository.statsSince(since, sourceId),
      this.indexService.getEngine(),
      this.queueDepth(),
      this.pendingSpinCount(since, sourceId),
      this.counters(since),
    ]);

    // Without a registered engine there is nothing to count the index against,
    // and the worker is almost certainly down — say so rather than report 0.
    const [indexedTracks, missingFingerprintTracks] = engine
      ? await Promise.all([
          fingerprintRepository.countFingerprints({
            fingerprint_type: engine.fingerprint_type,
            fingerprint_version: engine.fingerprint_version,
          }),
          fingerprintRepository.countIndexCandidates({ kind: "missing" }, engine),
        ])
      : [0, 0];

    return {
      since: since.toISOString(),
      window_minutes: sinceMinutes,
      source_id: sourceId ?? null,
      // Checked because it has already gone wrong once: an unwritable volume
      // fails every upload with EACCES while every other number looks fine.
      ingest_writable: ingestDirWritable(),
      index: {
        engine_registered: engine !== null,
        fingerprint_type: engine?.fingerprint_type ?? null,
        fingerprint_version: engine?.fingerprint_version ?? null,
        indexed_tracks: indexedTracks,
        // The headline. An empty index means nothing can ever match, however
        // healthy everything downstream looks.
        empty: indexedTracks === 0,
        // Audio that has arrived but has not been fingerprinted yet (#303) —
        // a silent gap otherwise: `local_audio_url` diffing against
        // `track_fingerprints` is the only way to notice it exists.
        missing_fingerprint_tracks: missingFingerprintTracks,
      },
      queue_depth: queueDepth,
      ingests: {
        by_status: ingest.byStatus,
        failures: ingest.failures,
        oldest_in_flight: ingest.oldestInFlight
          ? {
              ingest_id: ingest.oldestInFlight.id,
              status: ingest.oldestInFlight.status,
              received_at: new Date(
                ingest.oldestInFlight.received_at
              ).toISOString(),
            }
          : null,
      },
      detections: {
        windows: detections.windows,
        matched: detections.matched,
        no_match: detections.noMatch,
        match_rate:
          detections.windows > 0
            ? Number((detections.matched / detections.windows).toFixed(4))
            : null,
        confidence_bands: detections.bands,
      },
      spins: {
        // Confident detections not yet written to spin_sessions (#304) — the
        // aggregation equivalent of the fingerprint backlog above. Null, not
        // 0, when it could not be computed, for the same reason queue_depth
        // is null rather than 0 when redis is unreachable.
        pending: pendingSpins,
      },
      counters,
    };
  }

  /** Rejections and play latency (#280). Redis again: null, not a throw. */
  private async counters(since: Date): Promise<IngestCounters | null> {
    try {
      return await ingestMetricsService.summarize(since);
    } catch (error) {
      console.error("Could not read the ingest counters:", error);
      return null;
    }
  }

  /** Redis may be unreachable; that is worth reporting, not throwing over. */
  private async queueDepth(): Promise<number | null> {
    try {
      return await this.redis.llen(FINGERPRINT_QUEUE_KEY);
    } catch (error) {
      console.error("Could not read the fingerprint queue depth:", error);
      return null;
    }
  }

  /**
   * How many confidently-detected plays have not yet become a spin session.
   *
   * Reuses the exact grouping `aggregateSource` runs, so this is the true
   * count the next aggregation pass would create — not an approximation.
   */
  private async pendingSpinCount(
    since: Date,
    sourceId?: string
  ): Promise<number | null> {
    try {
      const sourceIds = sourceId
        ? [sourceId]
        : await playDetectionRepository.listActiveSourceIds(since);
      const counts = await Promise.all(
        sourceIds.map((id) => playAggregationService.countPending(id, since))
      );
      return counts.reduce((sum, count) => sum + count, 0);
    } catch (error) {
      console.error("Could not compute the pending spin count:", error);
      return null;
    }
  }
}

export const ingestDebugService = new IngestDebugService();
export { ENGINE_KEY };

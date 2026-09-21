import { playDetectionRepository } from "@/server/repositories/playDetectionRepository";
import { spinLoggingService } from "@/server/services/spinLoggingService";
import type { PlayDetectionRow } from "@/types/playDetection";

export const DEFAULT_PLAY_CONFIDENCE_FLOOR = Number(process.env.PLAY_CONFIDENCE_FLOOR ?? "0.75");
export const DEFAULT_PLAY_GAP_SECONDS = Number(process.env.PLAY_AGGREGATION_GAP_SECONDS ?? "45");

export type AggregatedPlay = { first: PlayDetectionRow; last: PlayDetectionRow; confidence: number };

function timestamp(detection: PlayDetectionRow): number | null {
  if (!detection.window_start_at) return null;
  const value = new Date(detection.window_start_at).getTime();
  return Number.isFinite(value) ? value : null;
}

/** Pure grouping rule: order by capture time, not queue arrival time. */
export function groupDetections(
  detections: PlayDetectionRow[],
  { confidenceFloor = DEFAULT_PLAY_CONFIDENCE_FLOOR, gapSeconds = DEFAULT_PLAY_GAP_SECONDS } = {}
): AggregatedPlay[] {
  const plays: AggregatedPlay[] = [];
  for (const detection of detections) {
    const at = timestamp(detection);
    if (!detection.track_id || !detection.friend_id || detection.confidence == null || detection.confidence < confidenceFloor || at == null) continue;
    const current = plays.at(-1);
    const currentAt = current ? timestamp(current.last) : null;
    if (current && current.first.track_id === detection.track_id && current.first.friend_id === detection.friend_id && currentAt != null && at - currentAt <= gapSeconds * 1000) {
      current.last = detection;
      current.confidence = Math.max(current.confidence, detection.confidence);
    } else {
      plays.push({ first: detection, last: detection, confidence: detection.confidence });
    }
  }
  return plays;
}

/** Turns confidently matched windows into one automatic spin per contiguous play. */
export class PlayAggregationService {
  async aggregateSource(sourceId: string, since: Date | string, options: { confidenceFloor?: number; gapSeconds?: number } = {}): Promise<{ created: number; skipped: number }> {
    const detections = await playDetectionRepository.listRecentBySource(sourceId, since);
    let created = 0;
    let skipped = 0;
    for (const play of groupDetections(detections, options)) {
      if (await spinLoggingService.findAutomaticSessionByDetectionId(play.first.id)) { skipped++; continue; }
      await spinLoggingService.createAutomaticSpinSession({
        detection_id: play.first.id, source_id: sourceId, track_id: play.first.track_id!,
        friend_id: play.first.friend_id!, played_at: play.first.window_start_at!, confidence: play.confidence,
      });
      created++;
    }
    return { created, skipped };
  }
}

export const playAggregationService = new PlayAggregationService();

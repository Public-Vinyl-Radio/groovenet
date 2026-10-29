// BPM-confidence extraction from Essentia's `rhythm` output (#531), the
// sibling of essentiaKey.ts. Shared by every write path that reads the
// analysis: the upload route, the audio-analysis SSE/upload UI and the
// backfill script. The Python twin is download-worker/worker/essentia_bpm.py.

export type EssentiaRhythm = {
  bpm?: number;
  danceability?: number;
  bpm_histogram_first_peak_bpm?: number;
  bpm_histogram_first_peak_weight?: number;
  bpm_histogram_second_peak_bpm?: number;
  bpm_histogram_second_peak_weight?: number;
};

/**
 * Below this margin the tempo is flagged as uncertain (#531).
 *
 * "Confidence" is the MARGIN between the first and second histogram peak
 * weights, not the first peak's weight alone. The weight is the share of
 * detected beat intervals that support a tempo, so it is naturally small for
 * a track with many sub-divisions; 0.282 vs 0.024 on the track that prompted
 * #531 is a clear win, which the raw weight would misreport as weak. The
 * margin is small exactly when the estimate is contested (0.30 vs 0.28) or
 * the histogram is diffuse, which is what is worth flagging. The cut-off is
 * a heuristic, not an Essentia-documented value; tune it against real data.
 */
export const BPM_CONFIDENCE_LOW_THRESHOLD = 0.1;

/**
 * The value stored as `bpm_confidence`: first-peak weight minus second-peak
 * weight, rounded to 3 decimals. A missing second peak counts as 0 (nothing
 * competes). Null when there is no first-peak weight to measure.
 */
export function extractBpmConfidence(rhythm: EssentiaRhythm | undefined): number | null {
  const first = rhythm?.bpm_histogram_first_peak_weight;
  if (typeof first !== "number" || !Number.isFinite(first)) return null;
  const second = rhythm?.bpm_histogram_second_peak_weight;
  const secondWeight = typeof second === "number" && Number.isFinite(second) ? second : 0;
  return Math.round(Math.max(0, first - secondWeight) * 1000) / 1000;
}

/** Whether a stored BPM's confidence is low enough to flag as uncertain. */
export function isBpmConfidenceLow(bpmConfidence: number | null | undefined): boolean {
  return typeof bpmConfidence === "number" && bpmConfidence < BPM_CONFIDENCE_LOW_THRESHOLD;
}

/** The percentage to show in the UI, or null when there's nothing to show. */
export function formatBpmConfidencePercent(
  bpmConfidence: number | null | undefined,
): number | null {
  return typeof bpmConfidence === "number" ? Math.round(bpmConfidence * 100) : null;
}

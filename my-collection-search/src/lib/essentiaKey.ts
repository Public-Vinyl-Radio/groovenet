// Shared key-extraction logic for every pipeline stage that reads Essentia's
// `tonal` output (#524): download-worker's analyze job, the manual upload
// route, and the audio-analysis SSE/upload UI. Keeping it in one place means
// all four extract and log key confidence/disagreement the same way.

export type EssentiaKeyEstimate = {
  key?: string;
  scale?: string;
  strength?: number;
};

export type EssentiaTonal = {
  key_edma?: EssentiaKeyEstimate;
  key_krumhansl?: EssentiaKeyEstimate;
  key_temperley?: EssentiaKeyEstimate;
  /** From chord detection, not a key profile — flat fields, no strength (#524). */
  chords_key?: string;
  chords_scale?: string;
};

export type KeyAnalysis = {
  key: string | null;
  /** The winning estimate's strength (or the average of an agreeing pair), rounded to 3 decimals. */
  key_confidence: number | null;
};

/**
 * Below this, the key estimate is weak enough to flag in the UI rather than
 * present as fact (#524). Essentia's own key-detection examples treat
 * ~0.6 as the line between a usable and a dubious estimate.
 */
export const KEY_CONFIDENCE_LOW_THRESHOLD = 0.6;

/** Whether a stored key's confidence is low enough to flag as uncertain. */
export function isKeyConfidenceLow(keyConfidence: number | null | undefined): boolean {
  return typeof keyConfidence === "number" && keyConfidence < KEY_CONFIDENCE_LOW_THRESHOLD;
}

/** The percentage to show in the UI, or null when there's nothing to show. */
export function formatKeyConfidencePercent(
  keyConfidence: number | null | undefined,
): number | null {
  return typeof keyConfidence === "number" ? Math.round(keyConfidence * 100) : null;
}

function formatKey(estimate: EssentiaKeyEstimate | undefined): string | null {
  if (!estimate?.key || !estimate?.scale) return null;
  return `${estimate.key} ${estimate.scale}`;
}

const PROFILE_SOURCES = ["key_edma", "key_krumhansl", "key_temperley"] as const;

type ProfileCandidate = {
  source: (typeof PROFILE_SOURCES)[number];
  formatted: string;
  strength: number | undefined;
};

function profileCandidates(tonal: EssentiaTonal | undefined): ProfileCandidate[] {
  const candidates: ProfileCandidate[] = [];
  for (const source of PROFILE_SOURCES) {
    const formatted = formatKey(tonal?.[source]);
    if (formatted) candidates.push({ source, formatted, strength: tonal?.[source]?.strength });
  }
  return candidates;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 1000) / 1000;
}

/**
 * Chooses a key from the three independent key-detection profiles
 * (key_edma/key_krumhansl/key_temperley) by majority vote, rather than
 * always trusting key_edma — a profile tuned specifically for electronic
 * dance music, so it's the one most likely to be the outlier in a
 * non-EDM-heavy collection (#524).
 *
 * `chords_key`/`chords_scale` never participates in the vote: it isn't a
 * key-detection algorithm, just the most frequent chord root from chord
 * detection, so it stays a diagnostic signal only (see
 * `logKeyProfileDisagreement`) rather than a fourth vote alongside three
 * purpose-built estimators.
 *
 * With at most 3 candidates, at most one key/scale value can ever be
 * shared by 2+ of them, so there's no tie to break when a majority exists.
 * Falling back (no two agree, or only one profile is present) picks the
 * single highest-strength candidate, preferring edma > krumhansl >
 * temperley when strength is missing or tied — the same default order
 * this pipeline always used.
 */
export function extractKeyAnalysis(tonal: EssentiaTonal | undefined): KeyAnalysis {
  const candidates = profileCandidates(tonal);
  if (candidates.length === 0) return { key: null, key_confidence: null };

  const byValue = new Map<string, ProfileCandidate[]>();
  for (const candidate of candidates) {
    const group = byValue.get(candidate.formatted);
    if (group) group.push(candidate);
    else byValue.set(candidate.formatted, [candidate]);
  }

  const majority = [...byValue.values()].find((group) => group.length >= 2);
  if (majority) {
    return {
      key: majority[0].formatted,
      key_confidence: average(
        majority.map((c) => c.strength).filter((s): s is number => typeof s === "number"),
      ),
    };
  }

  const winner = candidates.reduce((best, candidate) => {
    const bestStrength = best.strength ?? -Infinity;
    const candidateStrength = candidate.strength ?? -Infinity;
    return candidateStrength > bestStrength ? candidate : best;
  });
  return {
    key: winner.formatted,
    key_confidence:
      typeof winner.strength === "number" ? Math.round(winner.strength * 1000) / 1000 : null,
  };
}

/**
 * Logs (never throws) when another key estimate disagrees with the key
 * actually chosen by `extractKeyAnalysis` — every independent estimate
 * Essentia computed (the three profiles, plus `chords_key`), not just
 * whichever one happened to be the default. On the track that prompted
 * #524, the three key profiles (edma/krumhansl/temperley) all agreed with
 * each other on F major — the actual F-major/C-major split was against
 * `chords_key`. A silent disagreement here is exactly what made that bug
 * invisible.
 */
export function logKeyProfileDisagreement(
  tonal: EssentiaTonal | undefined,
  context: { track_id: string; friend_id: number },
  log: (message: string) => void = console.warn,
): void {
  const { key } = extractKeyAnalysis(tonal);
  if (!key) return;

  const disagreements: string[] = [];
  const edma = formatKey(tonal?.key_edma);
  const krumhansl = formatKey(tonal?.key_krumhansl);
  const temperley = formatKey(tonal?.key_temperley);
  const chords =
    tonal?.chords_key && tonal?.chords_scale ? `${tonal.chords_key} ${tonal.chords_scale}` : null;
  if (edma && edma !== key) disagreements.push(`edma=${edma}`);
  if (krumhansl && krumhansl !== key) disagreements.push(`krumhansl=${krumhansl}`);
  if (temperley && temperley !== key) disagreements.push(`temperley=${temperley}`);
  if (chords && chords !== key) disagreements.push(`chords=${chords}`);

  if (disagreements.length > 0) {
    log(
      `Key profile disagreement for track ${context.track_id} (friend ${context.friend_id}): ` +
        `stored key=${key} vs ${disagreements.join(", ")}`,
    );
  }
}

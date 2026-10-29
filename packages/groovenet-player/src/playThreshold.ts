/** A track shorter than this is never a play. */
export const MIN_TRACK_SECONDS = 30;
/** Half of the track, or this many seconds, whichever comes first. */
export const MAX_THRESHOLD_SECONDS = 240;
export const THRESHOLD_FRACTION = 0.5;
/**
 * The largest forward jump between two position updates that still counts as
 * listening. mpv reports about once a second, so anything bigger is a seek.
 */
export const MAX_STEP_SECONDS = 5;

export interface ListenProgress {
  /** Seconds actually played, excluding pauses and seeks. */
  listened: number;
  /** The last position seen, or null before the first update. */
  lastPosition: number | null;
}

export const initialProgress: ListenProgress = { listened: 0, lastPosition: 0 };

/**
 * Seconds of play time that make a play, or null when the track can never be
 * one. An unknown duration is judged by the absolute limit alone.
 */
export function playThreshold(duration: number | null): number | null {
  if (duration === null) return MAX_THRESHOLD_SECONDS;
  if (!Number.isFinite(duration) || duration < MIN_TRACK_SECONDS) return null;
  return Math.min(duration * THRESHOLD_FRACTION, MAX_THRESHOLD_SECONDS);
}

/**
 * Fold one position update into the running total. Only forward progress while
 * playing counts: a pause adds nothing, and a backward or oversized jump is a
 * seek, which moves the reference point without adding listening time.
 */
export function advanceProgress(
  progress: ListenProgress,
  position: number,
  playing: boolean,
  maxStep: number = MAX_STEP_SECONDS,
): ListenProgress {
  if (!Number.isFinite(position)) return progress;
  const delta = progress.lastPosition === null ? 0 : position - progress.lastPosition;
  const counted = playing && delta > 0 && delta <= maxStep ? delta : 0;
  return { listened: progress.listened + counted, lastPosition: position };
}

/** Whether `listened` seconds of a track of this duration is a play. */
export function isPlay(listened: number, duration: number | null): boolean {
  const threshold = playThreshold(duration);
  return threshold !== null && listened >= threshold;
}

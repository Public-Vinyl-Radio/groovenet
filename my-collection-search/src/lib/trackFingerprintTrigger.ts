// Permissive on purpose, matching `trackEmbeddingDiff.ts`'s `TrackLike`: the
// DB row's `local_audio_url` is typed inconsistently across layers (`string
// | undefined` on `Track`, `string | null` on the raw row), and this only
// ever needs its truthiness.
type TrackLike = { local_audio_url?: unknown } | null | undefined;

/**
 * True the moment a track gains reference audio it did not have before (#303).
 *
 * Only the null/empty → value transition counts — a track whose audio is
 * later replaced is not re-triggered here. That case, and audio that arrives
 * by any path other than this route, are the periodic "missing" backfill
 * pass's job; this is only the fast path for the common one.
 */
export function shouldTriggerFingerprintIndex(
  current: TrackLike,
  updated: TrackLike
): boolean {
  const before = current?.local_audio_url;
  const after = updated?.local_audio_url;
  return !before && !!after;
}

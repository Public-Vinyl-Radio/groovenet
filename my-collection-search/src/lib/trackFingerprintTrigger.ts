// Permissive on purpose, matching `trackEmbeddingDiff.ts`'s `TrackLike`: the
// DB row's `local_audio_url` is typed inconsistently across layers (`string
// | undefined` on `Track`, `string | null` on the raw row), and this only
// ever needs its truthiness.
type TrackLike = { local_audio_url?: unknown } | null | undefined;

/**
 * True when a track's reference audio now points somewhere it did not (#303):
 * gained for the first time, or replaced with a different file.
 *
 * Replacement matters as much as arrival. The "missing" backfill never looks
 * at a track that already has a fingerprint, so a replaced file used to leave
 * the index matching against audio that was gone. Re-queueing is cheap when
 * the new path holds the same bytes: the worker hashes it and skips.
 *
 * Losing audio (value → empty) does not trigger: the fingerprint describes the
 * record, which has not changed. Same bytes behind an unchanged path is the
 * periodic verification pass's job — this route never sees it.
 */
export function shouldTriggerFingerprintIndex(
  current: TrackLike,
  updated: TrackLike
): boolean {
  const before = current?.local_audio_url;
  const after = updated?.local_audio_url;
  return !!after && after !== before;
}

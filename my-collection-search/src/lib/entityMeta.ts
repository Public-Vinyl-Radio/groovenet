import { camelotOf, parseBpm } from "@/lib/mixCompat";
import { formatSeconds, getTrackDurationSeconds } from "@/lib/trackUtils";
import type { Track } from "@/types/track";

const join = (parts: (string | null | undefined | false)[]) =>
  parts.filter(Boolean).join(" · ") || undefined;

/** The album page's header meta: "LP-322 · 11 tracks · 1:03:43". */
export function albumMeta({
  identifier,
  trackCount,
  totalSeconds,
}: {
  identifier?: string | null;
  trackCount: number;
  totalSeconds: number;
}): string | undefined {
  return join([
    identifier,
    trackCount > 0 && `${trackCount} ${trackCount === 1 ? "track" : "tracks"}`,
    totalSeconds > 0 && formatSeconds(totalSeconds),
  ]);
}

/** The track page's header meta: "LP-322 · 4:12 · 124 BPM · 8A". */
export function trackMeta(track: Track): string | undefined {
  const bpm = parseBpm(track.bpm);
  const seconds = getTrackDurationSeconds(track);
  return join([
    track.library_identifier,
    seconds !== null && formatSeconds(seconds),
    bpm !== null && `${Number(bpm.toFixed(1))} BPM`,
    camelotOf(track.key),
  ]);
}

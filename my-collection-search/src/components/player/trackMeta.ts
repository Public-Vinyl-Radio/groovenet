import type { Track } from "@/types/track";
import { camelotOf, parseBpm } from "@/lib/mixCompat";
import { formatSeconds, getTrackDurationSeconds } from "@/lib/trackUtils";

/** The mono meta line under a playing track: `A1 · 134 BPM · 7A`, skipping what's unknown. */
export function trackMetaLine(track: Track | null | undefined): string {
  if (!track) return "";
  const bpm = parseBpm(track.bpm);
  return [
    String(track.position ?? "").trim() || null,
    bpm === null ? null : `${Math.round(bpm)} BPM`,
    camelotOf(track.key),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** `4:02`, or empty when the duration is unknown. */
export function trackDurationLabel(track: Track): string {
  const seconds = getTrackDurationSeconds(track);
  return seconds === null ? "" : formatSeconds(seconds);
}

/** `20 tracks · 59:58` for the queue header. */
export function queueSummary(tracks: Track[]): string {
  const total = tracks.reduce((sum, t) => sum + (getTrackDurationSeconds(t) || 0), 0);
  return `${tracks.length} ${tracks.length === 1 ? "track" : "tracks"} · ${formatSeconds(total)}`;
}

export function artworkOf(track: Track | null | undefined): string | null {
  return track?.audio_file_album_art_url || track?.album_thumbnail || null;
}

export function artworkAlt(track: Track | null | undefined): string {
  return track ? `${track.artist} - ${track.title}` : "Artwork";
}

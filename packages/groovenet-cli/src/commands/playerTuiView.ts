import { formatSeconds } from "@groovenet/client";
import type { PlaybackSnapshot } from "@groovenet/player";
import { progressBar } from "../tui/text.js";

/** `0:12 / 3:00 · playing · 70%`: the text after the progress bar. */
export function formatPlaybackStatus(snapshot: PlaybackSnapshot): string {
  const position = formatSeconds(snapshot.position);
  const duration = snapshot.duration == null ? "--:--" : formatSeconds(snapshot.duration);
  return `${position} / ${duration} · ${snapshot.status} · ${snapshot.volume}%`;
}

export function formatPlayback(snapshot: PlaybackSnapshot, barWidth = 24): string[] {
  const track = snapshot.current?.track;
  const title = track ? `${track.artist} — ${track.title}` : "Nothing playing";
  const metadata = track ? [track.bpm != null ? `${track.bpm} BPM` : null, track.key || null].filter(Boolean).join(" · ") : "";
  return [title, metadata, `${progressBar(snapshot.position, snapshot.duration, barWidth)} ${formatPlaybackStatus(snapshot)}`];
}

/** The rows of a long list to show so the selected one is always on screen. */
export function visibleWindow(total: number, selected: number, size: number): { start: number; end: number } {
  if (total <= size) return { start: 0, end: total };
  const start = Math.min(Math.max(0, selected - size + 1), total - size);
  return { start, end: start + size };
}

import type { PlaybackSnapshot } from "./types.js";

export const NO_TRACK = "/org/mpris/MediaPlayer2/TrackList/NoTrack";

export function trackPath(snapshot: PlaybackSnapshot): string {
  // Hex encoding preserves uniqueness and only uses valid D-Bus path characters.
  return snapshot.current
    ? `/org/mpris/MediaPlayer2/track/t${Buffer.from(snapshot.current.id).toString("hex")}`
    : NO_TRACK;
}

export function microseconds(seconds: number): bigint {
  return BigInt(Math.round(Math.max(0, seconds) * 1_000_000));
}

export function playbackStatus(snapshot: PlaybackSnapshot): string {
  return snapshot.status === "playing"
    ? "Playing"
    : snapshot.status === "paused"
      ? "Paused"
      : "Stopped";
}

export interface TransportCommand {
  method: string;
  params?: Record<string, unknown>;
}

/** Translate MPRIS units and guards into the existing daemon transport API. */
export function transportCommand(
  snapshot: PlaybackSnapshot,
  method: string,
  value = 0,
  id = NO_TRACK,
): TransportCommand | null {
  switch (method) {
    case "Play":
      return snapshot.status === "playing" || !snapshot.queue.length ? null : { method: "play" };
    case "Pause":
      return snapshot.status === "playing" ? { method: "pause" } : null;
    case "PlayPause":
      return transportCommand(snapshot, snapshot.status === "playing" ? "Pause" : "Play");
    case "Stop":
      return { method: "stop" };
    case "Next":
      return snapshot.queue.length ? { method: "next" } : null;
    case "Previous":
      return snapshot.queue.length ? { method: "prev" } : null;
    case "Seek":
    case "SetPosition": {
      if (
        !snapshot.current ||
        !["playing", "paused"].includes(snapshot.status) ||
        !Number.isFinite(value)
      )
        return null;
      if (method === "SetPosition" && (id !== trackPath(snapshot) || value < 0)) return null;
      const seconds =
        method === "Seek" ? Math.max(0, snapshot.position + value / 1_000_000) : value / 1_000_000;
      if (snapshot.duration !== null && seconds > snapshot.duration)
        return method === "Seek" ? { method: "next" } : null;
      return { method: "seek", params: { seconds } };
    }
    default:
      return null;
  }
}

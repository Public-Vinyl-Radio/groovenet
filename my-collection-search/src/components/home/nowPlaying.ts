import type { ServerPlayer } from "@groovenet/contracts";
import type { DetectionsRecentResponse } from "@/services/internalApi/vinylPipeline";

type Detection = DetectionsRecentResponse["detections"][number];

/**
 * How old the newest vinyl detection may be and still count as Now playing:
 * about the length of a long track. A matched window older than this means the
 * record has ended (or the listener stopped), so the card hides rather than
 * showing last night's record. A detection exactly this old still shows.
 */
export const VINYL_NOW_PLAYING_MAX_AGE_MS = 15 * 60_000;

const active = (player: ServerPlayer) =>
  player.state.status === "playing" || player.state.status === "loading";

/**
 * The server player Home shows: the one playing, the most recently updated
 * when several are. `updatedAt` holds when this page saw each player change
 * (missing counts as oldest, so the server's own order breaks ties). `sticky`
 * is the player last shown: it stays while paused, so pausing from Home
 * doesn't take the card (and its play key) away.
 */
export function pickServerPlayer(
  players: readonly ServerPlayer[],
  updatedAt: ReadonlyMap<string, number>,
  sticky: string | null,
): ServerPlayer | null {
  const playing = players
    .filter(active)
    .sort((a, b) => (updatedAt.get(b.id) ?? 0) - (updatedAt.get(a.id) ?? 0));
  if (playing[0]) return playing[0];
  const kept = players.find((player) => player.id === sticky);
  return kept && kept.state.status === "paused" && kept.state.current_entry_id ? kept : null;
}

/** When a detection's audio was heard: its window's capture time, else when it was stored. */
export function detectionTime(detection: Detection): number {
  return Date.parse(detection.window_start_at ?? detection.created_at);
}

/** The newest matched detection, if it is recent enough to be what's on the turntable. */
export function freshDetection(detections: readonly Detection[], now: number): Detection | null {
  const latest = detections.find(
    (detection) =>
      detection.matched && detection.track_id && detection.friend_id && detection.title,
  );
  if (!latest) return null;
  return now - detectionTime(latest) <= VINYL_NOW_PLAYING_MAX_AGE_MS ? latest : null;
}

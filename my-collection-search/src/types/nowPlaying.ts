/**
 * Live now-playing tracking (#465): the display-facing sibling of
 * `playAggregationService` (#279/#304). That path is accurate but confirms a
 * play only once it is aggregated into a spin, which is too late for a
 * display. This path watches the same per-window detections as they are
 * recorded and runs a small state machine per source so a display can show
 * "candidate" and "playing" within a few windows.
 */

/**
 *     idle ──(1 confident match)──▶ candidate ──(confirmed)──▶ playing
 *     playing ──(different track confirmed)──▶ playing (new track)
 *     playing ──(silence)──▶ stopped ──(silence)──▶ idle
 *     stopped ──(same or new track confirmed)──▶ playing
 */
export type NowPlayingState = "idle" | "candidate" | "playing" | "stopped";

/** What the tracker shows for the track currently displayed or built toward. */
export type NowPlayingTrackInfo = {
  track_id: string;
  friend_id: number;
  title: string;
  artist: string;
  album: string | null;
  position: string | number | null;
  release_id: string | null;
  year: string | number | null;
  label: string | null;
  bpm: string | null;
  key: string | null;
  genres: string[];
  duration_seconds: number | null;
  /** Discogs cover or embedded file art, whichever `nowPlayingTrackerService` resolved. Unresized. */
  cover_url: string | null;
};

/** One source's full now-playing picture, the unit the publisher sends over MQTT. */
export type NowPlayingSnapshot = {
  source_id: string;
  state: NowPlayingState;
  /** Null only in `idle`: nothing to show. */
  track: NowPlayingTrackInfo | null;
  /** Where in the track the window that produced this snapshot sat. */
  offset_seconds: number | null;
  /** When that window was captured, ISO 8601 — lets a display extrapolate a progress bar locally. */
  observed_at: string | null;
  confidence: number | null;
};

/** Identifies one track for run/display-identity comparisons, without its metadata. */
export type NowPlayingTrackRef = {
  track_id: string;
  friend_id: number;
};

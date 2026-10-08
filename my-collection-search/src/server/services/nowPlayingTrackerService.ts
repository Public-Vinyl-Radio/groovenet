import { trackRepository } from "@/server/repositories/trackRepository";
import {
  DEFAULT_PLAY_CONFIDENCE_FLOOR,
  DEFAULT_PLAY_GAP_SECONDS,
  DEFAULT_PLAY_MIN_WINDOWS,
  isRealPlay,
  windowRate,
  type GroupableWindow,
} from "@/server/services/playAggregationService";
import { nowPlayingPublisherService } from "@/server/services/nowPlayingPublisherService";
import type {
  NowPlayingSnapshot,
  NowPlayingState,
  NowPlayingTrackInfo,
  NowPlayingTrackRef,
} from "@/types/nowPlaying";

/**
 * Live now-playing tracking (#465), fed window by window from
 * `ingestLifecycleService.recordDetections` — the display-facing sibling of
 * `playAggregationService`, which is accurate but only confirms a play once
 * it is aggregated into a spin, too late for a display to react to.
 *
 * Reuses `isRealPlay` and the same confidence floor / minimum-windows / rate
 * rule it applies, rather than re-deriving them, so a stray window at a track
 * boundary is exactly as harmless here as it is for a spin.
 *
 *     idle ──(1 confident match)──▶ candidate ──(confirmed)──▶ playing
 *     playing ──(different track confirmed)──▶ playing (new track)
 *     playing ──(silence for gapSeconds)──▶ stopped ──(silence for clearSeconds)──▶ idle
 *     stopped ──(same or new track confirmed)──▶ playing
 *
 * State lives in memory, per `source_id`; a restart just means a display
 * waits for the next confirmation. Timers that drop `playing`/`candidate` to
 * `stopped`/`idle` are wall-clock, driven by `tick()`, so they fire even if
 * the listener stops sending anything at all.
 */

export function nowPlayingClearSeconds(): number {
  const seconds = Number(process.env.NOW_PLAYING_CLEAR_SECONDS);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 60;
}

export type NowPlayingTrackerOptions = {
  confidenceFloor?: number;
  gapSeconds?: number;
  minWindows?: number;
  clearSeconds?: number;
};

type ResolvedOptions = Required<NowPlayingTrackerOptions>;

function resolveOptions(options: NowPlayingTrackerOptions): ResolvedOptions {
  return {
    confidenceFloor: options.confidenceFloor ?? DEFAULT_PLAY_CONFIDENCE_FLOOR,
    gapSeconds: options.gapSeconds ?? DEFAULT_PLAY_GAP_SECONDS,
    minWindows: options.minWindows ?? DEFAULT_PLAY_MIN_WINDOWS,
    clearSeconds: options.clearSeconds ?? nowPlayingClearSeconds(),
  };
}

/** A run of consecutive windows building toward confirming one track. */
type Run = { track: NowPlayingTrackRef; windows: GroupableWindow[] };

type SourceState = {
  state: NowPlayingState;
  /** The track actually on screen (or being offered as a candidate). Null in `idle`. */
  displayed: NowPlayingTrackInfo | null;
  run: Run | null;
  /** Last time the displayed track reconfirmed, or a run advanced. Drives the `playing`/`candidate` timeout. */
  lastMatchAt: number | null;
  /** When `stopped` was entered. Drives the clear-to-`idle` timeout, independent of any run building meanwhile. */
  stoppedAt: number | null;
};

function freshState(): SourceState {
  return { state: "idle", displayed: null, run: null, lastMatchAt: null, stoppedAt: null };
}

function sameRef(a: NowPlayingTrackRef | null | undefined, b: NowPlayingTrackRef): boolean {
  return !!a && a.track_id === b.track_id && a.friend_id === b.friend_id;
}

type Decision = { publish: true; state: NowPlayingState; track: NowPlayingTrackRef } | { publish: false };

/**
 * One valid window's effect on a source's run/state. Pure except for the
 * `run`/`lastMatchAt`/`stoppedAt` bookkeeping on `src` itself — `state` and
 * `displayed` are committed by the caller only once metadata for `track`
 * resolves, so a transient lookup failure can't display a track with no name.
 */
function advance(src: SourceState, ref: NowPlayingTrackRef, window: GroupableWindow, now: number, opts: ResolvedOptions): Decision {
  src.lastMatchAt = now;

  if (src.state === "playing" && sameRef(src.displayed, ref)) {
    // The track already on screen reconfirmed: resets the stop timer and
    // abandons any blend attempt that was building against it.
    src.run = null;
    return { publish: false };
  }

  if (!src.run || !sameRef(src.run.track, ref)) {
    src.run = { track: ref, windows: [window] };
  } else {
    src.run.windows.push(window);
  }

  const confirmed = isRealPlay(
    { windows: src.run.windows.length, rate: windowRate(src.run.windows, (w) => w) },
    { minWindows: opts.minWindows }
  );

  if (confirmed) {
    src.run = null;
    src.stoppedAt = null;
    return { publish: true, state: "playing", track: ref };
  }

  if (src.state === "idle") return { publish: true, state: "candidate", track: ref };
  if (src.state === "candidate" && !sameRef(src.displayed, ref)) {
    return { publish: true, state: "candidate", track: ref };
  }
  // Still building: a blend attempt against a `playing` track, or a
  // reconfirmation attempt against a `stopped` one. Nothing to show yet.
  return { publish: false };
}

function toTrackInfo(row: {
  track_id: string;
  friend_id: number;
  title: string;
  artist: string;
  album: string | null;
  position: string | number | null;
  release_id?: string | null;
  year: string | number | null;
  bpm?: string | null;
  key?: string | null;
  genres?: string[] | null;
  duration_seconds?: number | null;
  audio_file_album_art_url?: string | null;
  album_thumbnail?: string | null;
}): NowPlayingTrackInfo {
  return {
    track_id: row.track_id,
    friend_id: row.friend_id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    position: row.position,
    release_id: row.release_id ?? null,
    year: row.year,
    bpm: row.bpm ?? null,
    key: row.key ?? null,
    genres: row.genres ?? [],
    duration_seconds: row.duration_seconds ?? null,
    // Embedded file art first, matching the album page's priority — it is
    // the art for the exact pressing this track was ripped from.
    cover_url: row.audio_file_album_art_url || row.album_thumbnail || null,
  };
}

export class NowPlayingTrackerService {
  private sources = new Map<string, SourceState>();

  /** Feed one window's top candidate (or a no-match placeholder) for a source. */
  async observe(sourceId: string, window: GroupableWindow, now: number = Date.now(), options: NowPlayingTrackerOptions = {}): Promise<void> {
    try {
      const opts = resolveOptions(options);
      const isMatch =
        window.track_id != null &&
        window.friend_id != null &&
        window.confidence != null &&
        window.confidence >= opts.confidenceFloor &&
        window.at != null;
      if (!isMatch) return;

      const src = this.sources.get(sourceId) ?? freshState();
      this.sources.set(sourceId, src);

      const ref: NowPlayingTrackRef = { track_id: window.track_id as string, friend_id: window.friend_id as number };
      const decision = advance(src, ref, window, now, opts);
      if (!decision.publish) return;

      const track = await this.resolveTrack(decision.track);
      if (!track) return; // Can't display a track we can't resolve; the next window retries.

      src.state = decision.state;
      src.displayed = track;
      await this.publish(sourceId, src, window);
    } catch (error) {
      console.error(`[now-playing] observe failed for ${sourceId}:`, error);
    }
  }

  /**
   * Wall-clock sweep for the timers `observe` alone can't drive: a needle
   * lifted, or a listener that goes silent, produces no further windows at
   * all. Safe to call as often as liked — a source with nothing due is a map
   * lookup and a comparison.
   */
  async tick(now: number = Date.now(), options: NowPlayingTrackerOptions = {}): Promise<void> {
    const opts = resolveOptions(options);
    for (const [sourceId, src] of this.sources) {
      try {
        if (src.state === "playing" && src.lastMatchAt != null && now - src.lastMatchAt >= opts.gapSeconds * 1000) {
          src.state = "stopped";
          src.stoppedAt = now;
          src.run = null;
          await this.publishBare(sourceId, src);
        } else if (src.state === "candidate" && src.lastMatchAt != null && now - src.lastMatchAt >= opts.gapSeconds * 1000) {
          src.state = "idle";
          src.displayed = null;
          src.run = null;
          await this.publishBare(sourceId, src);
        } else if (src.state === "stopped" && src.stoppedAt != null && now - src.stoppedAt >= opts.clearSeconds * 1000) {
          src.state = "idle";
          src.displayed = null;
          src.run = null;
          src.stoppedAt = null;
          await this.publishBare(sourceId, src);
        }
      } catch (error) {
        console.error(`[now-playing] tick failed for ${sourceId}:`, error);
      }
    }
  }

  /** Test-only: drop all in-memory source state between cases. */
  reset(): void {
    this.sources.clear();
  }

  private async resolveTrack(ref: NowPlayingTrackRef): Promise<NowPlayingTrackInfo | null> {
    const row = await trackRepository.findTrackByTrackIdAndFriendId(ref.track_id, ref.friend_id);
    return row ? toTrackInfo(row) : null;
  }

  private async publish(sourceId: string, src: SourceState, window: GroupableWindow): Promise<void> {
    // Only ever called with a window that already passed `observe`'s match
    // check, so `at` is never null here.
    const snapshot: NowPlayingSnapshot = {
      source_id: sourceId,
      state: src.state,
      track: src.displayed,
      offset_seconds: window.offset_seconds ?? null,
      observed_at: new Date(window.at as number).toISOString(),
      confidence: window.confidence,
    };
    await nowPlayingPublisherService.publishSnapshot(snapshot);
  }

  /** A tick-driven transition: no window triggered it, so there is no fresh offset/confidence to report. */
  private async publishBare(sourceId: string, src: SourceState): Promise<void> {
    const snapshot: NowPlayingSnapshot = {
      source_id: sourceId,
      state: src.state,
      track: src.displayed,
      offset_seconds: null,
      observed_at: null,
      confidence: null,
    };
    await nowPlayingPublisherService.publishSnapshot(snapshot);
  }
}

export const nowPlayingTrackerService = new NowPlayingTrackerService();

const GLOBAL_NOW_PLAYING_KEY = "__groovenetNowPlayingTrackerStarted";

type GlobalWithNowPlaying = typeof globalThis & { [GLOBAL_NOW_PLAYING_KEY]?: boolean };

/** How often the silence/clear timers are swept. Independent of any window arriving. */
const TICK_INTERVAL_MS = 15_000;

/** Start the now-playing sweep and open the MQTT connection, once per process. */
export function startNowPlayingTracker(): void {
  const g = globalThis as GlobalWithNowPlaying;
  if (g[GLOBAL_NOW_PLAYING_KEY]) return;
  g[GLOBAL_NOW_PLAYING_KEY] = true;

  nowPlayingPublisherService.connect();
  setInterval(() => {
    void nowPlayingTrackerService.tick();
  }, TICK_INTERVAL_MS);

  console.log("[now-playing] tracker started");
}

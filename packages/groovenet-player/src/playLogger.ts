import type { Track } from "@groovenet/client";
import { advanceProgress, initialProgress, isPlay, type ListenProgress } from "./playThreshold.js";
import type { PlaybackSnapshot, QueueEntry } from "./types.js";

/** The slice of PlayerCore the logger listens to, so tests need no player. */
export interface PlayEventSource {
  on(event: "change", listener: (snapshot: PlaybackSnapshot) => void): unknown;
  on(event: "track-started" | "track-ended", listener: (entry: QueueEntry) => void): unknown;
  off(event: "change", listener: (snapshot: PlaybackSnapshot) => void): unknown;
  off(event: "track-started" | "track-ended", listener: (entry: QueueEntry) => void): unknown;
}

export interface LoggedPlay {
  track: Track;
  startedAt: Date;
  listened: number;
}

export interface PlayLoggerOptions {
  source: PlayEventSource;
  /** Records one play. Resolve for "logged" or "already logged"; reject to retry later. */
  logPlay: (play: LoggedPlay) => Promise<void>;
  /** Only this library's tracks are logged; the API rejects another owner's. */
  friendId: number;
  now?: () => Date;
  onError?: (error: unknown, play: LoggedPlay) => void;
  retryDelayMs?: number;
}

interface Tracked {
  entry: QueueEntry;
  startedAt: Date;
  progress: ListenProgress;
  duration: number | null;
  /** Set once the play is logged or being logged. */
  claimed: boolean;
  retryAt: number;
}

/** Logs a play when a track has been listened to long enough (see playThreshold). */
export class PlayLogger {
  private tracked: Tracked | null = null;
  private readonly now: () => Date;
  private readonly retryDelayMs: number;

  private readonly onStart = (entry: QueueEntry) => {
    this.tracked = {
      entry,
      startedAt: this.now(),
      progress: initialProgress,
      duration: null,
      claimed: false,
      retryAt: 0,
    };
  };

  private readonly onChange = (snapshot: PlaybackSnapshot) => {
    const tracked = this.tracked;
    if (!tracked || snapshot.current?.id !== tracked.entry.id) return;
    tracked.duration = snapshot.duration;
    tracked.progress = advanceProgress(
      tracked.progress,
      snapshot.position,
      snapshot.status === "playing",
    );
    this.maybeLog(tracked);
  };

  private readonly onEnd = (entry: QueueEntry) => {
    if (this.tracked?.entry.id === entry.id) {
      this.maybeLog(this.tracked);
      this.tracked = null;
    }
  };

  constructor(private readonly options: PlayLoggerOptions) {
    this.now = options.now ?? (() => new Date());
    this.retryDelayMs = options.retryDelayMs ?? 30_000;
  }

  start(): void {
    this.options.source.on("track-started", this.onStart);
    this.options.source.on("change", this.onChange);
    this.options.source.on("track-ended", this.onEnd);
  }

  stop(): void {
    this.options.source.off("track-started", this.onStart);
    this.options.source.off("change", this.onChange);
    this.options.source.off("track-ended", this.onEnd);
    this.tracked = null;
  }

  private maybeLog(tracked: Tracked): void {
    const { track } = tracked.entry;
    if (tracked.claimed || !isPlay(tracked.progress.listened, tracked.duration)) return;
    if (!track.release_id || track.friend_id !== this.options.friendId) return;
    if (this.now().getTime() < tracked.retryAt) return;
    // `claimed` makes repeated events harmless; the API's unique index covers a restart.
    tracked.claimed = true;
    const play: LoggedPlay = {
      track,
      startedAt: tracked.startedAt,
      listened: tracked.progress.listened,
    };
    void this.options.logPlay(play).then(
      () => undefined,
      (error: unknown) => {
        tracked.claimed = false;
        tracked.retryAt = this.now().getTime() + this.retryDelayMs;
        this.options.onError?.(error, play);
      },
    );
  }
}

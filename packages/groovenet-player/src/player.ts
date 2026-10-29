import { EventEmitter } from "node:events";
import { TrackQueue } from "./queue.js";
import { TrackResolver } from "./resolver.js";
import type { PlaybackBackend, PlaybackSnapshot, QueueEntry } from "./types.js";
import { PlayerError, type AudioDevice } from "./types.js";

export interface PlayerCoreEvents {
  change: (snapshot: PlaybackSnapshot) => void;
  "track-started": (entry: QueueEntry) => void;
  "track-ended": (entry: QueueEntry) => void;
  "track-skipped": (entry: QueueEntry, error: PlayerError) => void;
}

export class PlayerCore extends EventEmitter {
  readonly queue = new TrackQueue();
  private current: QueueEntry | null = null;
  private status: PlaybackSnapshot["status"] = "stopped";
  private position = 0;
  private duration: number | null = null;
  private volume = 100;
  private error: PlayerError | null = null;
  private currentIndex = -1;

  constructor(
    private readonly backend: PlaybackBackend,
    private readonly resolver: TrackResolver,
  ) {
    super();
    backend.on("position", (position, duration) => {
      this.position = position;
      this.duration = duration;
      this.emit("change", this.snapshot);
    });
    backend.on("ended", () => {
      if (this.current) this.emit("track-ended", this.current);
      void this.next().catch(() => {
        /* `play` records the actionable error in the snapshot */
      });
    });
    backend.on("error", (error) => {
      this.status = "error";
      this.error = error;
      this.emit("change", this.snapshot);
    });
  }

  // Keep EventEmitter's broad overload while giving player clients typed events.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string | symbol, listener: (...args: any[]) => void): this;
  on<E extends keyof PlayerCoreEvents>(event: E, listener: PlayerCoreEvents[E]): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string | symbol, listener: (...args: any[]) => void): this;
  off<E extends keyof PlayerCoreEvents>(event: E, listener: PlayerCoreEvents[E]): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.off(event, listener);
  }

  get snapshot(): PlaybackSnapshot {
    return {
      status: this.status,
      current: this.current,
      queue: this.queue.items,
      position: this.position,
      duration: this.duration,
      volume: this.volume,
      error: this.error,
    };
  }

  add(tracks: Parameters<TrackQueue["add"]>[0], at?: number): QueueEntry[] {
    const added = this.queue.add(tracks, at);
    this.emit("change", this.snapshot);
    return added;
  }

  async enqueueSearch(query: string, limit = 50): Promise<QueueEntry[]> {
    return this.add(await this.resolver.search(query, limit));
  }

  async enqueuePlaylist(playlistId: number | string): Promise<QueueEntry[]> {
    return this.add(await this.resolver.playlist(playlistId));
  }

  remove(idOrIndex: string | number): QueueEntry | undefined {
    const removed = this.queue.remove(idOrIndex);
    if (removed) this.emit("change", this.snapshot);
    return removed;
  }

  move(from: number, to: number): void {
    this.queue.move(from, to);
    this.emit("change", this.snapshot);
  }

  async play(index?: number): Promise<void> {
    const currentIndex = this.current
      ? this.queue.items.findIndex((entry) => entry.id === this.current!.id)
      : this.currentIndex;
    const targetIndex = index ?? (currentIndex < 0 ? 0 : currentIndex);
    const entry = this.queue.items[targetIndex];
    if (!entry)
      throw new PlayerError(
        "INVALID_ARGUMENT",
        "The playback queue is empty or the index is out of range",
      );
    const source = this.resolver.source(entry.track);
    if (!source) {
      this.status = "error";
      this.error = new PlayerError(
        "NO_AUDIO",
        `No downloaded audio is available for “${entry.track.title}”. Skipping it.`,
      );
      this.emit("track-skipped", entry, this.error);
      this.emit("change", this.snapshot);
      await this.playNextPlayable(targetIndex + 1);
      return;
    }
    this.status = "loading";
    this.error = null;
    this.current = entry;
    this.currentIndex = targetIndex;
    this.position = 0;
    this.duration = null;
    this.emit("change", this.snapshot);
    try {
      await this.backend.load(source);
      // mpv retains its pause property when a new file replaces a stopped track.
      await this.backend.pause(false);
      this.status = "playing";
    } catch (error) {
      this.status = "error";
      this.error =
        error instanceof PlayerError
          ? error
          : new PlayerError(
              "STREAM_FAILED",
              `Could not play “${entry.track.title}”: ${String(error)}`,
              { cause: error },
            );
      this.emit("change", this.snapshot);
      throw this.error;
    }
    this.emit("track-started", entry);
    this.emit("change", this.snapshot);
  }

  async pause(): Promise<void> {
    await this.backend.pause(true);
    this.status = "paused";
    this.emit("change", this.snapshot);
  }

  async stop(): Promise<void> {
    if (this.current) await this.backend.pause(true);
    this.status = "stopped";
    this.position = 0;
    this.duration = null;
    this.current = null;
    this.emit("change", this.snapshot);
  }

  async resume(): Promise<void> {
    await this.backend.pause(false);
    this.status = "playing";
    this.emit("change", this.snapshot);
  }

  async next(): Promise<void> {
    const index = this.current
      ? this.queue.items.findIndex((entry) => entry.id === this.current!.id)
      : this.currentIndex;
    await this.playNextPlayable(index + 1);
  }

  async previous(): Promise<void> {
    if (!this.queue.length)
      throw new PlayerError("INVALID_ARGUMENT", "The playback queue is empty");
    const index = this.current
      ? this.queue.items.findIndex((entry) => entry.id === this.current!.id)
      : this.currentIndex;
    let target = Math.max(0, index - 1);
    while (target >= 0 && !this.resolver.source(this.queue.items[target]!.track)) {
      const skipped = this.queue.items[target]!;
      this.emit(
        "track-skipped",
        skipped,
        new PlayerError(
          "NO_AUDIO",
          `No downloaded audio is available for “${skipped.track.title}”.`,
        ),
      );
      target--;
    }
    if (target >= 0) await this.play(target);
  }

  async seek(seconds: number): Promise<void> {
    if (!Number.isFinite(seconds) || seconds < 0)
      throw new PlayerError(
        "INVALID_ARGUMENT",
        "Seek position must be a non-negative number of seconds",
      );
    await this.backend.seek(seconds);
  }

  async setVolume(volume: number): Promise<void> {
    if (!Number.isFinite(volume) || volume < 0 || volume > 100)
      throw new PlayerError("INVALID_ARGUMENT", "Volume must be between 0 and 100");
    await this.backend.setVolume(volume);
    this.volume = volume;
    this.emit("change", this.snapshot);
  }

  listDevices(): Promise<AudioDevice[]> {
    return this.backend.listDevices();
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    await this.backend.setOutputDevice(deviceId);
  }

  async close(): Promise<void> {
    await this.backend.close();
    this.status = "stopped";
    this.current = null;
    this.currentIndex = -1;
    this.position = 0;
    this.duration = null;
    this.emit("change", this.snapshot);
  }

  private async playNextPlayable(index: number): Promise<void> {
    while (index < this.queue.length && !this.resolver.source(this.queue.items[index]!.track)) {
      const skipped = this.queue.items[index]!;
      this.emit(
        "track-skipped",
        skipped,
        new PlayerError(
          "NO_AUDIO",
          `No downloaded audio is available for “${skipped.track.title}”.`,
        ),
      );
      index++;
    }
    if (index >= this.queue.length) {
      this.current = null;
      this.currentIndex = -1;
      this.status = "ended";
      this.emit("change", this.snapshot);
      return;
    }
    await this.play(index);
  }
}

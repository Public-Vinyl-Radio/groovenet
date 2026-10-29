import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { Track } from "@groovenet/client";
import { PlayLogger, type LoggedPlay, type PlayEventSource } from "./playLogger.js";
import type { PlaybackSnapshot, QueueEntry } from "./types.js";

const FRIEND = 7;

const entry = (id: string, overrides: Partial<Track> = {}): QueueEntry => ({
  id,
  track: {
    track_id: `t-${id}`,
    friend_id: FRIEND,
    release_id: "r1",
    title: id,
    ...overrides,
  } as unknown as Track,
});

class FakeSource extends EventEmitter {
  current: QueueEntry | null = null;
  duration: number | null = 200;

  start(e: QueueEntry, duration: number | null = 200): void {
    this.current = e;
    this.duration = duration;
    this.emit("change", this.snap(0, "loading"));
    this.emit("track-started", e);
  }

  /** Emit one position update per second up to `to`. */
  tick(from: number, to: number, status: PlaybackSnapshot["status"] = "playing"): void {
    for (let p = from; p <= to; p++) this.emit("change", this.snap(p, status));
  }

  snap(position: number, status: PlaybackSnapshot["status"]): PlaybackSnapshot {
    return {
      status,
      current: this.current,
      queue: [],
      position,
      duration: this.duration,
      volume: 100,
      error: null,
    };
  }
}

function setup(
  logPlay: (play: LoggedPlay) => Promise<void> = async () => undefined,
  extra: { onError?: () => void } = {},
) {
  const source = new FakeSource();
  let clock = 1_000_000;
  const logger = new PlayLogger({
    source: source as unknown as PlayEventSource,
    logPlay,
    friendId: FRIEND,
    now: () => new Date(clock),
    retryDelayMs: 1000,
    ...extra,
  });
  logger.start();
  return {
    source,
    logger,
    advanceClock: (ms: number) => {
      clock += ms;
    },
  };
}

describe("PlayLogger", () => {
  it("logs once when the threshold is crossed, with the start time", async () => {
    const logPlay = vi.fn(async () => undefined);
    const { source } = setup(logPlay);
    const a = entry("a");
    source.start(a);
    source.tick(1, 99);
    expect(logPlay).not.toHaveBeenCalled();
    source.tick(100, 150);
    expect(logPlay).toHaveBeenCalledTimes(1);
    expect(logPlay).toHaveBeenCalledWith({
      track: a.track,
      startedAt: new Date(1_000_000),
      listened: 100,
    });
  });

  it("does not log a skip before the threshold", () => {
    const logPlay = vi.fn(async () => undefined);
    const { source } = setup(logPlay);
    source.start(entry("a"));
    source.tick(1, 40);
    source.start(entry("b"));
    source.tick(1, 99);
    expect(logPlay).not.toHaveBeenCalled();
  });

  it("keeps a play already logged when the track is skipped later", () => {
    const logPlay = vi.fn(async () => undefined);
    const { source } = setup(logPlay);
    source.start(entry("a"));
    source.tick(1, 120);
    source.start(entry("b"));
    expect(logPlay).toHaveBeenCalledTimes(1);
  });

  it("does not count paused time", () => {
    const logPlay = vi.fn(async () => undefined);
    const { source } = setup(logPlay);
    source.start(entry("a"));
    source.tick(1, 60);
    for (let i = 0; i < 500; i++) source.emit("change", source.snap(60, "paused"));
    expect(logPlay).not.toHaveBeenCalled();
    source.tick(61, 99);
    expect(logPlay).not.toHaveBeenCalled();
    source.tick(100, 100);
    expect(logPlay).toHaveBeenCalledTimes(1);
  });

  it("does not count a seek past the threshold", () => {
    const logPlay = vi.fn(async () => undefined);
    const { source } = setup(logPlay);
    source.start(entry("a"));
    source.tick(1, 10);
    source.tick(150, 160);
    expect(logPlay).not.toHaveBeenCalled();
  });

  it("never logs a track shorter than 30 seconds", () => {
    const logPlay = vi.fn(async () => undefined);
    const { source } = setup(logPlay);
    source.start(entry("a"), 29);
    source.tick(1, 29);
    source.emit("track-ended", entry("a"));
    expect(logPlay).not.toHaveBeenCalled();
  });

  it("uses the 240 second limit when the duration is unknown", () => {
    const logPlay = vi.fn(async () => undefined);
    const { source } = setup(logPlay);
    source.start(entry("a"), null);
    source.tick(1, 239);
    expect(logPlay).not.toHaveBeenCalled();
    source.tick(240, 240);
    expect(logPlay).toHaveBeenCalledTimes(1);
  });

  it("does not log when playback errors before the threshold", () => {
    const logPlay = vi.fn(async () => undefined);
    const { source } = setup(logPlay);
    source.start(entry("a"));
    source.tick(1, 30);
    source.emit("change", { ...source.snap(30, "error"), error: { code: "STREAM_FAILED" } });
    source.emit("change", source.snap(31, "error"));
    expect(logPlay).not.toHaveBeenCalled();
  });

  it("ignores snapshots for a different track and repeated events", async () => {
    const logPlay = vi.fn(async () => undefined);
    const { source } = setup(logPlay);
    const a = entry("a");
    source.start(a);
    source.tick(1, 100);
    await vi.waitFor(() => expect(logPlay).toHaveBeenCalledTimes(1));
    source.tick(1, 300);
    source.emit("track-ended", a);
    source.emit("track-ended", a);
    // After the track ended, stray snapshots have nothing to attach to.
    source.tick(101, 200);
    expect(logPlay).toHaveBeenCalledTimes(1);
    source.current = entry("other");
    source.tick(1, 300);
    expect(logPlay).toHaveBeenCalledTimes(1);
  });

  it("logs a replay of the same entry as a new play", async () => {
    const logPlay = vi.fn(async () => undefined);
    const { source, advanceClock } = setup(logPlay);
    const a = entry("a");
    source.start(a);
    source.tick(1, 100);
    await vi.waitFor(() => expect(logPlay).toHaveBeenCalledTimes(1));
    advanceClock(250_000);
    source.start(a);
    source.tick(1, 100);
    expect(logPlay).toHaveBeenCalledTimes(2);
    expect(logPlay.mock.calls[1]![0].startedAt).toEqual(new Date(1_250_000));
  });

  it("logs on track-ended when the final update arrived late", () => {
    const logPlay = vi.fn(async () => undefined);
    const { source } = setup(logPlay);
    const a = entry("a");
    source.start(a);
    source.tick(1, 99);
    source.emit("track-ended", a);
    expect(logPlay).not.toHaveBeenCalled();
    source.start(a);
    source.tick(1, 99);
    source.emit("change", source.snap(100, "playing"));
    source.emit("track-ended", a);
    expect(logPlay).toHaveBeenCalledTimes(1);
  });

  it("skips tracks with no release or another owner", () => {
    const logPlay = vi.fn(async () => undefined);
    const { source } = setup(logPlay);
    source.start(entry("a", { release_id: null }));
    source.tick(1, 150);
    source.start(entry("b", { friend_id: FRIEND + 1 }));
    source.tick(1, 150);
    expect(logPlay).not.toHaveBeenCalled();
  });

  it("retries after a failure once the delay has passed, then stops", async () => {
    const logPlay = vi
      .fn<(play: LoggedPlay) => Promise<void>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    const onError = vi.fn();
    const { source, advanceClock } = setup(logPlay, { onError });
    source.start(entry("a"));
    source.tick(1, 100);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(logPlay).toHaveBeenCalledTimes(1);
    source.tick(101, 105);
    expect(logPlay).toHaveBeenCalledTimes(1);
    advanceClock(1000);
    source.tick(106, 106);
    await vi.waitFor(() => expect(logPlay).toHaveBeenCalledTimes(2));
    source.tick(107, 150);
    expect(logPlay).toHaveBeenCalledTimes(2);
  });

  it("tolerates a failure with no error handler", async () => {
    const logPlay = vi.fn(async () => {
      throw new Error("offline");
    });
    const { source } = setup(logPlay);
    source.start(entry("a"));
    source.tick(1, 100);
    await vi.waitFor(() => expect(logPlay).toHaveBeenCalledTimes(1));
  });

  it("works with the real clock and default retry delay", () => {
    const source = new FakeSource();
    const logPlay = vi.fn(async () => undefined);
    new PlayLogger({
      source: source as unknown as PlayEventSource,
      logPlay,
      friendId: FRIEND,
    }).start();
    source.start(entry("a"));
    source.tick(1, 100);
    expect(logPlay).toHaveBeenCalledTimes(1);
    expect(logPlay.mock.calls[0]![0].startedAt).toBeInstanceOf(Date);
  });

  it("stops listening after stop()", () => {
    const logPlay = vi.fn(async () => undefined);
    const { source, logger } = setup(logPlay);
    source.start(entry("a"));
    logger.stop();
    source.tick(1, 150);
    expect(logPlay).not.toHaveBeenCalled();
    expect(source.listenerCount("change")).toBe(0);
  });
});

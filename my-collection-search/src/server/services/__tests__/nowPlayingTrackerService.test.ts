import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findTrackByTrackIdAndFriendId = vi.hoisted(() => vi.fn());
vi.mock("@/server/repositories/trackRepository", () => ({
  trackRepository: { findTrackByTrackIdAndFriendId },
}));

const publishSnapshot = vi.hoisted(() => vi.fn());
const connectPublisher = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/nowPlayingPublisherService", () => ({
  nowPlayingPublisherService: { publishSnapshot, connect: connectPublisher },
}));

import { NowPlayingTrackerService, nowPlayingClearSeconds } from "../nowPlayingTrackerService";
import type { GroupableWindow } from "../playAggregationService";

const T0 = new Date("2026-10-01T20:00:00.000Z").getTime();

function trackRow(overrides: Record<string, unknown> = {}) {
  return {
    track_id: "track-a",
    friend_id: 1,
    title: "Voodoo Ray",
    artist: "A Guy Called Gerald",
    album: "Hot Lemonade",
    position: "A1",
    release_id: "rel-1",
    year: "1988",
    bpm: "124",
    key: "Am",
    genres: ["House"],
    duration_seconds: 420,
    audio_file_album_art_url: null,
    album_thumbnail: "https://example.com/cover.jpg",
    ...overrides,
  };
}

function window(overrides: Partial<GroupableWindow> = {}): GroupableWindow {
  return {
    at: T0,
    track_id: "track-a",
    friend_id: 1,
    confidence: 0.9,
    offset_seconds: 10,
    ...overrides,
  };
}

const OPTS = { confidenceFloor: 0.75, gapSeconds: 45, minWindows: 2, clearSeconds: 60 };

describe("NowPlayingTrackerService", () => {
  let service: NowPlayingTrackerService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new NowPlayingTrackerService();
    findTrackByTrackIdAndFriendId.mockImplementation(async (trackId: string) =>
      trackRow({ track_id: trackId })
    );
    publishSnapshot.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function lastSnapshot() {
    return publishSnapshot.mock.calls.at(-1)?.[0];
  }

  // ─── confirm ──────────────────────────────────────────────────────────────

  it("goes idle -> candidate on the first confident window", async () => {
    await service.observe("src-1", window({ at: T0 }), T0, OPTS);

    expect(publishSnapshot).toHaveBeenCalledTimes(1);
    expect(lastSnapshot()).toMatchObject({ source_id: "src-1", state: "candidate" });
    expect(lastSnapshot().track).toMatchObject({ track_id: "track-a", title: "Voodoo Ray" });
  });

  it("confirms candidate -> playing once minWindows consecutive windows agree", async () => {
    await service.observe("src-1", window({ at: T0 }), T0, OPTS);
    publishSnapshot.mockClear();

    await service.observe("src-1", window({ at: T0 + 15_000, offset_seconds: 25 }), T0 + 15_000, OPTS);

    expect(publishSnapshot).toHaveBeenCalledTimes(1);
    expect(lastSnapshot()).toMatchObject({ state: "playing" });
    expect(lastSnapshot().track.track_id).toBe("track-a");
  });

  it("ignores a window below the confidence floor", async () => {
    await service.observe("src-1", window({ confidence: 0.5 }), T0, OPTS);
    expect(publishSnapshot).not.toHaveBeenCalled();
  });

  it("ignores a window with no track match", async () => {
    await service.observe("src-1", window({ track_id: null, friend_id: null, confidence: null }), T0, OPTS);
    expect(publishSnapshot).not.toHaveBeenCalled();
  });

  it("does not confirm a run whose position does not advance with the clock", async () => {
    // Same offset twice, 15s of clock apart -> rate 0, outside PLAY_RATE_MIN/MAX.
    await service.observe("src-1", window({ at: T0, offset_seconds: 30 }), T0, OPTS);
    publishSnapshot.mockClear();
    await service.observe("src-1", window({ at: T0 + 15_000, offset_seconds: 30 }), T0 + 15_000, OPTS);

    expect(publishSnapshot).not.toHaveBeenCalled();
  });

  // ─── stray window ───────────────────────────────────────────────────────────

  it("a single stray window at a track boundary publishes nothing beyond candidate", async () => {
    await service.observe("src-1", window({ at: T0 }), T0, OPTS);
    expect(lastSnapshot().state).toBe("candidate");
    publishSnapshot.mockClear();

    // A different track's single window, then nothing further: never escalates to playing.
    await service.observe(
      "src-1",
      window({ at: T0 + 5_000, track_id: "track-b", friend_id: 1 }),
      T0 + 5_000,
      OPTS
    );
    expect(lastSnapshot().state).toBe("candidate");
    expect(lastSnapshot().track.track_id).toBe("track-b");

    for (const call of publishSnapshot.mock.calls) {
      expect(call[0].state).not.toBe("playing");
    }
  });

  // ─── blend A -> B ───────────────────────────────────────────────────────────

  it("blends from track A to track B only once the new track is confirmed", async () => {
    await service.observe("src-1", window({ at: T0 }), T0, OPTS);
    await service.observe("src-1", window({ at: T0 + 15_000, offset_seconds: 25 }), T0 + 15_000, OPTS);
    expect(lastSnapshot()).toMatchObject({ state: "playing" });
    publishSnapshot.mockClear();

    // One window of B while A is still playing: not confirmed, no flicker.
    await service.observe(
      "src-1",
      window({ at: T0 + 30_000, track_id: "track-b", friend_id: 1, offset_seconds: 5 }),
      T0 + 30_000,
      OPTS
    );
    expect(publishSnapshot).not.toHaveBeenCalled();

    // Second consecutive B window confirms the blend.
    await service.observe(
      "src-1",
      window({ at: T0 + 45_000, track_id: "track-b", friend_id: 1, offset_seconds: 20 }),
      T0 + 45_000,
      OPTS
    );
    expect(publishSnapshot).toHaveBeenCalledTimes(1);
    expect(lastSnapshot()).toMatchObject({ state: "playing" });
    expect(lastSnapshot().track.track_id).toBe("track-b");
  });

  it("does not bounce back to the old track after a confirmed blend", async () => {
    await service.observe("src-1", window({ at: T0 }), T0, OPTS);
    await service.observe("src-1", window({ at: T0 + 15_000, offset_seconds: 25 }), T0 + 15_000, OPTS);
    await service.observe(
      "src-1",
      window({ at: T0 + 30_000, track_id: "track-b", friend_id: 1, offset_seconds: 5 }),
      T0 + 30_000,
      OPTS
    );
    await service.observe(
      "src-1",
      window({ at: T0 + 45_000, track_id: "track-b", friend_id: 1, offset_seconds: 20 }),
      T0 + 45_000,
      OPTS
    );
    publishSnapshot.mockClear();

    // A single stray echo of the old track must not switch the display back.
    await service.observe("src-1", window({ at: T0 + 46_000, offset_seconds: 41 }), T0 + 46_000, OPTS);

    expect(publishSnapshot).not.toHaveBeenCalled();
  });

  it("reconfirms the playing track on every matching window, resetting the stop timer", async () => {
    await service.observe("src-1", window({ at: T0 }), T0, OPTS);
    await service.observe("src-1", window({ at: T0 + 15_000, offset_seconds: 25 }), T0 + 15_000, OPTS);
    publishSnapshot.mockClear();

    const reconfirmAt = T0 + 15_000 + 30_000;
    await service.observe("src-1", window({ at: reconfirmAt, offset_seconds: 55 }), reconfirmAt, OPTS);
    expect(publishSnapshot).not.toHaveBeenCalled();

    // The original gap deadline (from the last confirming window) has long
    // passed, but the reconfirmation above reset the timer.
    await service.tick(T0 + 15_000 + OPTS.gapSeconds * 1000, OPTS);
    expect(publishSnapshot).not.toHaveBeenCalled();
  });

  // ─── stop ───────────────────────────────────────────────────────────────────

  it("goes playing -> stopped after the gap, keeping the last track on screen", async () => {
    await service.observe("src-1", window({ at: T0 }), T0, OPTS);
    await service.observe("src-1", window({ at: T0 + 15_000, offset_seconds: 25 }), T0 + 15_000, OPTS);
    publishSnapshot.mockClear();

    await service.tick(T0 + 15_000 + OPTS.gapSeconds * 1000 - 1, OPTS);
    expect(publishSnapshot).not.toHaveBeenCalled();

    await service.tick(T0 + 15_000 + OPTS.gapSeconds * 1000, OPTS);
    expect(publishSnapshot).toHaveBeenCalledTimes(1);
    expect(lastSnapshot()).toMatchObject({ state: "stopped" });
    expect(lastSnapshot().track.track_id).toBe("track-a");
  });

  it("goes stopped -> playing once the same track reconfirms", async () => {
    await service.observe("src-1", window({ at: T0 }), T0, OPTS);
    await service.observe("src-1", window({ at: T0 + 15_000, offset_seconds: 25 }), T0 + 15_000, OPTS);
    const stopAt = T0 + 15_000 + OPTS.gapSeconds * 1000;
    await service.tick(stopAt, OPTS);
    expect(lastSnapshot().state).toBe("stopped");
    publishSnapshot.mockClear();

    await service.observe("src-1", window({ at: stopAt + 1000, offset_seconds: 60 }), stopAt + 1000, OPTS);
    expect(publishSnapshot).not.toHaveBeenCalled(); // first window only rebuilds the run

    await service.observe("src-1", window({ at: stopAt + 16_000, offset_seconds: 75 }), stopAt + 16_000, OPTS);
    expect(publishSnapshot).toHaveBeenCalledTimes(1);
    expect(lastSnapshot()).toMatchObject({ state: "playing" });
    expect(lastSnapshot().track.track_id).toBe("track-a");
  });

  // ─── clear ──────────────────────────────────────────────────────────────────

  it("clears stopped -> idle after NOW_PLAYING_CLEAR_SECONDS, publishing an empty track", async () => {
    await service.observe("src-1", window({ at: T0 }), T0, OPTS);
    await service.observe("src-1", window({ at: T0 + 15_000, offset_seconds: 25 }), T0 + 15_000, OPTS);
    const stopAt = T0 + 15_000 + OPTS.gapSeconds * 1000;
    await service.tick(stopAt, OPTS);
    publishSnapshot.mockClear();

    await service.tick(stopAt + OPTS.clearSeconds * 1000 - 1, OPTS);
    expect(publishSnapshot).not.toHaveBeenCalled();

    await service.tick(stopAt + OPTS.clearSeconds * 1000, OPTS);
    expect(publishSnapshot).toHaveBeenCalledTimes(1);
    expect(lastSnapshot()).toMatchObject({ state: "idle", track: null });
  });

  it("clears an unconfirmed candidate back to idle after the gap, without ever reaching playing", async () => {
    await service.observe("src-1", window({ at: T0 }), T0, OPTS);
    expect(lastSnapshot().state).toBe("candidate");
    publishSnapshot.mockClear();

    await service.tick(T0 + OPTS.gapSeconds * 1000, OPTS);

    expect(publishSnapshot).toHaveBeenCalledTimes(1);
    expect(lastSnapshot()).toMatchObject({ state: "idle", track: null });
  });

  it("does nothing on tick for a source with nothing due", async () => {
    await service.observe("src-1", window({ at: T0 }), T0, OPTS);
    publishSnapshot.mockClear();

    await service.tick(T0 + 1000, OPTS);
    expect(publishSnapshot).not.toHaveBeenCalled();
  });

  // ─── metadata / edge cases ──────────────────────────────────────────────────

  it("falls back to the module defaults (PLAY_CONFIDENCE_FLOOR etc.) when no options are given", async () => {
    await service.observe("src-1", window({ at: T0 }));
    await service.observe("src-1", window({ at: T0 + 15_000, offset_seconds: 25 }));

    expect(lastSnapshot()).toMatchObject({ state: "playing" });
  });

  it("falls back to null/empty for a track missing its optional metadata", async () => {
    findTrackByTrackIdAndFriendId.mockResolvedValueOnce({
      track_id: "track-a",
      friend_id: 1,
      title: "Voodoo Ray",
      artist: "A Guy Called Gerald",
      album: null,
      position: null,
      year: null,
    });

    await service.observe("src-1", window({ at: T0 }), T0, OPTS);

    expect(lastSnapshot().track).toMatchObject({
      release_id: null,
      bpm: null,
      key: null,
      genres: [],
      duration_seconds: null,
      cover_url: null,
    });
  });

  it("reports a null offset when the confirming window did not carry one", async () => {
    await service.observe("src-1", window({ at: T0, offset_seconds: undefined }), T0, OPTS);
    await service.observe("src-1", window({ at: T0 + 15_000, offset_seconds: undefined }), T0 + 15_000, OPTS);

    expect(lastSnapshot()).toMatchObject({ state: "playing", offset_seconds: null });
  });

  it("prefers embedded file art over the Discogs thumbnail for cover_url", async () => {
    findTrackByTrackIdAndFriendId.mockResolvedValueOnce(
      trackRow({ audio_file_album_art_url: "https://files.example.com/art.jpg" })
    );

    await service.observe("src-1", window({ at: T0 }), T0, OPTS);

    expect(lastSnapshot().track.cover_url).toBe("https://files.example.com/art.jpg");
  });

  it("does not publish when the matched track can no longer be resolved", async () => {
    findTrackByTrackIdAndFriendId.mockResolvedValueOnce(null);

    await service.observe("src-1", window({ at: T0 }), T0, OPTS);

    expect(publishSnapshot).not.toHaveBeenCalled();
  });

  it("swallows and logs a lookup failure instead of throwing", async () => {
    findTrackByTrackIdAndFriendId.mockRejectedValueOnce(new Error("db exploded"));

    await expect(service.observe("src-1", window({ at: T0 }), T0, OPTS)).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[now-playing] observe failed"),
      expect.any(Error)
    );
  });

  it("resets all in-memory source state", async () => {
    await service.observe("src-1", window({ at: T0 }), T0, OPTS);
    expect(lastSnapshot().state).toBe("candidate");

    service.reset();
    publishSnapshot.mockClear();

    // With no memory of the earlier run, one window is a fresh idle->candidate again.
    await service.observe("src-1", window({ at: T0 + 1000 }), T0 + 1000, OPTS);
    expect(publishSnapshot).toHaveBeenCalledTimes(1);
    expect(lastSnapshot().state).toBe("candidate");
  });

  it("logs, but keeps going, when one source's tick throws", async () => {
    await service.observe("src-1", window({ at: T0 }), T0, OPTS);
    await service.observe("src-1", window({ at: T0 + 15_000, offset_seconds: 25 }), T0 + 15_000, OPTS);
    await service.observe("src-2", window({ at: T0, track_id: "track-b" }), T0, OPTS);
    await service.observe("src-2", window({ at: T0 + 15_000, track_id: "track-b", offset_seconds: 25 }), T0 + 15_000, OPTS);
    publishSnapshot.mockClear();
    publishSnapshot.mockRejectedValueOnce(new Error("broker down"));

    const stopAt = T0 + 15_000 + OPTS.gapSeconds * 1000;
    await service.tick(stopAt, OPTS);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[now-playing] tick failed for"),
      expect.any(Error)
    );
    // The second source's own transition still happened despite the first one's failure.
    expect(publishSnapshot).toHaveBeenCalledTimes(2);
  });

  it("keeps sources independent", async () => {
    await service.observe("src-1", window({ at: T0 }), T0, OPTS);
    await service.observe("src-2", window({ at: T0, track_id: "track-b" }), T0, OPTS);

    const sourceIds = publishSnapshot.mock.calls.map((call) => call[0].source_id);
    expect(sourceIds).toEqual(["src-1", "src-2"]);
  });
});

describe("nowPlayingClearSeconds", () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("defaults to 60 seconds", () => {
    delete process.env.NOW_PLAYING_CLEAR_SECONDS;
    expect(nowPlayingClearSeconds()).toBe(60);
  });

  it("reads a configured positive value", () => {
    process.env.NOW_PLAYING_CLEAR_SECONDS = "90";
    expect(nowPlayingClearSeconds()).toBe(90);
  });

  it("falls back to the default for a nonsense value", () => {
    process.env.NOW_PLAYING_CLEAR_SECONDS = "not-a-number";
    expect(nowPlayingClearSeconds()).toBe(60);
  });
});

describe("startNowPlayingTracker", () => {
  const GUARD = "__groovenetNowPlayingTrackerStarted";
  const realSetInterval = globalThis.setInterval;
  let timers: ReturnType<typeof setInterval>[];

  beforeEach(async () => {
    vi.clearAllMocks();
    timers = [];
    delete (globalThis as Record<string, unknown>)[GUARD];
    vi.spyOn(globalThis, "setInterval").mockImplementation(((fn: () => void, ms: number) => {
      const handle = realSetInterval(fn, ms);
      timers.push(handle);
      return handle;
    }) as typeof setInterval);
  });

  afterEach(() => {
    for (const handle of timers) clearInterval(handle);
    delete (globalThis as Record<string, unknown>)[GUARD];
    vi.restoreAllMocks();
  });

  it("connects the publisher and starts only once per process", async () => {
    const { startNowPlayingTracker } = await import("../nowPlayingTrackerService");

    startNowPlayingTracker();
    startNowPlayingTracker();

    expect(connectPublisher).toHaveBeenCalledTimes(1);
    expect(globalThis.setInterval).toHaveBeenCalledTimes(1);
  });

  it("sweeps on a 15 second interval", async () => {
    const { startNowPlayingTracker } = await import("../nowPlayingTrackerService");

    startNowPlayingTracker();

    expect(globalThis.setInterval).toHaveBeenCalledWith(expect.any(Function), 15_000);
  });

  it("ticks the tracker when the interval fires", async () => {
    const { startNowPlayingTracker, nowPlayingTrackerService: trackerSingleton } = await import(
      "../nowPlayingTrackerService"
    );
    const tickSpy = vi.spyOn(trackerSingleton, "tick").mockResolvedValue(undefined);

    startNowPlayingTracker();
    const callback = (globalThis.setInterval as ReturnType<typeof vi.fn>).mock.calls[0][0] as () => void;
    callback();

    expect(tickSpy).toHaveBeenCalledTimes(1);
  });
});

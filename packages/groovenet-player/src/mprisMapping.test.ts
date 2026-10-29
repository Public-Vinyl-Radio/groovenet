import { describe, expect, it } from "vitest";
import type { PlaybackSnapshot } from "./types.js";
import {
  microseconds,
  NO_TRACK,
  playbackStatus,
  trackPath,
  transportCommand,
} from "./mprisMapping.js";

export const snapshot: PlaybackSnapshot = {
  status: "playing",
  current: {
    id: "queue-1/a",
    track: { track_id: "a", friend_id: 1, title: "Title", artist: "Artist", album: "Album" },
  },
  queue: [],
  position: 12.5,
  duration: 120,
  volume: 100,
  error: null,
};
snapshot.queue = [snapshot.current!];

describe("MPRIS mapping", () => {
  it("maps statuses, seconds and unique queue entry paths", () => {
    expect(microseconds(1.25)).toBe(1250000n);
    expect(microseconds(-1)).toBe(0n);
    for (const status of ["loading", "ended", "stopped", "error"] as const)
      expect(playbackStatus({ ...snapshot, status })).toBe("Stopped");
    expect(playbackStatus(snapshot)).toBe("Playing");
    expect(playbackStatus({ ...snapshot, status: "paused" })).toBe("Paused");
    expect(trackPath(snapshot)).toMatch(/^\/org\/mpris\/MediaPlayer2\/track\/[a-zA-Z0-9_]+$/);
    expect(trackPath({ ...snapshot, current: { ...snapshot.current!, id: "queue_1/a" } })).not.toBe(
      trackPath(snapshot),
    );
    expect(trackPath({ ...snapshot, current: null })).toBe(NO_TRACK);
  });

  it("forwards transport and makes play/pause idempotent", () => {
    expect(transportCommand(snapshot, "Play")).toBeNull();
    expect(transportCommand(snapshot, "Pause")).toEqual({ method: "pause" });
    expect(transportCommand(snapshot, "PlayPause")).toEqual({ method: "pause" });
    const paused = { ...snapshot, status: "paused" as const };
    expect(transportCommand(paused, "PlayPause")).toEqual({ method: "play" });
    expect(transportCommand(paused, "Pause")).toBeNull();
    expect(transportCommand({ ...snapshot, status: "stopped" }, "Play")).toEqual({
      method: "play",
    });
    for (const [method, rpc] of [
      ["Next", "next"],
      ["Previous", "prev"],
      ["Stop", "stop"],
    ])
      expect(transportCommand(snapshot, method!)).toEqual({ method: rpc });
    for (const method of ["Play", "Next", "Previous"])
      expect(transportCommand({ ...paused, queue: [] }, method)).toBeNull();
    expect(transportCommand(snapshot, "unsupported")).toBeNull();
  });

  it("maps relative and absolute seeks, guarding stale tracks and bounds", () => {
    expect(transportCommand(snapshot, "Seek", 2_000_000)).toEqual({
      method: "seek",
      params: { seconds: 14.5 },
    });
    expect(transportCommand(snapshot, "Seek", -20_000_000)).toEqual({
      method: "seek",
      params: { seconds: 0 },
    });
    expect(transportCommand(snapshot, "Seek", 200_000_000)).toEqual({ method: "next" });
    expect(transportCommand(snapshot, "SetPosition", 20_000_000, trackPath(snapshot))).toEqual({
      method: "seek",
      params: { seconds: 20 },
    });
    for (const value of [-1, 121_000_000])
      expect(transportCommand(snapshot, "SetPosition", value, trackPath(snapshot))).toBeNull();
    expect(transportCommand(snapshot, "SetPosition", 100, "/stale")).toBeNull();
    expect(transportCommand(snapshot, "SetPosition")).toBeNull();
    expect(transportCommand(snapshot, "Seek", NaN)).toBeNull();
    expect(transportCommand({ ...snapshot, current: null }, "Seek", 100)).toBeNull();
    expect(transportCommand({ ...snapshot, status: "stopped" }, "Seek", 100)).toBeNull();
    expect(transportCommand({ ...snapshot, duration: null }, "Seek", 200_000_000)).toEqual({
      method: "seek",
      params: { seconds: 212.5 },
    });
  });
});

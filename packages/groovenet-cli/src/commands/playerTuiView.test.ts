import { describe, expect, it } from "vitest";
import type { PlaybackSnapshot } from "@groovenet/player";
import { formatPlayback, visibleWindow } from "./playerTuiView.js";

describe("player TUI state rendering", () => {
  it("shows current track metadata, progress, and transport state", () => {
    const snapshot = {
      status: "playing", position: 65, duration: 180, volume: 70, error: null,
      current: { id: "q1", track: { title: "Blue Train", artist: "John Coltrane", bpm: 132, key: "A minor" } }, queue: [],
    } as unknown as PlaybackSnapshot;
    expect(formatPlayback(snapshot)).toEqual([
      "John Coltrane — Blue Train",
      "132 BPM · A minor",
      expect.stringContaining("1:05 / 3:00 · playing · 70%"),
    ]);
  });

  it("handles an empty player and formats time safely", () => {
    expect(formatPlayback({ status: "stopped", current: null, queue: [], position: 0, duration: null, volume: 100, error: null })).toEqual([
      "Nothing playing", "", expect.stringContaining("0:00 / --:-- · stopped · 100%"),
    ]);
    expect(formatPlayback({ status: "stopped", current: null, queue: [], position: -1, duration: 3723, volume: 100, error: null })[2]).toContain("0:00 / 1:02:03");
  });

  it("omits track metadata when BPM and key are absent", () => {
    const snapshot = {
      status: "paused", position: 0, duration: 0, volume: 100, error: null,
      current: { id: "q1", track: { title: "Untitled", artist: "Unknown", bpm: null, key: "" } }, queue: [],
    } as unknown as PlaybackSnapshot;
    expect(formatPlayback(snapshot)).toEqual([
      "Unknown — Untitled",
      "",
      expect.stringContaining("0:00 / 0:00 · paused · 100%"),
    ]);
  });
});

describe("visibleWindow", () => {
  it("shows everything when the list fits", () => {
    expect(visibleWindow(5, 4, 12)).toEqual({ start: 0, end: 5 });
    expect(visibleWindow(12, 11, 12)).toEqual({ start: 0, end: 12 });
  });

  it("stays on the first page until the selection passes its last row", () => {
    expect(visibleWindow(40, 0, 12)).toEqual({ start: 0, end: 12 });
    expect(visibleWindow(40, 11, 12)).toEqual({ start: 0, end: 12 });
    expect(visibleWindow(40, 12, 12)).toEqual({ start: 1, end: 13 });
  });

  it("keeps the selection on the last row while scrolling and stops at the end", () => {
    expect(visibleWindow(40, 25, 12)).toEqual({ start: 14, end: 26 });
    expect(visibleWindow(40, 39, 12)).toEqual({ start: 28, end: 40 });
    expect(visibleWindow(40, 99, 12)).toEqual({ start: 28, end: 40 });
  });
});

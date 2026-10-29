import { describe, expect, it } from "vitest";
import {
  advanceProgress,
  initialProgress,
  isPlay,
  playThreshold,
  type ListenProgress,
} from "./playThreshold.js";

describe("playThreshold", () => {
  it("is half the duration for ordinary tracks", () => {
    expect(playThreshold(200)).toBe(100);
  });

  it("caps at 240 seconds for long tracks", () => {
    expect(playThreshold(480)).toBe(240);
    expect(playThreshold(481)).toBe(240);
    expect(playThreshold(3600)).toBe(240);
  });

  it("rejects tracks under 30 seconds and accepts exactly 30", () => {
    expect(playThreshold(29.9)).toBeNull();
    expect(playThreshold(0)).toBeNull();
    expect(playThreshold(30)).toBe(15);
  });

  it("uses the absolute limit when the duration is unknown", () => {
    expect(playThreshold(null)).toBe(240);
    expect(playThreshold(Number.NaN)).toBeNull();
  });
});

describe("isPlay", () => {
  it("is false just under the threshold and true at it", () => {
    expect(isPlay(99.9, 200)).toBe(false);
    expect(isPlay(100, 200)).toBe(true);
    expect(isPlay(239, null)).toBe(false);
    expect(isPlay(240, null)).toBe(true);
  });

  it("never counts a short track", () => {
    expect(isPlay(29, 29)).toBe(false);
  });
});

describe("advanceProgress", () => {
  const at = (listened: number, lastPosition: number | null): ListenProgress => ({
    listened,
    lastPosition,
  });

  it("adds forward progress while playing", () => {
    expect(advanceProgress(initialProgress, 1, true)).toEqual(at(1, 1));
    expect(advanceProgress(at(1, 1), 2.5, true)).toEqual(at(2.5, 2.5));
  });

  it("adds nothing while paused but tracks the position", () => {
    expect(advanceProgress(at(10, 10), 11, false)).toEqual(at(10, 11));
  });

  it("does not count a seek forward or backward", () => {
    expect(advanceProgress(at(10, 10), 120, true)).toEqual(at(10, 120));
    expect(advanceProgress(at(10, 50), 5, true)).toEqual(at(10, 5));
  });

  it("counts a step of exactly the limit and honours a custom one", () => {
    expect(advanceProgress(at(0, 0), 5, true).listened).toBe(5);
    expect(advanceProgress(at(0, 0), 5.1, true).listened).toBe(0);
    expect(advanceProgress(at(0, 0), 8, true, 10).listened).toBe(8);
  });

  it("ignores repeated positions and non-finite ones", () => {
    expect(advanceProgress(at(3, 3), 3, true)).toEqual(at(3, 3));
    const same = at(3, 3);
    expect(advanceProgress(same, Number.NaN, true)).toBe(same);
  });

  it("starts from the first position seen when there is no reference", () => {
    expect(advanceProgress(at(0, null), 4, true)).toEqual(at(0, 4));
  });
});

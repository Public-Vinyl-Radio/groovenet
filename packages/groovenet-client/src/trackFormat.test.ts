import { describe, expect, it } from "vitest";
import type { Track } from "./types.js";
import {
  camelotOf,
  formatSeconds,
  getTrackDurationSeconds,
  keyToCamelot,
  parseBpm,
  parseDurationToSeconds,
  queueSummary,
  trackDurationLabel,
  trackMetaLine,
} from "./trackFormat.js";

const t = (over: Partial<Track>) => ({ title: "T", artist: "A", ...over }) as Track;

describe("track formatters", () => {
  it("joins position, BPM and Camelot key, skipping what's unknown", () => {
    expect(trackMetaLine(t({ position: "A1", bpm: "133.6", key: "D minor" }))).toBe(
      "A1 · 134 BPM · 7A",
    );
    expect(trackMetaLine(t({ position: "", bpm: null, key: "8A" }))).toBe("8A");
    expect(trackMetaLine(t({ position: "B2", bpm: null, key: null }))).toBe("B2");
    expect(trackMetaLine(t({ position: undefined, bpm: "120", key: null }))).toBe("120 BPM");
    expect(trackMetaLine(null)).toBe("");
  });

  it("formats durations and the queue summary", () => {
    expect(trackDurationLabel(t({ duration_seconds: 242 }))).toBe("4:02");
    expect(trackDurationLabel(t({ duration: "" }))).toBe("");
    expect(queueSummary([t({ duration_seconds: 60 }), t({ duration: "1:30" })])).toBe(
      "2 tracks · 2:30",
    );
    expect(queueSummary([t({})])).toBe("1 track · 0:00");
  });

  it("parses tempo", () => {
    expect([
      parseBpm(120),
      parseBpm("133.6"),
      parseBpm("0"),
      parseBpm("x"),
      parseBpm(null),
      parseBpm(undefined),
    ]).toEqual([120, 133.6, null, null, null, null]);
  });

  it("converts spelled keys to Camelot and leaves the rest", () => {
    expect(keyToCamelot(null)).toBe("-");
    expect(keyToCamelot("A minor")).toBe("8A");
    expect(keyToCamelot("  a   MINOR ")).toBe("8A");
    expect(keyToCamelot("f#minor")).toBe("11A");
    expect(keyToCamelot("H flat")).toBe("H flat");
    expect(keyToCamelot("Fb major")).toBe("Fb major");
    expect(camelotOf("9a")).toBe("9A");
    expect(camelotOf("D minor")).toBe("7A");
    expect(camelotOf("H flat")).toBeNull();
    expect(camelotOf(undefined)).toBeNull();
  });

  it("reads and writes clock times", () => {
    expect([
      parseDurationToSeconds(""),
      parseDurationToSeconds("42"),
      parseDurationToSeconds("1:30"),
      parseDurationToSeconds("1:01:01"),
      parseDurationToSeconds("1:2:3:4"),
    ]).toEqual([0, 42, 90, 3661, 0]);
    expect([
      formatSeconds(-1),
      formatSeconds(Number.NaN),
      formatSeconds(59.6),
      formatSeconds(242),
      formatSeconds(3723),
    ]).toEqual(["0:00", "0:00", "1:00", "4:02", "1:02:03"]);
    expect([
      getTrackDurationSeconds({ duration_seconds: 5 }),
      getTrackDurationSeconds({ duration: "0:00" }),
      getTrackDurationSeconds({}),
    ]).toEqual([5, null, null]);
  });
});

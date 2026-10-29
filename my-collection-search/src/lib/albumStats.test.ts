import { describe, expect, it } from "vitest";
import {
  bpmRange,
  formatBpmRange,
  formatSideRuntimes,
  formatSideSplit,
  formatSpinCount,
  hasSides,
  openingKey,
  summarizeSides,
  summarizeSpinStats,
} from "./albumStats";

const t = (position: string, extra: Record<string, unknown> = {}) => ({ position, ...extra });

describe("summarizeSides", () => {
  const sides = summarizeSides([
    t("B1", { duration: "3:00" }),
    t("A1", { duration: "4:00" }),
    t("A2", { duration_seconds: 60 }),
    t("A3"),
  ]);

  it("groups by side with each side's runtime, skipping tracks without one", () => {
    expect(sides.map((s) => [s.shortLabel, s.tracks.length, s.seconds])).toEqual([
      ["A", 3, 300],
      ["B", 1, 180],
    ]);
  });

  it("formats the split and the runtimes", () => {
    expect(formatSideSplit(sides)).toBe("3 + 1");
    expect(formatSideRuntimes(sides)).toBe("A 5:00 · B 3:00");
    expect(hasSides(sides)).toBe(true);
  });

  it("says nothing about one undivided tracklist", () => {
    const one = summarizeSides([t("1", { duration: "1:00" }), t("2")]);
    expect(one[0].shortLabel).toBe("Tracklist");
    expect(hasSides(one)).toBe(false);
    expect(formatSideSplit(one)).toBe("");
    expect(formatSideRuntimes(one)).toBe("");
  });

  it("leaves a side with no durations out of the runtimes", () => {
    expect(formatSideRuntimes(summarizeSides([t("A1", { duration: "1:00" }), t("B1")]))).toBe(
      "A 1:00",
    );
  });
});

describe("bpmRange", () => {
  it("spans the tracks that have a tempo", () => {
    const range = bpmRange([{ bpm: "94" }, { bpm: 150.4 }, { bpm: null }, { bpm: "x" }]);
    expect(range).toEqual({ min: 94, max: 150.4 });
    expect(formatBpmRange(range)).toBe("94–150");
  });

  it("is a single number when the tempo never moves, and null with none", () => {
    expect(formatBpmRange(bpmRange([{ bpm: 120 }, { bpm: "120.2" }]))).toBe("120");
    expect(bpmRange([{ bpm: null }])).toBeNull();
    expect(formatBpmRange(null)).toBeNull();
  });
});

describe("openingKey", () => {
  it("is the first track with a recognisable key", () => {
    expect(openingKey([{ key: "nope" }, { key: "A minor" }, { key: "C major" }])).toEqual({
      camelot: "8A",
      name: "A minor",
    });
  });

  it("is null when no track has one", () => {
    expect(openingKey([{ key: null }, {}])).toBeNull();
  });
});

describe("spin stats", () => {
  const spin = (played_at: string) => ({ session: { played_at } });

  it("counts spins and finds the latest, whatever the order", () => {
    const stats = summarizeSpinStats(
      [spin("2026-05-01T10:00:00Z"), spin("2026-06-05T19:43:00Z"), spin("bad")],
      8,
    );
    expect(stats).toEqual({ count: 3, capped: false, lastPlayedAt: "2026-06-05T19:43:00Z" });
  });

  it("has no last spin without spins, and flags a full page", () => {
    expect(summarizeSpinStats([], 8)).toEqual({ count: 0, capped: false, lastPlayedAt: null });
    expect(
      summarizeSpinStats(
        Array.from({ length: 8 }, () => spin("2026-01-01T00:00:00Z")),
        8,
      ).capped,
    ).toBe(true);
  });

  it("words the count", () => {
    expect(formatSpinCount({ count: 0, capped: false })).toBe("0 spins");
    expect(formatSpinCount({ count: 1, capped: false })).toBe("1 spin");
    expect(formatSpinCount({ count: 8, capped: true })).toBe("8+ spins");
  });
});

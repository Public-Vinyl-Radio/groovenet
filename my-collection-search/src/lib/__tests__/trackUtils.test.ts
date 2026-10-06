import { describe, it, expect } from "vitest";
import {
  parseDurationToSeconds,
  formatSeconds,
  getTrackDurationSeconds,
  dedupeDisplayTags,
  explodeDisplayTags,
  trackGenreLabels,
} from "../trackUtils";

describe("parseDurationToSeconds", () => {
  it.each([
    ["3:45", 225],
    ["10:05", 605],
    ["0:30", 30],
    ["0:00", 0],
    ["1:00:00", 3600],
    ["1:01:01", 3661],
    ["2:30:00", 9000],
    ["45", 45],
    ["", 0],
  ])("parseDurationToSeconds(%s) === %d", (input, expected) => {
    expect(parseDurationToSeconds(input)).toBe(expected);
  });
});

describe("formatSeconds", () => {
  it.each([
    [225, "3:45"],
    [605, "10:05"],
    [30, "0:30"],
    [0, "0:00"],
    [3600, "1:00:00"],
    [3661, "1:01:01"],
    [9000, "2:30:00"],
    [59, "0:59"],
    [60, "1:00"],
  ])("formatSeconds(%d) === %s", (input, expected) => {
    expect(formatSeconds(input)).toBe(expected);
  });

  it("parseDurationToSeconds and formatSeconds are inverses", () => {
    const cases = ["3:45", "1:01:01", "0:30", "10:05", "2:30:00"];
    for (const dur of cases) {
      expect(formatSeconds(parseDurationToSeconds(dur))).toBe(dur);
    }
  });
});

describe("getTrackDurationSeconds", () => {
  it("returns duration_seconds when positive", () => {
    expect(getTrackDurationSeconds({ duration_seconds: 225 })).toBe(225);
  });

  it("falls back to parsing duration string when duration_seconds is absent", () => {
    expect(getTrackDurationSeconds({ duration: "3:45" })).toBe(225);
  });

  it("falls back to duration string when duration_seconds is 0", () => {
    expect(getTrackDurationSeconds({ duration_seconds: 0, duration: "3:45" })).toBe(225);
  });

  it("falls back to duration string when duration_seconds is null", () => {
    expect(getTrackDurationSeconds({ duration_seconds: null, duration: "3:45" })).toBe(225);
  });

  it("returns null when both fields are absent", () => {
    expect(getTrackDurationSeconds({})).toBeNull();
  });

  it("returns null when duration_seconds is 0 and duration is null", () => {
    expect(getTrackDurationSeconds({ duration_seconds: 0, duration: null })).toBeNull();
  });

  it("returns null when duration parses to 0", () => {
    expect(getTrackDurationSeconds({ duration: "0:00" })).toBeNull();
  });
});

describe("explodeDisplayTags", () => {
  it("splits comma and middle-dot separated local tags", () => {
    expect(
      explodeDisplayTags([
        "House, Deep House",
        "psychedelic soul · cinematic funk • instrumental groove",
      ])
    ).toEqual([
      "House",
      "Deep House",
      "psychedelic soul",
      "cinematic funk",
      "instrumental groove",
    ]);
  });

  it("does not split on slashes", () => {
    expect(explodeDisplayTags("Funk / Soul")).toEqual(["Funk / Soul"]);
  });

  it("dedupes tags and ignores empty placeholders", () => {
    expect(explodeDisplayTags(["House", "house, {}", "", "{}", null])).toEqual([
      "House",
    ]);
  });
});

describe("dedupeDisplayTags", () => {
  it("keeps Discogs genres with slashes as one tag", () => {
    expect(dedupeDisplayTags(["Funk / Soul"])).toEqual(["Funk / Soul"]);
  });

  it("keeps Discogs genres with commas as one tag", () => {
    expect(dedupeDisplayTags(["Folk, World, & Country"])).toEqual([
      "Folk, World, & Country",
    ]);
  });

  it("dedupes case-insensitively and drops empty or {} values", () => {
    expect(
      dedupeDisplayTags(["Rock", "rock", " ", "{}", "", null, "Jazz"])
    ).toEqual(["Rock", "Jazz"]);
  });

  it("returns an empty list for non-array, non-string input", () => {
    expect(dedupeDisplayTags(undefined)).toEqual([]);
  });
});

describe("trackGenreLabels", () => {
  it("badges taxonomy genres once a track has any, ignoring its raw tags", () => {
    expect(
      trackGenreLabels({
        track_genres: [{ name: "Cumbia" }, { name: "Chicha" }],
        local_tags: "Psychedelic Cumbia, Uplifting",
      })
    ).toEqual(["Cumbia", "Chicha"]);
  });

  it("falls back to the split raw tags for a track not yet reconciled", () => {
    expect(trackGenreLabels({ track_genres: [], local_tags: "Salsa · Boogaloo" })).toEqual(["Salsa", "Boogaloo"]);
    expect(trackGenreLabels({ local_tags: "{}" })).toEqual([]);
  });
});

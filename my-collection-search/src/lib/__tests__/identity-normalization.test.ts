import { describe, it, expect } from "vitest";
import {
  normalizeList,
  formatList,
  yearToEra,
  filterIdentityTags,
  normalizeCountry,
  normalizeLabels,
  combineGenres,
  normalizeStyles,
  normalizeLocalTags,
  normalizeComposer,
} from "../identity-normalization";

describe("normalizeList", () => {
  it("deduplicates and lowercases", () => {
    expect(normalizeList(["House", "Techno", "house"])).toEqual(["house", "techno"]);
  });

  it("handles string input and removes punctuation", () => {
    expect(normalizeList("Drum & Bass")).toEqual(["drum bass"]);
  });

  it("handles null", () => {
    expect(normalizeList(null)).toEqual([]);
  });

  it("handles empty array", () => {
    expect(normalizeList([])).toEqual([]);
  });

  it("trims whitespace", () => {
    expect(normalizeList(["  Ambient  ", "Dub  "])).toEqual(["ambient", "dub"]);
  });
});

describe("formatList", () => {
  it("formats list as comma-separated string", () => {
    expect(formatList(["house", "techno"])).toBe("house, techno");
  });

  it("handles empty list", () => {
    expect(formatList([])).toBe("");
  });
});

describe("yearToEra", () => {
  it.each([
    [2024, "2020s"],
    [2015, "2010s"],
    [2005, "2000s"],
    [1995, "1990s"],
    [1985, "1980s"],
    [1975, "1970s"],
    [1965, "1960s"],
    [1955, "1950s"],
    [1945, "pre-1950s"],
    [null, "unknown-era"],
    ["invalid", "unknown-era"],
    ["1999", "1990s"],
  ])("yearToEra(%s) === %s", (input, expected) => {
    expect(yearToEra(input as never)).toBe(expected);
  });
});

describe("filterIdentityTags", () => {
  it("filters out DJ-function tags", () => {
    expect(filterIdentityTags(["melodic", "peak", "warm-up", "euphoric"])).toEqual([
      "melodic",
      "euphoric",
    ]);
  });

  it("filters out all DJ-function tags", () => {
    expect(filterIdentityTags(["banger", "opener", "closer"])).toEqual([]);
  });

  it("keeps genre tags, removes DJ tags", () => {
    expect(filterIdentityTags(["techno", "ambient", "tool"])).toEqual(["techno", "ambient"]);
  });

  it("handles null", () => {
    expect(filterIdentityTags(null)).toEqual([]);
  });
});

describe("normalizeCountry", () => {
  it("normalizes country code", () => {
    expect(normalizeCountry("US")).toBe("us");
  });

  it("normalizes country name", () => {
    expect(normalizeCountry("United Kingdom")).toBe("united kingdom");
  });

  it("handles null", () => {
    expect(normalizeCountry(null)).toBe("unknown-country");
  });
});

describe("normalizeLabels", () => {
  it("takes first 3 labels and lowercases", () => {
    expect(
      normalizeLabels(["Warp Records", "Ninja Tune", "XL Recordings", "Domino"])
    ).toEqual(["warp records", "ninja tune", "xl recordings"]);
  });

  it("handles empty array", () => {
    expect(normalizeLabels([])).toEqual([]);
  });

  it("handles string input", () => {
    expect(normalizeLabels("Warp")).toEqual(["warp"]);
  });
});

describe("combineGenres", () => {
  it("uses Discogs genres", () => {
    expect(combineGenres(["Electronic", "House"], null, 8)).toEqual(["electronic", "house"]);
  });

  it("falls back to Apple genre", () => {
    expect(combineGenres(null, "Rock", 8)).toEqual(["rock"]);
  });

  it("limits to maxGenres", () => {
    expect(
      combineGenres(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], null, 8)
    ).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
  });
});

describe("normalizeStyles", () => {
  it("normalizes styles", () => {
    expect(normalizeStyles(["Deep House", "Tech House"], 12)).toEqual([
      "deep house",
      "tech house",
    ]);
  });

  it("limits to maxStyles", () => {
    const manyStyles = Array.from({ length: 15 }, (_, i) => `style${i}`);
    const expected = Array.from({ length: 12 }, (_, i) => `style${i}`);
    expect(normalizeStyles(manyStyles, 12)).toEqual(expected);
  });
});

describe("normalizeLocalTags", () => {
  it("filters DJ tags and normalizes", () => {
    expect(normalizeLocalTags(["melodic", "peak-time", "euphoric", "banger"], 12)).toEqual([
      "melodic",
      "euphoric",
    ]);
  });

  it("limits to maxTags", () => {
    const manyTags = Array.from({ length: 13 }, (_, i) => `tag${i + 1}`);
    expect(normalizeLocalTags(manyTags, 12)).toHaveLength(12);
  });
});

describe("normalizeList", () => {
  it("returns an empty list for a non-string, non-array input", () => {
    // Defensive guard for values that slip past the declared type.
    expect(normalizeList(42 as unknown as string)).toEqual([]);
  });
});

describe("normalizeComposer", () => {
  it.each([null, undefined, ""])("returns an empty list for %s", (input) => {
    expect(normalizeComposer(input)).toEqual([]);
  });

  it("lowercases like every other identity field", () => {
    expect(normalizeComposer("Steve Reich")).toEqual(["steve reich"]);
  });

  it("hashes the same regardless of the casing it arrives in", () => {
    expect(normalizeComposer("STEVE REICH")).toEqual(normalizeComposer("steve reich"));
  });

  it.each([
    ["comma", "Bach, Glass"],
    ["semicolon", "Bach; Glass"],
    ["slash", "Bach / Glass"],
    ["ampersand", "Bach & Glass"],
  ])("splits multiple composers on a %s", (_label, input) => {
    expect(normalizeComposer(input)).toEqual(["bach", "glass"]);
  });

  it("strips punctuation and collapses whitespace", () => {
    expect(normalizeComposer("J.S.  Bach")).toEqual(["js bach"]);
  });

  it("deduplicates repeated credits", () => {
    expect(normalizeComposer("Bach, bach, BACH")).toEqual(["bach"]);
  });

  it.each(["Unknown", "unknown", "Various", "VARIOUS"])(
    "drops the placeholder credit %s",
    (input) => {
      expect(normalizeComposer(input)).toEqual([]);
    }
  );

  it("keeps real composers alongside a dropped placeholder", () => {
    expect(normalizeComposer("Various, Steve Reich")).toEqual(["steve reich"]);
  });

  it("drops empty segments left by trailing delimiters", () => {
    expect(normalizeComposer("Bach,,  & Glass,")).toEqual(["bach", "glass"]);
  });
});

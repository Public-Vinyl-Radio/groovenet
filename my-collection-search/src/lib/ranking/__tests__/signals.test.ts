import { describe, expect, it } from "vitest";
import { RANKING_SIGNAL_IDS } from "@groovenet/contracts";
import { buildGenreOverlapContext } from "@/lib/recommendation-pre-scorer";
import { computeSignals, KEY_RELATION_VALUE, SIGNAL_REGISTRY } from "../signals";
import type { RankingCandidate, RankingTrack } from "../features";

const signal = (
  id: (typeof RANKING_SIGNAL_IDS)[number],
  seed: RankingTrack,
  candidate: RankingCandidate,
  context = buildGenreOverlapContext([], []),
) => computeSignals(seed, candidate, context)[id];

describe("signal registry", () => {
  it("has exactly one entry per signal id, in the contract's order", () => {
    expect(SIGNAL_REGISTRY.map((s) => s.id)).toEqual([...RANKING_SIGNAL_IDS]);
    expect(SIGNAL_REGISTRY.every((s) => s.label.length > 0)).toBe(true);
  });

  it("returns a value for every signal, null on an empty pair", () => {
    const values = computeSignals({}, {});
    expect(Object.keys(values)).toEqual([...RANKING_SIGNAL_IDS]);
    expect(Object.values(values).every((v) => v.value === null)).toBe(true);
  });
});

describe("key_relation", () => {
  it.each([
    ["8A", "8A", 1, "same"],
    ["8A", "9A", 0.5, "adjacent"],
    ["12A", "1A", 0.5, "adjacent"],
    ["8A", "8B", 0.5, "relative"],
    ["C major", "A minor", 0.5, "relative"],
    ["8A", "10A", 0, "clash"],
    ["8A", "9B", 0, "clash"],
  ])("%s → %s is %s (%s)", (a, b, value, detail) => {
    expect(signal("key_relation", { key: a }, { key: b })).toEqual({ value, detail });
  });

  it.each([
    [null, "8A"],
    ["8A", null],
    ["not a key", "8A"],
    ["8A", "H major"],
  ])("is null when a key is missing or unknown (%s, %s)", (a, b) => {
    expect(signal("key_relation", { key: a }, { key: b }).value).toBeNull();
  });

  it("values relative the same as adjacent, as today", () => {
    expect(KEY_RELATION_VALUE.relative).toBe(KEY_RELATION_VALUE.adjacent);
  });
});

describe("bpm_distance", () => {
  it("is 1 at the same tempo and falls with the relative difference", () => {
    expect(signal("bpm_distance", { bpm: "124" }, { bpm: 124 })).toEqual({
      value: 1,
      detail: "124 → 124",
    });
    expect(signal("bpm_distance", { bpm: 100 }, { bpm: "110" }).value).toBeCloseTo(0.9, 10);
    expect(signal("bpm_distance", { bpm: 100 }, { bpm: 90 }).value).toBeCloseTo(0.9, 10);
  });

  it("floors at 0 from double time up (no half/double-time rule exists today)", () => {
    expect(signal("bpm_distance", { bpm: 60 }, { bpm: 120 }).value).toBe(0);
    expect(signal("bpm_distance", { bpm: 60 }, { bpm: 240 }).value).toBe(0);
  });

  it.each([
    [null, 120],
    [120, null],
    ["0", 120],
    [120, 0],
    ["", 120],
    ["fast", 120],
  ])("is null for a missing or zero BPM (%s, %s)", (a, b) => {
    expect(signal("bpm_distance", { bpm: a }, { bpm: b }).value).toBeNull();
  });
});

describe("genre_overlap", () => {
  const house = { id: "house", parentId: "electronic" };
  const techno = { id: "techno", parentId: "electronic" };
  const deep = { id: "deep-house", parentId: "house" };

  it("reuses calculateGenreOverlap", () => {
    expect(signal("genre_overlap", { genres: [house] }, { genres: [house] }).value).toBe(1);
    expect(signal("genre_overlap", { genres: [house] }, { genres: [deep] }).value).toBe(1);
    expect(signal("genre_overlap", { genres: [house] }, { genres: [techno] }).value).toBe(0);
    expect(
      signal("genre_overlap", { genres: [house] }, { genres: [house, techno] }).value,
    ).toBeCloseTo(0.75, 10);
  });

  it("uses the similarity table from the context", () => {
    const context = buildGenreOverlapContext(
      [{ genreId: "house", relatedGenreId: "techno", score: 10 }],
      [],
    );
    expect(
      signal("genre_overlap", { genres: [house] }, { genres: [techno] }, context).value,
    ).toBeCloseTo(0.8, 10);
  });

  it("is null when either side has no genres", () => {
    expect(signal("genre_overlap", { genres: [] }, { genres: [house] }).value).toBeNull();
    expect(signal("genre_overlap", { genres: [house] }, {}).value).toBeNull();
  });
});

describe("era", () => {
  it.each([
    ["1990s", "1990s", 1, "same"],
    ["1990s", "2000s", 0.5, "adjacent"],
    ["1990s", "2010s", 0, "apart"],
    ["1990s", "unknown", 0, "apart"],
  ])("%s → %s is %s", (a, b, value, detail) => {
    expect(signal("era", { eraBucket: a }, { eraBucket: b })).toEqual({ value, detail });
  });

  it("is null when an era is unknown", () => {
    expect(signal("era", { eraBucket: null }, { eraBucket: "1990s" }).value).toBeNull();
    expect(signal("era", { eraBucket: "1990s" }, {}).value).toBeNull();
  });
});

describe.each(["energy", "danceability"] as const)("%s", (id) => {
  it("is 1 minus the distance, clamped to [0, 1]", () => {
    expect(signal(id, { [id]: 0.5 }, { [id]: 0.5 }).value).toBe(1);
    expect(signal(id, { [id]: 0.2 }, { [id]: 0.7 }).value).toBeCloseTo(0.5, 10);
    expect(signal(id, { [id]: 0 }, { [id]: 2 }).value).toBe(0);
  });

  it("is null when either side is unknown, and 0 is a known value", () => {
    expect(signal(id, { [id]: null }, { [id]: 0.5 }).value).toBeNull();
    expect(signal(id, { [id]: 0.5 }, {}).value).toBeNull();
    expect(signal(id, { [id]: 0 }, { [id]: 0 }).value).toBe(1);
  });
});

describe("similarity signals", () => {
  it("pass the candidate's identity and vibe similarity through", () => {
    const values = computeSignals({}, { identity: 0.7, vibe: 0.4 });
    expect(values.identity_similarity.value).toBe(0.7);
    expect(values.vibe_similarity.value).toBe(0.4);
  });

  it("are null without a score, and keep a zero", () => {
    const values = computeSignals({}, { identity: null, vibe: 0 });
    expect(values.identity_similarity.value).toBeNull();
    expect(values.vibe_similarity.value).toBe(0);
  });
});

describe("rating", () => {
  it("is the candidate's stars out of five", () => {
    expect(signal("rating", {}, { rating: 5 }).value).toBe(1);
    expect(signal("rating", {}, { rating: 3 }).value).toBeCloseTo(0.6, 10);
    expect(signal("rating", {}, { rating: 9 }).value).toBe(1);
  });

  it("is null when unrated", () => {
    expect(signal("rating", {}, { rating: 0 }).value).toBeNull();
    expect(signal("rating", {}, { rating: null }).value).toBeNull();
    expect(signal("rating", {}, {}).value).toBeNull();
  });
});

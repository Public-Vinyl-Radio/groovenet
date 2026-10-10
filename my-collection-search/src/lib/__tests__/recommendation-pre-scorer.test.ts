import { describe, it, expect } from "vitest";
import {
  calculateBpmBonus,
  calculateKeyBonus,
  calculateTagBonus,
  calculateGenreOverlap,
  calculateEraBonus,
  calculateEnergyPenalty,
  calculateCamelotDistance,
  calculateJaccardOverlap,
  areErasAdjacent,
  applyConstraintsAndBonuses,
  type SeedTrack,
} from "../recommendation-pre-scorer";
import type { CandidateTrack, GenreRef } from "../recommendation-candidate-retriever";

const HOUSE: GenreRef = { id: "house", parentId: "electronic" };
const TECHNO: GenreRef = { id: "techno", parentId: "electronic" };
const PROGRESSIVE: GenreRef = { id: "progressive-house", parentId: "house" };
const TRANCE: GenreRef = { id: "trance", parentId: "electronic" };
const SALSA: GenreRef = { id: "salsa", parentId: "latin" };

describe("calculateBpmBonus", () => {
  it.each([
    [128, 128, 1.0, 0.06, "same BPM"],
    [128, 129, 1.0, 0.06, "Δ=1"],
    [128, 130, 1.0, 0.04, "Δ=2"],
    [128, 131, 1.0, 0.02, "Δ=3"],
    [128, 132, 1.0, 0.02, "Δ=4"],
    [128, 134, 1.0, 0.01, "Δ=6"],
    [128, 135, 1.0, 0, "Δ=7"],
    [128, 137, 1.0, -0.03, "Δ=9"],
    [128, 140, 1.0, -0.03, "Δ=12"],
    [128, 128, 0.5, 0.03, "0.5 confidence halves bonus"],
    [null, 128, 1.0, 0, "null seed BPM"],
    [128, null, 1.0, 0, "null candidate BPM"],
  ] as const)("%s → %s at confidence %s === %s (%s)", (seed, candidate, confidence, expected, label) => {
    void label;
    expect(calculateBpmBonus(seed, candidate, confidence)).toBeCloseTo(expected, 3);
  });
});

describe("calculateCamelotDistance", () => {
  it("returns 0 for same key", () => {
    expect(calculateCamelotDistance("C Major", "C Major")).toBeCloseTo(0, 3);
  });

  it("returns 0.5 for relative major/minor", () => {
    expect(calculateCamelotDistance("C Major", "A Minor")).toBeCloseTo(0.5, 3);
  });

  it("returns 1 for adjacent same type", () => {
    expect(calculateCamelotDistance("C Major", "G Major")).toBeCloseTo(1, 3);
  });

  it("returns 1.5 for adjacent different type", () => {
    expect(calculateCamelotDistance("C Major", "E Minor")).toBeCloseTo(1.5, 3);
  });

  it("handles wrap-around (12 → 1)", () => {
    expect(calculateCamelotDistance("E Major", "B Major")).toBeCloseTo(1, 3);
  });

  it("returns null for null keys", () => {
    expect(calculateCamelotDistance(null, "C Major")).toBeNull();
    expect(calculateCamelotDistance("C Major", null)).toBeNull();
  });
});

describe("calculateKeyBonus", () => {
  it.each([
    ["C Major", "C Major", 1.0, 0.06, "same key"],
    ["C Major", "G Major", 1.0, 0.04, "adjacent key"],
    ["C Major", "A Minor", 1.0, 0.03, "relative major/minor"],
    ["C Major", "C Major", 0.5, 0.03, "0.5 confidence halves bonus"],
  ] as const)("%s → %s at confidence %s === %s (%s)", (seed, candidate, confidence, expected, label) => {
    void label;
    expect(calculateKeyBonus(seed, candidate, confidence)).toBeCloseTo(expected, 3);
  });
});

describe("calculateJaccardOverlap", () => {
  it.each([
    [["a", "b", "c"], ["a", "b", "c"], 1.0, "perfect overlap"],
    [["a", "b"], ["c", "d"], 0.0, "no overlap"],
    [["a", "b", "c"], ["a", "b", "d"], 0.5, "partial overlap"],
    [["A", "B"], ["a", "b"], 1.0, "case insensitive"],
    [[], [], 0.0, "empty arrays"],
    [["a"], [], 0.0, "one empty array"],
  ] as const)("%s ∩ %s === %s (%s)", (a, b, expected, label) => {
    void label;
    expect(calculateJaccardOverlap([...a], [...b])).toBeCloseTo(expected, 3);
  });
});

describe("calculateGenreOverlap", () => {
  it("returns 1 for identical genre sets", () => {
    expect(calculateGenreOverlap([HOUSE], [HOUSE])).toBeCloseTo(1, 3);
  });

  it("returns 0 for genres from unrelated taxonomy branches", () => {
    expect(calculateGenreOverlap([HOUSE], [SALSA])).toBe(0);
  });

  it("returns 0 for two empty genre lists", () => {
    expect(calculateGenreOverlap([], [])).toBe(0);
  });

  it("treats a genre and its child as overlapping, not disjoint (#486)", () => {
    // PROGRESSIVE's parent is house; its own id never appears on the seed side.
    expect(calculateGenreOverlap([HOUSE], [PROGRESSIVE])).toBeGreaterThan(0);
  });

  it("gives a parent/child pair partial credit, short of a direct match", () => {
    const parentChild = calculateGenreOverlap([HOUSE], [PROGRESSIVE]);
    const directMatch = calculateGenreOverlap([HOUSE], [HOUSE]);
    expect(parentChild).toBeLessThan(directMatch);
  });

  it("gives siblings under the same parent partial credit via the shared parent", () => {
    // HOUSE and TECHNO are both children of "electronic".
    expect(calculateGenreOverlap([HOUSE], [TECHNO])).toBeGreaterThan(0);
  });
});

describe("calculateTagBonus", () => {
  it("computes 0.08 * the hierarchy-aware genre-id jaccard overlap", () => {
    // Seed expands to {house, electronic, techno}; candidate to {house, electronic, trance}.
    // Intersection: 2 (house, electronic), Union: 4, Jaccard: 0.5, Bonus: 0.08 * 0.5 = 0.04
    expect(calculateTagBonus([HOUSE, TECHNO], [HOUSE, TRANCE])).toBeCloseTo(0.04, 3);
  });
});

describe("areErasAdjacent", () => {
  it.each([
    ["1990s", "1990s", false, "same era is not adjacent"],
    ["1990s", "2000s", true, "1990s and 2000s"],
    ["2000s", "1990s", true, "reverse"],
    ["1980s", "1990s", true, "1980s and 1990s"],
    ["1980s", "2000s", false, "non-adjacent"],
    ["1990s", "2010s", false, "two decades apart"],
    ["pre-1950s", "1950s", true, "pre-1950s and 1950s"],
    ["2010s", "2020s", true, "2010s and 2020s"],
    [null, "1990s", false, "null era"],
    ["1990s", null, false, "null era"],
    ["invalid", "1990s", false, "invalid era"],
  ] as const)("areErasAdjacent(%s, %s) === %s (%s)", (a, b, expected, label) => {
    void label;
    expect(areErasAdjacent(a, b)).toBe(expected);
  });
});

describe("calculateEraBonus", () => {
  it.each([
    ["1990s", "1990s", 0.02, "same era"],
    ["1990s", "2000s", 0.01, "adjacent era"],
    ["1990s", "2010s", 0.0, "non-adjacent era"],
  ] as const)("calculateEraBonus(%s, %s) === %s (%s)", (a, b, expected, label) => {
    void label;
    expect(calculateEraBonus(a, b)).toBeCloseTo(expected, 3);
  });
});

describe("calculateEnergyPenalty", () => {
  it.each([
    [0.5, 0.5, 0, "same energy"],
    [0.5, 0.8, 0, "Δ=0.3"],
    [0.5, 0.85, 0, "Δ=0.35 at threshold"],
    [0.5, 0.95, 0.006, "Δ=0.45"],
    [0.2, 1.0, 0.027, "Δ=0.8"],
    [null, 0.5, 0, "null seed energy"],
    [0.5, null, 0, "null candidate energy"],
  ] as const)("calculateEnergyPenalty(%s, %s) ≈ %s (%s)", (seed, candidate, expected, label) => {
    void label;
    expect(calculateEnergyPenalty(seed, candidate)).toBeCloseTo(expected, 3);
  });
});

// ─── Shared fixtures ──────────────────────────────────────────────────────────

function makeSeed(overrides: Partial<SeedTrack> = {}): SeedTrack {
  return {
    bpm: 128,
    key: "C Major",
    eraBucket: "1990s",
    genres: [HOUSE, TECHNO],
    energy: 0.7,
    danceability: 0.8,
    ...overrides,
  };
}

function makeCandidate(
  trackId: string,
  overrides: Partial<CandidateTrack["metadata"]> = {}
): CandidateTrack {
  return {
    trackId,
    friendId: 1,
    simIdentity: 0.9,
    simAudio: 0.85,
    metadata: {
      bpm: 129,
      key: "G Major",
      keyConfidence: 1.0,
      tempoConfidence: 1.0,
      eraBucket: "1990s",
      tags: [],
      genreRefs: [HOUSE],
      styles: ["progressive"],
      energy: 0.75,
      danceability: 0.8,
      title: "Track",
      artist: "Artist",
      album: "Album",
      albumThumbnail: null,
      year: "1995",
      genres: ["Electronic"],
      starRating: 5,
      moodHappy: 0.5,
      moodSad: 0.2,
      moodRelaxed: 0.3,
      moodAggressive: 0.4,
      ...overrides,
    },
  };
}

describe("applyConstraintsAndBonuses — strict mode", () => {
  const seed = makeSeed();

  it("keeps only candidates that pass all strict constraints", () => {
    const candidates = [
      makeCandidate("good"),
      makeCandidate("bad-bpm", { bpm: 133 }), // Δ=5, rejected
      makeCandidate("bad-key", { key: "F# Major" }), // distance > 1, rejected
      makeCandidate("bad-tag", { genreRefs: [SALSA] }), // unrelated taxonomy branch, no overlap, rejected
    ];

    const scored = applyConstraintsAndBonuses(seed, candidates, "strict");
    expect(scored).toHaveLength(1);
    expect(scored[0].trackId).toBe("good");
  });
});

describe("applyConstraintsAndBonuses — mixable mode", () => {
  const seed = makeSeed({ genres: [] });

  it("accepts wider BPM range than strict", () => {
    const candidates = [
      makeCandidate("good", { bpm: 134, key: "D Major" }), // Δ=6, passes
      makeCandidate("bad-bpm", { bpm: 135, key: "D Major" }), // Δ=7, rejected
    ];
    const scored = applyConstraintsAndBonuses(seed, candidates, "mixable");
    expect(scored).toHaveLength(1);
    expect(scored[0].trackId).toBe("good");
  });
});

describe("applyConstraintsAndBonuses — blend mode", () => {
  const seed = makeSeed({ genres: [] });

  it("accepts the widest BPM range", () => {
    const candidates = [
      makeCandidate("good", { bpm: 140, key: "F# Major", eraBucket: "2010s", energy: 0.5 }), // Δ=12, passes
      makeCandidate("bad-bpm", { bpm: 141, key: "F# Major", eraBucket: "2010s", energy: 0.5 }), // Δ=13, rejected
    ];
    const scored = applyConstraintsAndBonuses(seed, candidates, "blend");
    expect(scored).toHaveLength(1);
    expect(scored[0].trackId).toBe("good");
  });
});

describe("applyConstraintsAndBonuses — bonus computation", () => {
  it("computes correct bonuses for a perfect match", () => {
    const seed = makeSeed();
    const candidate = makeCandidate("perfect", {
      bpm: 128,
      key: "C Major",
      eraBucket: "1990s",
      genreRefs: [HOUSE, TECHNO],
      energy: 0.7,
    });

    const [scored] = applyConstraintsAndBonuses(seed, [candidate], "blend");
    expect(scored.bonuses.bpmBonus).toBeCloseTo(0.06, 3);
    expect(scored.bonuses.keyBonus).toBeCloseTo(0.06, 3);
    expect(scored.bonuses.eraBonus).toBeCloseTo(0.02, 3);
    expect(scored.bonuses.tagBonus).toBeCloseTo(0.08, 3);
    expect(scored.penalties.energyPenalty).toBeCloseTo(0, 3);
  });
});

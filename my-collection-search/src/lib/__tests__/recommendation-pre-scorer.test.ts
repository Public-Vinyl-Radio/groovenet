import { describe, it, expect } from "vitest";
import {
  calculateGenreOverlap,
  calculateCamelotDistance,
  buildGenreOverlapContext,
  GENRE_SIMILARITY_MAX_SCORE,
  RELATED_GENRE_MAX_CREDIT,
  areErasAdjacent,
} from "../recommendation-pre-scorer";
import type { GenreRef } from "../recommendation-candidate-retriever";

const HOUSE: GenreRef = { id: "house", parentId: "electronic" };
const TECHNO: GenreRef = { id: "techno", parentId: "electronic" };
const SALSA: GenreRef = { id: "salsa", parentId: "latin" };

describe("calculateCamelotDistance, stored key spellings (#1211)", () => {
  it("ignores case", () => {
    expect(calculateCamelotDistance("C major", "C Major")).toBe(0);
    expect(calculateCamelotDistance("c MAJOR", "a minor")).toBe(0.5);
  });

  it("reads sharps and flats, and enharmonics as the same key", () => {
    expect(calculateCamelotDistance("F# minor", "F# minor")).toBe(0);
    expect(calculateCamelotDistance("Ab minor", "G# minor")).toBe(0);
    expect(calculateCamelotDistance("Bb major", "F major")).toBe(1);
    // Db major is 3B, not 1B.
    expect(calculateCamelotDistance("Db major", "C# major")).toBe(0);
    expect(calculateCamelotDistance("Db major", "Ab major")).toBe(1);
    expect(calculateCamelotDistance("Db major", "B major")).toBe(2);
  });

  it("counts relative major/minor as 0.5 and a mode change as +0.5", () => {
    expect(calculateCamelotDistance("C major", "A minor")).toBe(0.5);
    expect(calculateCamelotDistance("C major", "E minor")).toBe(1.5);
    expect(calculateCamelotDistance("C major", "A major")).toBe(3);
  });

  it("reads Camelot codes too", () => {
    expect(calculateCamelotDistance("8B", "8A")).toBe(0.5);
  });

  it("is null for an unknown key on either side", () => {
    expect(calculateCamelotDistance("H major", "C major")).toBeNull();
    expect(calculateCamelotDistance("C major", "nonsense")).toBeNull();
    expect(calculateCamelotDistance("", "C major")).toBeNull();
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

// Latin
//  ├─ Cumbia ─ Digital Cumbia
//  ├─ Chicha (related to Cumbia: sibling + co-occurrence)
//  ├─ Porro  (related to Cumbia: sibling only)
//  └─ Salsa  (sibling, but not in Cumbia's stored top N)
// Rock (unrelated root)
const LATIN: GenreRef = { id: "latin", parentId: null };
const CUMBIA: GenreRef = { id: "cumbia", parentId: "latin" };
const DIGITAL_CUMBIA: GenreRef = { id: "digital-cumbia", parentId: "cumbia" };
const CHICHA: GenreRef = { id: "chicha", parentId: "latin" };
const PORRO: GenreRef = { id: "porro", parentId: "latin" };
const ROCK: GenreRef = { id: "rock", parentId: null };

const LATIN_CONTEXT = buildGenreOverlapContext(
  [
    { genreId: "cumbia", relatedGenreId: "chicha", score: 1.6 },
    { genreId: "chicha", relatedGenreId: "cumbia", score: 1.6 },
    { genreId: "porro", relatedGenreId: "cumbia", score: 1 }, // kept on Porro's side only
    { genreId: "house", relatedGenreId: "techno", score: 1 },
  ],
  [LATIN, CUMBIA, DIGITAL_CUMBIA, CHICHA, PORRO, SALSA, ROCK].map(({ id, parentId }) => ({
    id,
    parentId,
  })),
);

describe("calculateGenreOverlap", () => {
  it("returns 1 for identical genre sets", () => {
    expect(calculateGenreOverlap([HOUSE, TECHNO], [TECHNO, HOUSE], LATIN_CONTEXT)).toBe(1);
  });

  it("returns 0 for genres from unrelated taxonomy branches", () => {
    expect(calculateGenreOverlap([CUMBIA], [ROCK], LATIN_CONTEXT)).toBe(0);
  });

  it("returns 0 when either side has no genres", () => {
    expect(calculateGenreOverlap([], [], LATIN_CONTEXT)).toBe(0);
    expect(calculateGenreOverlap([CUMBIA], [], LATIN_CONTEXT)).toBe(0);
  });

  it("counts a parent/child pair as a full match", () => {
    expect(calculateGenreOverlap([CUMBIA], [DIGITAL_CUMBIA])).toBe(1);
    expect(calculateGenreOverlap([DIGITAL_CUMBIA], [CUMBIA])).toBe(1);
  });

  it("counts a grandparent as a full match through the loaded taxonomy", () => {
    expect(calculateGenreOverlap([LATIN], [DIGITAL_CUMBIA], LATIN_CONTEXT)).toBe(1);
  });

  it("gives a related-only pair the scaled similarity score, short of a full match", () => {
    const expected = RELATED_GENRE_MAX_CREDIT * (1.6 / GENRE_SIMILARITY_MAX_SCORE);
    expect(calculateGenreOverlap([CUMBIA], [CHICHA], LATIN_CONTEXT)).toBeCloseTo(expected, 6);
    expect(expected).toBeLessThan(1);
  });

  it("reads a pair stored on one side only, from either direction", () => {
    const expected = RELATED_GENRE_MAX_CREDIT * (1 / GENRE_SIMILARITY_MAX_SCORE);
    expect(calculateGenreOverlap([CUMBIA], [PORRO], LATIN_CONTEXT)).toBeCloseTo(expected, 6);
    expect(calculateGenreOverlap([PORRO], [CUMBIA], LATIN_CONTEXT)).toBeCloseTo(expected, 6);
  });

  it("gives siblings no credit without a similarity row", () => {
    expect(calculateGenreOverlap([CUMBIA], [SALSA], LATIN_CONTEXT)).toBe(0);
    expect(calculateGenreOverlap([HOUSE], [TECHNO])).toBe(0);
  });

  it("averages the best match in both directions", () => {
    // Seed → candidate: cumbia matches cumbia (1). Candidate → seed: cumbia 1, rock 0 → 0.5.
    expect(calculateGenreOverlap([CUMBIA], [CUMBIA, ROCK], LATIN_CONTEXT)).toBeCloseTo(0.75, 6);
  });

  it("caps an out-of-range stored score at the related-genre credit", () => {
    const context = buildGenreOverlapContext(
      [{ genreId: "a", relatedGenreId: "b", score: 99 }],
      [],
    );
    const a = { id: "a", parentId: null };
    const b = { id: "b", parentId: null };
    expect(calculateGenreOverlap([a], [b], context)).toBeCloseTo(RELATED_GENRE_MAX_CREDIT, 6);
  });

  it("ignores self pairs and non-positive scores", () => {
    const context = buildGenreOverlapContext(
      [
        { genreId: "a", relatedGenreId: "a", score: 1 },
        { genreId: "a", relatedGenreId: "b", score: 0 },
      ],
      [],
    );
    expect(context.similarity.size).toBe(1);
    expect(
      calculateGenreOverlap([{ id: "a", parentId: null }], [{ id: "b", parentId: null }], context),
    ).toBe(0);
  });

  it("stops walking a (forbidden) parent cycle instead of looping", () => {
    const context = buildGenreOverlapContext(
      [],
      [
        { id: "x", parentId: "y" },
        { id: "y", parentId: "x" },
      ],
    );
    expect(calculateGenreOverlap([{ id: "x", parentId: "y" }], [ROCK], context)).toBe(0);
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

import { describe, it, expect } from "vitest";
import {
  calculateGenreOverlap,
  camelotCodeDistance,
  buildGenreOverlapContext,
  GENRE_SIMILARITY_MAX_SCORE,
  RELATED_GENRE_MAX_CREDIT,
  areErasAdjacent,
} from "../recommendation-pre-scorer";
import type { GenreRef } from "../recommendation-candidate-retriever";

const HOUSE: GenreRef = { id: "house", parentId: "electronic" };
const TECHNO: GenreRef = { id: "techno", parentId: "electronic" };
const SALSA: GenreRef = { id: "salsa", parentId: "latin" };

describe("camelotCodeDistance", () => {
  it.each([
    ["8B", "8B", 0],
    ["8B", "8A", 0.5],
    ["8B", "9B", 1],
    ["8B", "9A", 1.5],
    ["12B", "1B", 1],
    ["8B", "11B", 3],
  ])("%s to %s is %s", (a, b, expected) => {
    expect(camelotCodeDistance(a, b)).toBe(expected);
  });

  it("is null for a missing or invalid code on either side", () => {
    expect(camelotCodeDistance(null, "8B")).toBeNull();
    expect(camelotCodeDistance("8B", null)).toBeNull();
    expect(camelotCodeDistance("", "8B")).toBeNull();
    expect(camelotCodeDistance("H major", "8B")).toBeNull();
  });
});

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

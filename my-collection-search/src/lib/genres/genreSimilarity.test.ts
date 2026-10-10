import { describe, expect, it } from "vitest";
import { computeGenreSimilarity, npmi, type GenreCoOccurrence, type GenreSimilarityTaxonomyNode } from "./genreSimilarity";

// Latin
//  ├─ Cumbia
//  │   └─ Psychedelic Cumbia
//  └─ Salsa
// Rock (unrelated root)
const LATIN = "latin";
const CUMBIA = "cumbia";
const PSYCH_CUMBIA = "psych-cumbia";
const SALSA = "salsa";
const ROCK = "rock";

const genres: GenreSimilarityTaxonomyNode[] = [
  { id: LATIN, parentId: null },
  { id: CUMBIA, parentId: LATIN },
  { id: PSYCH_CUMBIA, parentId: CUMBIA },
  { id: SALSA, parentId: LATIN },
  { id: ROCK, parentId: null },
];

function related(entries: ReturnType<typeof computeGenreSimilarity>, genreId: string) {
  return entries.filter((e) => e.genre_id === genreId);
}

describe("npmi", () => {
  it("is 0 when either genre, the pair, or the total is absent", () => {
    expect(npmi(0, 10, 10, 100)).toBe(0);
    expect(npmi(5, 0, 10, 100)).toBe(0);
    expect(npmi(5, 10, 0, 100)).toBe(0);
    expect(npmi(5, 10, 10, 0)).toBe(0);
  });

  it("matches the hand-computed value for a simple fixture", () => {
    // pA = pB = 0.1, pAB = 0.05; pmi = ln(0.05 / 0.01) = ln(5); npmi = pmi / -ln(0.05)
    const expected = Math.log(5) / -Math.log(0.05);
    expect(npmi(5, 10, 10, 100)).toBeCloseTo(expected, 10);
  });

  it("is 1 when the two genres are perfectly coupled (identical album sets)", () => {
    expect(npmi(10, 10, 10, 100)).toBeCloseTo(1, 10);
  });

  it("is 0, not NaN, when every album carries both (no information either way)", () => {
    // p(A,B) = 1 forces p(A) = p(B) = 1 too, so -log(p(A,B)) = 0; the guard
    // against dividing by that returns 0 instead of NaN or +Infinity.
    expect(npmi(100, 100, 100, 100)).toBe(0);
  });
});

describe("computeGenreSimilarity", () => {
  it("scores siblings with the fixed sibling base, symmetrically", () => {
    const entries = computeGenreSimilarity(genres, [], new Map(), 0);

    const cumbiaToSalsa = related(entries, CUMBIA).find((e) => e.related_genre_id === SALSA);
    const salsaToCumbia = related(entries, SALSA).find((e) => e.related_genre_id === CUMBIA);
    expect(cumbiaToSalsa).toMatchObject({ score: 1, signals: { taxonomy: "sibling" } });
    expect(salsaToCumbia).toMatchObject({ score: 1, signals: { taxonomy: "sibling" } });
  });

  it("scores a direct parent/child pair lower than siblings, labelled from each side", () => {
    const entries = computeGenreSimilarity(genres, [], new Map(), 0);

    const childToParent = related(entries, CUMBIA).find((e) => e.related_genre_id === LATIN);
    const parentToChild = related(entries, LATIN).find((e) => e.related_genre_id === CUMBIA);
    expect(childToParent).toMatchObject({ score: 0.5, signals: { taxonomy: "parent" } });
    expect(parentToChild).toMatchObject({ score: 0.5, signals: { taxonomy: "child" } });
  });

  it("labels a direct parent/child pair the same way regardless of which one is listed first", () => {
    // The child listed before its parent, unlike every other fixture here.
    const reordered: GenreSimilarityTaxonomyNode[] = [
      { id: CUMBIA, parentId: LATIN },
      { id: LATIN, parentId: null },
    ];
    const entries = computeGenreSimilarity(reordered, [], new Map(), 0);

    const childToParent = related(entries, CUMBIA).find((e) => e.related_genre_id === LATIN);
    const parentToChild = related(entries, LATIN).find((e) => e.related_genre_id === CUMBIA);
    expect(childToParent).toMatchObject({ score: 0.5, signals: { taxonomy: "parent" } });
    expect(parentToChild).toMatchObject({ score: 0.5, signals: { taxonomy: "child" } });
  });

  it("never scores unrelated genres with no shared taxonomy and no co-occurrence", () => {
    const entries = computeGenreSimilarity(genres, [], new Map(), 0);
    expect(related(entries, ROCK)).toEqual([]);
    expect(related(entries, LATIN).find((e) => e.related_genre_id === ROCK)).toBeUndefined();
  });

  it("leaves out an ancestor/descendant pair's co-occurrence, however much they overlap", () => {
    // Latin and Psychedelic Cumbia are two levels apart: no taxonomy base,
    // and the heavy overlap below must not produce a score either.
    const coOccurrences: GenreCoOccurrence[] = [{ genreIdA: LATIN, genreIdB: PSYCH_CUMBIA, sharedAlbums: 50 }];
    const albumCounts = new Map([[LATIN, 80], [PSYCH_CUMBIA, 50]]);
    const entries = computeGenreSimilarity(genres, coOccurrences, albumCounts, 100);

    expect(related(entries, LATIN).find((e) => e.related_genre_id === PSYCH_CUMBIA)).toBeUndefined();
    expect(related(entries, PSYCH_CUMBIA).find((e) => e.related_genre_id === LATIN)).toBeUndefined();
  });

  it("still scores a direct parent/child pair on taxonomy even though co-occurrence is excluded", () => {
    const coOccurrences: GenreCoOccurrence[] = [{ genreIdA: LATIN, genreIdB: CUMBIA, sharedAlbums: 50 }];
    const albumCounts = new Map([[LATIN, 80], [CUMBIA, 50]]);
    const entries = computeGenreSimilarity(genres, coOccurrences, albumCounts, 100);

    const entry = related(entries, CUMBIA).find((e) => e.related_genre_id === LATIN);
    expect(entry).toMatchObject({ score: 0.5, signals: { taxonomy: "parent" } });
    expect(entry?.signals.npmi).toBeUndefined();
    expect(entry?.signals.shared_albums).toBeUndefined();
  });

  it("drops a non-taxonomy pair below the minimum support", () => {
    // Salsa and Rock share no taxonomy relation; 2 shared albums is below
    // the default minimum of 3.
    const coOccurrences: GenreCoOccurrence[] = [{ genreIdA: SALSA, genreIdB: ROCK, sharedAlbums: 2 }];
    const albumCounts = new Map([[SALSA, 20], [ROCK, 20]]);
    const entries = computeGenreSimilarity(genres, coOccurrences, albumCounts, 100);

    expect(related(entries, SALSA).find((e) => e.related_genre_id === ROCK)).toBeUndefined();
  });

  it("scores a non-taxonomy pair that meets the minimum support, with signals that explain it", () => {
    const coOccurrences: GenreCoOccurrence[] = [{ genreIdA: SALSA, genreIdB: ROCK, sharedAlbums: 5 }];
    const albumCounts = new Map([[SALSA, 10], [ROCK, 10]]);
    const entries = computeGenreSimilarity(genres, coOccurrences, albumCounts, 100);
    const expectedNpmi = npmi(5, 10, 10, 100);

    const entry = related(entries, SALSA).find((e) => e.related_genre_id === ROCK);
    expect(entry).toMatchObject({ score: expectedNpmi, signals: { npmi: expectedNpmi, shared_albums: 5 } });
    expect(entry?.signals.taxonomy).toBeUndefined();
  });

  it("respects a custom minimum support setting", () => {
    const coOccurrences: GenreCoOccurrence[] = [{ genreIdA: SALSA, genreIdB: ROCK, sharedAlbums: 5 }];
    const albumCounts = new Map([[SALSA, 10], [ROCK, 10]]);
    const entries = computeGenreSimilarity(genres, coOccurrences, albumCounts, 100, { minSupportAlbums: 6 });

    expect(related(entries, SALSA).find((e) => e.related_genre_id === ROCK)).toBeUndefined();
  });

  it("combines taxonomy and co-occurrence for a sibling pair that also co-occurs", () => {
    const coOccurrences: GenreCoOccurrence[] = [{ genreIdA: CUMBIA, genreIdB: SALSA, sharedAlbums: 5 }];
    const albumCounts = new Map([[CUMBIA, 10], [SALSA, 10]]);
    const entries = computeGenreSimilarity(genres, coOccurrences, albumCounts, 100);
    const expectedNpmi = npmi(5, 10, 10, 100);

    const entry = related(entries, CUMBIA).find((e) => e.related_genre_id === SALSA);
    expect(entry?.score).toBeCloseTo(1 + expectedNpmi, 10);
    expect(entry?.signals).toMatchObject({ taxonomy: "sibling", npmi: expectedNpmi, shared_albums: 5 });
  });

  it("weights taxonomy and co-occurrence independently", () => {
    const coOccurrences: GenreCoOccurrence[] = [{ genreIdA: CUMBIA, genreIdB: SALSA, sharedAlbums: 5 }];
    const albumCounts = new Map([[CUMBIA, 10], [SALSA, 10]]);
    const expectedNpmi = npmi(5, 10, 10, 100);

    const entries = computeGenreSimilarity(genres, coOccurrences, albumCounts, 100, {
      weights: { taxonomyWeight: 2, coOccurrenceWeight: 0.5 },
    });

    const entry = related(entries, CUMBIA).find((e) => e.related_genre_id === SALSA);
    expect(entry?.score).toBeCloseTo(2 * 1 + 0.5 * expectedNpmi, 10);
  });

  it("never contributes a negative npmi, only floors it at zero", () => {
    // A pair that co-occurs less than chance would predict: negative pmi.
    const coOccurrences: GenreCoOccurrence[] = [{ genreIdA: SALSA, genreIdB: ROCK, sharedAlbums: 3 }];
    const albumCounts = new Map([[SALSA, 50], [ROCK, 50]]);
    const entries = computeGenreSimilarity(genres, coOccurrences, albumCounts, 100);

    // npmi(3, 50, 50, 100) is negative (far less overlap than independence predicts).
    expect(npmi(3, 50, 50, 100)).toBeLessThan(0);
    expect(related(entries, SALSA).find((e) => e.related_genre_id === ROCK)).toBeUndefined();
  });

  it("ignores a malformed self-pair in the co-occurrence input", () => {
    const coOccurrences: GenreCoOccurrence[] = [{ genreIdA: SALSA, genreIdB: SALSA, sharedAlbums: 10 }];
    const entries = computeGenreSimilarity(genres, coOccurrences, new Map([[SALSA, 10]]), 10);
    expect(related(entries, SALSA).find((e) => e.related_genre_id === SALSA)).toBeUndefined();
  });

  it("treats a genre missing from albumCounts as having no albums, scoring no co-occurrence", () => {
    const coOccurrences: GenreCoOccurrence[] = [{ genreIdA: SALSA, genreIdB: ROCK, sharedAlbums: 5 }];
    // Rock has no entry in albumCounts at all.
    const entries = computeGenreSimilarity(genres, coOccurrences, new Map([[SALSA, 10]]), 100);
    expect(related(entries, SALSA).find((e) => e.related_genre_id === ROCK)).toBeUndefined();
  });

  it("treats the lower-indexed genre of a pair missing from albumCounts the same way", () => {
    const coOccurrences: GenreCoOccurrence[] = [{ genreIdA: CUMBIA, genreIdB: ROCK, sharedAlbums: 5 }];
    // Cumbia, not Rock, has no entry in albumCounts this time.
    const entries = computeGenreSimilarity(genres, coOccurrences, new Map([[ROCK, 10]]), 100);
    expect(related(entries, CUMBIA).find((e) => e.related_genre_id === ROCK)).toBeUndefined();
  });

  it("keeps only the top N per genre, breaking ties by id", () => {
    const manyGenres: GenreSimilarityTaxonomyNode[] = [
      { id: "p", parentId: null },
      ...Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, parentId: "p" })),
    ];
    const entries = computeGenreSimilarity(manyGenres, [], new Map(), 0, { topN: 2 });

    const forP = related(entries, "p");
    expect(forP).toHaveLength(2);
    expect(forP.map((e) => e.related_genre_id)).toEqual(["c0", "c1"]);
  });
});

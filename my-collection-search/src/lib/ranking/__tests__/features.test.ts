import { describe, expect, it } from "vitest";
import {
  calculateEnergy,
  computeEraBucket,
  rankingCandidateFromTrack,
  rankingTrackFromMetadata,
  rankingTrackFromTrack,
} from "../features";

describe("computeEraBucket", () => {
  it.each([
    ["2024", "2020s"],
    ["2015", "2010s"],
    ["2000", "2000s"],
    ["1995", "1990s"],
    ["1984", "1980s"],
    ["1977", "1970s"],
    ["1969", "1960s"],
    ["1950", "1950s"],
    ["1932", "pre-1950s"],
    ["1899", null],
    ["unknown", null],
    [null, null],
    ["", null],
  ])("%s → %s", (year, bucket) => {
    expect(computeEraBucket(year)).toBe(bucket);
  });
});

describe("calculateEnergy", () => {
  it("blends danceability and aggression, defaulting the missing one to 0.5", () => {
    expect(calculateEnergy(1, 0)).toBeCloseTo(0.6, 10);
    expect(calculateEnergy(null, 1)).toBeCloseTo(0.7, 10);
    expect(calculateEnergy(0, null)).toBeCloseTo(0.2, 10);
    expect(calculateEnergy(null, null)).toBeNull();
  });
});

describe("rankingTrackFromTrack", () => {
  it("maps a browser track's fields", () => {
    expect(
      rankingTrackFromTrack({
        bpm: "124",
        key: "8A",
        year: 1995,
        star_rating: 4,
        danceability: "0.5",
        mood_aggressive: 0.5,
        track_genres: [
          { id: "g", name: "House", slug: "house", parent_id: "p", parent_name: "Electronic" },
        ],
      }),
    ).toEqual({
      bpm: "124",
      key: "8A",
      eraBucket: "1990s",
      genres: [{ id: "g", parentId: "p" }],
      energy: 0.5,
      danceability: 0.5,
      rating: 4,
    });
  });

  it("treats missing and unparseable values as unknown", () => {
    expect(
      rankingTrackFromTrack({ bpm: null, key: null, year: "", danceability: "n/a" } as never),
    ).toEqual({
      bpm: null,
      key: null,
      eraBucket: null,
      genres: [],
      energy: null,
      danceability: null,
      rating: null,
    });
    expect(rankingTrackFromTrack({ year: null } as never).eraBucket).toBeNull();
    expect(rankingTrackFromTrack({ danceability: 0.25 } as never).danceability).toBe(0.25);
  });
});

describe("rankingCandidateFromTrack", () => {
  it("carries the similarities and the first precomputed score", () => {
    const base = { bpm: "1", key: null, year: "2000" } as const;
    expect(rankingCandidateFromTrack({ ...base, _simIdentity: 0.4, _simAudio: 0.6 })).toMatchObject(
      { identity: 0.4, vibe: 0.6, prior: null },
    );
    expect(rankingCandidateFromTrack({ ...base, _score: 0.2, _semanticScore: 0.9 }).prior).toBe(
      0.2,
    );
    expect(rankingCandidateFromTrack({ ...base, _semanticScore: 0.9 })).toMatchObject({
      identity: null,
      vibe: null,
      prior: 0.9,
    });
  });
});

describe("rankingTrackFromMetadata", () => {
  it("maps server candidate metadata", () => {
    expect(
      rankingTrackFromMetadata({
        bpm: 120,
        key: "C major",
        eraBucket: "1980s",
        genreRefs: [{ id: "g", parentId: null }],
        energy: 0.3,
        danceability: 0.4,
        starRating: 2,
      }),
    ).toEqual({
      bpm: 120,
      key: "C major",
      eraBucket: "1980s",
      genres: [{ id: "g", parentId: null }],
      energy: 0.3,
      danceability: 0.4,
      rating: 2,
    });
  });
});

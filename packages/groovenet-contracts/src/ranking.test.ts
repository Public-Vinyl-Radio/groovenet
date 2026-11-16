import { describe, expect, it } from "vitest";
import {
  candidateRankingSchema,
  RANKING_SIGNAL_IDS,
  rankingConfigSchema,
  rankingSignalIdSchema,
} from "./ranking.js";
import {
  recommendationCandidateSchema,
  recommendationsBatchBodySchema,
  recommendationsQuerySchema,
  recommendationsResponseSchema,
} from "./recommendations.js";

describe("ranking config", () => {
  it("parses a minimal config with defaults", () => {
    expect(rankingConfigSchema.parse({ version: 2, id: "mine", weights: { rating: 0.1 } })).toEqual(
      { version: 2, id: "mine", weights: { rating: 0.1 }, usePrior: false, constraints: {} },
    );
  });

  it("accepts every constraint and a max base", () => {
    const config = {
      version: 2,
      id: "full",
      weights: { identity_similarity: 1, vibe_similarity: 1, key_relation: 0.02 },
      base: { combine: "max", signals: ["identity_similarity", "vibe_similarity"] },
      usePrior: true,
      constraints: {
        bpm_window: { unit: "ratio", max: 0.06 },
        key_rule: { metric: "wheel", max: 1 },
        genre_floor: { min: 0.05 },
      },
    };
    expect(rankingConfigSchema.parse(config)).toEqual(config);
  });

  it.each([
    { version: 2, id: "", weights: {} },
    { version: 2, id: "x", weights: { unknown_signal: 1 } },
    { version: 2, id: "x", weights: { rating: 100 } },
    { version: 2, id: "x", weights: {}, extra: true },
    { version: 3, id: "x", weights: {} },
  ])("rejects an invalid config %#", (config) => {
    expect(rankingConfigSchema.safeParse(config).success).toBe(false);
  });

  it("keeps signal ids stable", () => {
    expect(rankingSignalIdSchema.options).toEqual([...RANKING_SIGNAL_IDS]);
  });
});

describe("recommendations with a ranking breakdown", () => {
  const ranking = {
    score: 0.83,
    passed: false,
    failed: ["bpm_window"],
    prior: null,
    signals: {
      vibe_similarity: { value: 0.8, weight: 1, contribution: 0.8 },
      key_relation: { value: 1, weight: 0.02, contribution: 0.02, detail: "same" },
    },
  };
  const candidate = {
    trackId: "t",
    friendId: 1,
    simIdentity: null,
    simAudio: 0.8,
    metadata: {
      bpm: 124,
      key: "8A",
      keyConfidence: null,
      tempoConfidence: null,
      eraBucket: null,
      tags: [],
      genreRefs: [],
      styles: [],
      energy: null,
      danceability: null,
      title: "T",
      artist: "A",
      album: "B",
      year: null,
      genres: [],
      starRating: null,
      albumThumbnail: null,
      moodHappy: null,
      moodSad: null,
      moodRelaxed: null,
      moodAggressive: null,
    },
  };

  it("keeps a candidate without a ranking valid", () => {
    expect(recommendationCandidateSchema.parse(candidate)).not.toHaveProperty("ranking");
  });

  it("carries a candidate's ranking and the response's ranking summary", () => {
    expect(candidateRankingSchema.parse(ranking)).toEqual(ranking);
    const response = recommendationsResponseSchema.parse({
      seedTrackId: "s",
      seedFriendId: 1,
      seedEmbeddings: { identity: true, audio: true },
      scope: "library",
      libraryFriendId: 1,
      candidates: [{ ...candidate, ranking }],
      stats: {
        identityCount: 0,
        audioCount: 1,
        unionCount: 1,
        timingMs: { identityQuery: 0, audioQuery: 0, total: 0 },
      },
      ranking: {
        config: "default",
        surface: "recommendations",
        seed: { trackId: "s", friendId: 1 },
      },
    });
    expect(response.candidates[0].ranking).toEqual(ranking);
    expect(response.ranking?.config).toBe("default");
  });

  it("accepts the breakdown flag and a config id on both requests", () => {
    expect(
      recommendationsQuerySchema.parse({
        track_id: "s",
        friend_id: 1,
        breakdown: true,
        ranker: "strict",
      }).ranker,
    ).toBe("strict");
    expect(
      recommendationsBatchBodySchema.safeParse({
        tracks: [{ track_id: "s", friend_id: 1 }],
        ranker: "fastest",
      }).success,
    ).toBe(false);
  });
});

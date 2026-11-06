import { describe, expect, it } from "vitest";
import {
  RECOMMENDATION_MODES,
  recommendationJsonSchemas,
  recommendationsBatchBodySchema,
  recommendationsQuerySchema,
  recommendationsResponseSchema,
} from "./recommendations.js";

const metadata = {
  bpm: 124,
  key: "Am",
  keyConfidence: null,
  tempoConfidence: null,
  eraBucket: "2020s",
  tags: [],
  genreRefs: [{ id: "g1", parentId: null }],
  styles: [],
  energy: null,
  danceability: null,
  title: "t",
  artist: "a",
  album: "al",
  year: null,
  genres: [],
  starRating: null,
  albumThumbnail: null,
  moodHappy: null,
  moodSad: null,
  moodRelaxed: null,
  moodAggressive: null,
  future_field: 1,
};

describe("recommendation contracts", () => {
  it("publishes the modes and leaves defaults to the route", () => {
    expect(RECOMMENDATION_MODES).toEqual(["combined", "identity", "audio"]);
    expect(recommendationsQuerySchema.parse({ track_id: "t", friend_id: 1 })).toEqual({
      track_id: "t",
      friend_id: 1,
    });
    expect(
      recommendationsQuerySchema.safeParse({ track_id: "t", friend_id: 1, mode: "x" }).success,
    ).toBe(false);
  });

  it("bounds the batch seed list", () => {
    const seed = { track_id: "t", friend_id: 1 };
    expect(recommendationsBatchBodySchema.safeParse({ tracks: [] }).success).toBe(false);
    expect(recommendationsBatchBodySchema.safeParse({ tracks: [seed] }).success).toBe(true);
    expect(
      recommendationsBatchBodySchema.safeParse({ tracks: Array(101).fill(seed) }).success,
    ).toBe(false);
  });

  it("keeps extra metadata fields on candidates", () => {
    const response = recommendationsResponseSchema.parse({
      seedTrackId: "t",
      seedFriendId: 1,
      seedEmbeddings: { identity: true, audio: false },
      scope: "library",
      libraryFriendId: null,
      candidates: [{ trackId: "c", friendId: 1, simIdentity: 0.9, simAudio: null, metadata }],
      stats: {
        identityCount: 1,
        audioCount: 0,
        unionCount: 1,
        timingMs: { identityQuery: 1, audioQuery: 0, total: 1 },
      },
    });
    expect(response.candidates[0].metadata.future_field).toBe(1);
  });

  it("publishes the request by its input shape", () => {
    expect(recommendationJsonSchemas.RecommendationsBatchRequest).toMatchObject({
      required: ["tracks"],
    });
  });
});

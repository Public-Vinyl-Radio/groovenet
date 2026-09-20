import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecommendationCandidateRow } from "@/server/repositories/recommendationRepository";

const {
  findIdentitySimilar,
  findAudioSimilar,
  findIdentitySimilarByCentroid,
  findAudioSimilarByCentroid,
  listEmbeddingTypesForTrack,
  listEmbeddingTypesForTrackPairs,
} = vi.hoisted(() => ({
  findIdentitySimilar: vi.fn(),
  findAudioSimilar: vi.fn(),
  findIdentitySimilarByCentroid: vi.fn(),
  findAudioSimilarByCentroid: vi.fn(),
  listEmbeddingTypesForTrack: vi.fn(),
  listEmbeddingTypesForTrackPairs: vi.fn(),
}));

vi.mock("@/server/repositories/recommendationRepository", () => ({
  recommendationRepository: {
    findIdentitySimilar,
    findAudioSimilar,
    findIdentitySimilarByCentroid,
    findAudioSimilarByCentroid,
  },
}));

vi.mock("@/server/repositories/embeddingsRepository", () => ({
  embeddingsRepository: {
    listEmbeddingTypesForTrack,
    listEmbeddingTypesForTrackPairs,
  },
}));

import {
  hasEmbeddings,
  hasEmbeddingsForSeedTracks,
  retrieveCandidates,
  retrieveCandidatesForSeedTracks,
} from "../recommendation-candidate-retriever";

function makeRow(overrides: Partial<RecommendationCandidateRow> = {}): RecommendationCandidateRow {
  return {
    track_id: "track-1",
    friend_id: 1,
    distance: 0.4,
    title: "Track title",
    artist: "Artist",
    album: "Album",
    year: "1997",
    bpm: 128,
    key: "C Major",
    genres: ["Electronic"],
    styles: ["House"],
    local_tags: "house, peak time, ",
    danceability: 0.7,
    mood_happy: 0.1,
    mood_sad: 0.2,
    mood_relaxed: 0.3,
    mood_aggressive: 0.2,
    star_rating: 4,
    album_thumbnail: "https://example.test/cover.jpg",
    ...overrides,
  };
}

describe("recommendation candidate retriever", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("merges embedding results, converts distances, and normalizes metadata", async () => {
    findIdentitySimilar.mockResolvedValue([
      makeRow({ track_id: "shared", distance: 0, year: "1997" }),
      makeRow({ track_id: "identity-only", friend_id: 2, distance: 0.5, year: "bad-year" }),
    ]);
    findAudioSimilar.mockResolvedValue([
      makeRow({ track_id: "shared", distance: 0.8 }),
      makeRow({ track_id: "audio-only", friend_id: 3, distance: 1.5, danceability: null, mood_aggressive: null }),
    ]);

    const result = await retrieveCandidates("seed", 9);

    expect(findIdentitySimilar).toHaveBeenCalledWith({
      seedTrackId: "seed",
      seedFriendId: 9,
      limit: 200,
      ivfflatProbes: 10,
    });
    expect(findAudioSimilar).toHaveBeenCalledWith({
      seedTrackId: "seed",
      seedFriendId: 9,
      limit: 200,
      ivfflatProbes: 10,
    });
    expect(result.stats).toMatchObject({ identityCount: 2, audioCount: 2, unionCount: 3 });
    expect(result.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ trackId: "shared", friendId: 1, simIdentity: 1, simAudio: 0.6 }),
      expect.objectContaining({ trackId: "identity-only", friendId: 2, simIdentity: 0.75, simAudio: null }),
      expect.objectContaining({ trackId: "audio-only", friendId: 3, simIdentity: null, simAudio: 0.25 }),
    ]));

    const shared = result.candidates.find((candidate) => candidate.trackId === "shared");
    expect(shared?.metadata).toMatchObject({
      eraBucket: "1990s",
      tags: ["house", "peak time"],
      energy: 0.5,
      albumThumbnail: "https://example.test/cover.jpg",
    });
    expect(result.candidates.find((candidate) => candidate.trackId === "identity-only")?.metadata.eraBucket).toBeNull();
    expect(result.candidates.find((candidate) => candidate.trackId === "audio-only")?.metadata.energy).toBeNull();
  });

  it("passes custom limits and IVFFlat probes to both queries", async () => {
    findIdentitySimilar.mockResolvedValue([]);
    findAudioSimilar.mockResolvedValue([]);

    await retrieveCandidates("seed", 9, { limitIdentity: 20, limitAudio: 30, ivfflatProbes: 4 });

    expect(findIdentitySimilar).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, ivfflatProbes: 4 }));
    expect(findAudioSimilar).toHaveBeenCalledWith(expect.objectContaining({ limit: 30, ivfflatProbes: 4 }));
  });

  it("deduplicates valid seed tracks before querying centroids", async () => {
    findIdentitySimilarByCentroid.mockResolvedValue([makeRow({ track_id: "identity-only" })]);
    findAudioSimilarByCentroid.mockResolvedValue([makeRow({ track_id: "audio-only", friend_id: 2 })]);

    const result = await retrieveCandidatesForSeedTracks([
      { trackId: "seed-a", friendId: 1 },
      { trackId: "seed-a", friendId: 1 },
      { trackId: "seed-b", friendId: 2 },
      { trackId: "", friendId: 3 },
      { trackId: "invalid", friendId: Number.NaN },
    ], { limitIdentity: 10, limitAudio: 15, ivfflatProbes: 7 });

    const seedTracks = [{ trackId: "seed-a", friendId: 1 }, { trackId: "seed-b", friendId: 2 }];
    expect(findIdentitySimilarByCentroid).toHaveBeenCalledWith({ seedTracks, limit: 10, ivfflatProbes: 7 });
    expect(findAudioSimilarByCentroid).toHaveBeenCalledWith({ seedTracks, limit: 15, ivfflatProbes: 7 });
    expect(result).toMatchObject({ seedTrackId: "seed-a", seedFriendId: 1 });
    expect(result.candidates).toHaveLength(2);
  });

  it("rejects missing or wholly invalid seed tracks without querying repositories", async () => {
    await expect(retrieveCandidatesForSeedTracks([])).rejects.toThrow("At least one seed track is required");
    await expect(retrieveCandidatesForSeedTracks([{ trackId: "", friendId: Number.NaN }])).rejects.toThrow(
      "No valid seed tracks provided"
    );
    expect(findIdentitySimilarByCentroid).not.toHaveBeenCalled();
    expect(findAudioSimilarByCentroid).not.toHaveBeenCalled();
  });

  it("reports available embedding types for individual and multiple seed tracks", async () => {
    listEmbeddingTypesForTrack.mockResolvedValue(["identity"]);
    listEmbeddingTypesForTrackPairs.mockResolvedValue(["audio_vibe"]);

    await expect(hasEmbeddings("track", 1)).resolves.toEqual({ identity: true, audio: false });
    await expect(hasEmbeddingsForSeedTracks([
      { trackId: "seed", friendId: 1 },
      { trackId: "seed", friendId: 1 },
    ])).resolves.toEqual({ identity: false, audio: true });
    expect(listEmbeddingTypesForTrackPairs).toHaveBeenCalledWith([{ trackId: "seed", friendId: 1 }]);
  });

  it("returns no embedding types for an empty or invalid seed collection", async () => {
    await expect(hasEmbeddingsForSeedTracks([])).resolves.toEqual({ identity: false, audio: false });
    await expect(hasEmbeddingsForSeedTracks([{ trackId: "", friendId: 1 }])).resolves.toEqual({
      identity: false,
      audio: false,
    });
    expect(listEmbeddingTypesForTrackPairs).not.toHaveBeenCalled();
  });
});

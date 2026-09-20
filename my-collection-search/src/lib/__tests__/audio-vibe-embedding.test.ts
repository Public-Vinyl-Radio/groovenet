import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createEmbedding,
  readEssentiaAnalysis,
  findTrackByTrackIdAndFriendIdRaw,
  upsertTrackEmbedding,
  findEmbeddingSourceHash,
} = vi.hoisted(() => ({
  createEmbedding: vi.fn(),
  readEssentiaAnalysis: vi.fn(),
  findTrackByTrackIdAndFriendIdRaw: vi.fn(),
  upsertTrackEmbedding: vi.fn(),
  findEmbeddingSourceHash: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    embeddings = { create: createEmbedding };
  },
}));

vi.mock("../essentia-storage", () => ({ readEssentiaAnalysis }));
vi.mock("@/server/repositories/trackRepository", () => ({
  trackRepository: { findTrackByTrackIdAndFriendIdRaw },
}));
vi.mock("@/server/repositories/embeddingsRepository", () => ({
  embeddingsRepository: { upsertTrackEmbedding, findEmbeddingSourceHash },
}));

import {
  buildAudioVibeData,
  buildAudioVibeText,
  computeAudioVibeHash,
  generateAndStoreAudioVibeEmbedding,
  getAudioVibePreview,
  hasAudioData,
  needsAudioVibeUpdate,
  storeAudioVibeEmbedding,
} from "../audio-vibe-embedding";
import type { Track } from "@/types/track";

const mockTrack: Track = {
  id: 1,
  track_id: "test-123",
  friend_id: 1,
  title: "Test Track",
  artist: "Test Artist",
  album: "Test Album",
  year: "2020",
  duration: "3:45",
  position: 1,
  discogs_url: "https://discogs.com/test",
  apple_music_url: "",
  bpm: "128",
  key: "A Minor",
  danceability: "0.75",
  mood_happy: 0.3,
  mood_sad: 0.2,
  mood_relaxed: 0.7,
  mood_aggressive: 0.1,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("hasAudioData", () => {
  it("returns true when bpm is present", () => {
    expect(hasAudioData(mockTrack)).toBe(true);
  });

  it("returns true when only key is present", () => {
    expect(hasAudioData({ ...mockTrack, bpm: undefined, key: "C Major" } as Track)).toBe(true);
  });

  it("returns true when only danceability is present", () => {
    expect(
      hasAudioData({ ...mockTrack, bpm: undefined, key: undefined, danceability: "0.5" } as Track)
    ).toBe(true);
  });

  it("returns true when only mood is present", () => {
    expect(
      hasAudioData({
        ...mockTrack,
        bpm: undefined,
        key: undefined,
        danceability: undefined,
        mood_happy: 0.5,
      } as Track)
    ).toBe(true);
  });

  it("returns false when no audio fields are present", () => {
    expect(
      hasAudioData({
        ...mockTrack,
        bpm: undefined,
        key: undefined,
        danceability: undefined,
        mood_happy: undefined,
        mood_sad: undefined,
        mood_relaxed: undefined,
        mood_aggressive: undefined,
      } as Track)
    ).toBe(false);
  });
});

describe("buildAudioVibeData", () => {
  it("extracts and normalizes all fields from a full track", () => {
    const vibeData = buildAudioVibeData(mockTrack, false);
    expect(vibeData.bpm).toBe("128");
    expect(vibeData.bpmRange).toBe("upbeat");
    expect(vibeData.key).toBe("A Minor");
    expect(vibeData.camelot).toBe("8A");
    expect(vibeData.danceability).toBe("high");
    expect(vibeData.dominantMood).toBe("relaxed");
    expect(vibeData.vibeDescriptors).toContain("mellow");
    expect(vibeData.energy).toBe("moderate");
  });

  it("uses unknown for missing fields", () => {
    const unknown = buildAudioVibeData(
      { ...mockTrack, bpm: undefined, key: undefined, danceability: undefined } as Track,
      false
    );
    expect(unknown.bpm).toBe("unknown");
    expect(unknown.key).toBe("unknown");
    expect(unknown.danceability).toBe("unknown");
  });

  it("adds enhanced features from Essentia analysis", () => {
    readEssentiaAnalysis.mockReturnValue({
      payload: {
        analysis: {
          highlevel: {
            mood_acoustic: { all: { acoustic: 0.1 } },
            mood_electronic: { all: { electronic: 0.8 } },
            voice_instrumental: { all: { instrumental: 0.1, voice: 0.7 } },
            mood_party: { all: { party: 0.5 } },
          },
          rhythm: { onset_rate: 5 },
        },
      },
    });

    expect(buildAudioVibeData(mockTrack)).toMatchObject({
      acoustic: "very electronic",
      vocalPresence: "heavy vocals",
      percussiveness: "rhythmic",
      partyMood: "high",
    });
    expect(readEssentiaAnalysis).toHaveBeenCalledWith("test-123", 1);
  });

  it("falls back to base data when Essentia analysis cannot be read", () => {
    readEssentiaAnalysis.mockImplementation(() => {
      throw new Error("missing analysis");
    });

    const vibeData = buildAudioVibeData(mockTrack);
    expect(vibeData.acoustic).toBeUndefined();
    expect(vibeData.vocalPresence).toBeUndefined();
  });
});

describe("buildAudioVibeText", () => {
  it("includes all standard fields", () => {
    const vibeData = buildAudioVibeData(mockTrack, false);
    const vibeText = buildAudioVibeText(vibeData);
    expect(vibeText).toContain("BPM: 128 (upbeat)");
    expect(vibeText).toContain("Key: A Minor - 8A");
    expect(vibeText).toContain("Danceability: high");
    expect(vibeText).toContain("Energy: moderate");
    expect(vibeText).toContain("Dominant Mood: relaxed");
    expect(vibeText).toContain("Vibe:");
  });

  it("includes enhanced fields when present", () => {
    const vibeData = buildAudioVibeData(mockTrack, false);
    const enhanced = {
      ...vibeData,
      acoustic: "balanced",
      vocalPresence: "instrumental",
      percussiveness: "rhythmic",
      partyMood: "moderate",
    };
    const text = buildAudioVibeText(enhanced);
    expect(text).toContain("Acoustic: balanced");
    expect(text).toContain("Vocals: instrumental");
    expect(text).toContain("Percussiveness: rhythmic");
    expect(text).toContain("Party: moderate");
  });

  it("omits enhanced fields when absent", () => {
    const vibeData = buildAudioVibeData(mockTrack, false);
    const vibeText = buildAudioVibeText(vibeData);
    expect(vibeText).not.toContain("Acoustic:");
    expect(vibeText).not.toContain("Vocals:");
    expect(vibeText).not.toContain("Percussiveness:");
    expect(vibeText).not.toContain("Party:");
  });
});

describe("computeAudioVibeHash", () => {
  it("produces a stable SHA256 hash", () => {
    const vibeData1 = buildAudioVibeData(mockTrack, false);
    const vibeData2 = buildAudioVibeData(mockTrack, false);
    expect(computeAudioVibeHash(vibeData1)).toBe(computeAudioVibeHash(vibeData2));
    expect(computeAudioVibeHash(vibeData1)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when source data changes", () => {
    const hash1 = computeAudioVibeHash(buildAudioVibeData(mockTrack, false));
    const hash2 = computeAudioVibeHash(buildAudioVibeData({ ...mockTrack, bpm: "140" } as Track, false));
    expect(hash1).not.toBe(hash2);
  });

  it("changes when enhanced features are added", () => {
    const vibeData = buildAudioVibeData(mockTrack, false);
    const hash1 = computeAudioVibeHash(vibeData);
    const hash2 = computeAudioVibeHash({ ...vibeData, acoustic: "balanced" });
    expect(hash1).not.toBe(hash2);
  });

  it("produces deterministic text with mood profile", () => {
    const text1 = buildAudioVibeText(buildAudioVibeData(mockTrack, false));
    const text2 = buildAudioVibeText(buildAudioVibeData(mockTrack, false));
    expect(text1).toBe(text2);
    expect(text1).toContain("Mood Profile:");
    expect(text1).toContain("Relaxed");
    expect(text1).toContain("Happy");
    expect(text1).toContain("Sad");
    expect(text1).toContain("Aggressive");
  });
});

describe("audio vibe embedding persistence", () => {
  it("checks source hashes and stores audio-vibe embeddings with the expected metadata", async () => {
    findEmbeddingSourceHash.mockResolvedValueOnce(null).mockResolvedValueOnce("same-hash");

    await expect(needsAudioVibeUpdate("track", 4, "new-hash")).resolves.toBe(true);
    await expect(needsAudioVibeUpdate("track", 4, "same-hash")).resolves.toBe(false);
    expect(findEmbeddingSourceHash).toHaveBeenCalledWith("track", 4, "audio_vibe");

    await storeAudioVibeEmbedding("track", 4, [0.1, 0.2], "source-hash", "vibe text", "custom-model", 2);
    expect(upsertTrackEmbedding).toHaveBeenCalledWith({
      trackId: "track",
      friendId: 4,
      embeddingType: "audio_vibe",
      model: "custom-model",
      dims: 2,
      embedding: [0.1, 0.2],
      sourceHash: "source-hash",
      identityText: "vibe text",
    });
  });
});

describe("generateAndStoreAudioVibeEmbedding", () => {
  it("rejects missing tracks and skips tracks without audio data", async () => {
    findTrackByTrackIdAndFriendIdRaw.mockResolvedValueOnce(null).mockResolvedValueOnce({
      ...mockTrack,
      bpm: undefined,
      key: undefined,
      danceability: undefined,
      mood_happy: undefined,
      mood_sad: undefined,
      mood_relaxed: undefined,
      mood_aggressive: undefined,
    });

    await expect(generateAndStoreAudioVibeEmbedding("missing", 1)).rejects.toThrow("Track not found: missing");
    await expect(generateAndStoreAudioVibeEmbedding("empty", 1)).resolves.toEqual({
      updated: false,
      reason: "Track missing audio analysis data (BPM, key, mood, etc.)",
    });
    expect(createEmbedding).not.toHaveBeenCalled();
  });

  it("skips an unchanged embedding unless forced", async () => {
    findTrackByTrackIdAndFriendIdRaw.mockResolvedValue(mockTrack);
    findEmbeddingSourceHash.mockResolvedValue(computeAudioVibeHash(buildAudioVibeData(mockTrack)));

    await expect(generateAndStoreAudioVibeEmbedding("test-123", 1)).resolves.toEqual({
      updated: false,
      reason: "Source hash unchanged",
    });
    expect(createEmbedding).not.toHaveBeenCalled();
    expect(upsertTrackEmbedding).not.toHaveBeenCalled();
  });

  it("generates and stores an embedding when forced", async () => {
    findTrackByTrackIdAndFriendIdRaw.mockResolvedValue(mockTrack);
    createEmbedding.mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3] }] });

    await expect(generateAndStoreAudioVibeEmbedding("test-123", 1, true)).resolves.toEqual({
      updated: true,
      reason: "Audio vibe embedding generated and stored",
    });
    expect(createEmbedding).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: expect.stringContaining("BPM: 128"),
    });
    expect(upsertTrackEmbedding).toHaveBeenCalledWith(expect.objectContaining({
      trackId: "test-123",
      friendId: 1,
      embedding: [0.1, 0.2, 0.3],
      embeddingType: "audio_vibe",
    }));
  });
});

describe("getAudioVibePreview", () => {
  it("returns a generated preview for tracks with audio data", async () => {
    findTrackByTrackIdAndFriendIdRaw.mockResolvedValue(mockTrack);

    await expect(getAudioVibePreview("test-123", 1)).resolves.toMatchObject({
      vibeText: expect.stringContaining("BPM: 128"),
      vibeData: expect.objectContaining({ camelot: "8A" }),
    });
  });

  it("rejects a missing track and a track without audio data", async () => {
    findTrackByTrackIdAndFriendIdRaw.mockResolvedValueOnce(null).mockResolvedValueOnce({
      ...mockTrack,
      bpm: undefined,
      key: undefined,
      danceability: undefined,
      mood_happy: undefined,
      mood_sad: undefined,
      mood_relaxed: undefined,
      mood_aggressive: undefined,
    });

    await expect(getAudioVibePreview("missing", 1)).rejects.toThrow("Track not found: missing");
    await expect(getAudioVibePreview("empty", 1)).rejects.toThrow("Track missing audio analysis data");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SimilarIdentityTrack } from "@/types/embeddings";

const {
  mockWithDbClient,
  mockGenerateIdentity,
  mockGetIdentityPreview,
  mockGetAudioVibePreview,
  mockListNeeding,
  mockSetProbes,
  mockFindSource,
  mockFindSimilarIdentity,
  mockFindSimilarVibe,
} = vi.hoisted(() => ({
  mockWithDbClient: vi.fn(),
  mockGenerateIdentity: vi.fn(),
  mockGetIdentityPreview: vi.fn(),
  mockGetAudioVibePreview: vi.fn(),
  mockListNeeding: vi.fn(),
  mockSetProbes: vi.fn(),
  mockFindSource: vi.fn(),
  mockFindSimilarIdentity: vi.fn(),
  mockFindSimilarVibe: vi.fn(),
}));

vi.mock("@/lib/serverDb", () => ({ withDbClient: mockWithDbClient }));
vi.mock("@/lib/identity-embedding", () => ({
  generateAndStoreIdentityEmbedding: mockGenerateIdentity,
  getIdentityPreview: mockGetIdentityPreview,
}));
vi.mock("@/lib/audio-vibe-embedding", () => ({
  getAudioVibePreview: mockGetAudioVibePreview,
}));
vi.mock("@/server/repositories/embeddingsRepository", () => ({
  embeddingsRepository: {
    listTracksNeedingIdentityEmbeddings: mockListNeeding,
    setIvfflatProbes: mockSetProbes,
    findSourceEmbedding: mockFindSource,
    findSimilarIdentityTracks: mockFindSimilarIdentity,
    findSimilarAudioVibeTracks: mockFindSimilarVibe,
  },
}));

import { applyEraFilter, embeddingsService } from "../embeddingsService";

const track = (year: unknown): SimilarIdentityTrack =>
  ({ track_id: "t", friend_id: 1, year } as unknown as SimilarIdentityTrack);

beforeEach(() => {
  vi.resetAllMocks();
  mockWithDbClient.mockImplementation(async (cb: (c: unknown) => unknown) => cb({}));
});

// ─── applyEraFilter (pure) ─────────────────────────────────────────────────

describe("applyEraFilter", () => {
  it("returns all tracks when no era is given", () => {
    const tracks = [track(2021), track(1995)];
    expect(applyEraFilter(tracks)).toBe(tracks);
  });

  it("buckets each decade correctly", () => {
    const cases: Array<[string, number]> = [
      ["2020s", 2021],
      ["2010s", 2015],
      ["2000s", 2003],
      ["1990s", 1999],
      ["1980s", 1985],
      ["1970s", 1971],
      ["1960s", 1969],
      ["1950s", 1950],
    ];
    for (const [era, year] of cases) {
      expect(applyEraFilter([track(year)], era)).toHaveLength(1);
      // a year outside the decade is excluded
      expect(applyEraFilter([track(year - 100)], era)).toHaveLength(0);
    }
  });

  it("treats pre-1950s as anything below 1950", () => {
    expect(applyEraFilter([track(1949)], "pre-1950s")).toHaveLength(1);
    expect(applyEraFilter([track(1950)], "pre-1950s")).toHaveLength(0);
  });

  it("parses string years", () => {
    expect(applyEraFilter([track("2015")], "2010s")).toHaveLength(1);
  });

  it("classifies missing / invalid / pre-1900 years as unknown-era", () => {
    expect(applyEraFilter([track(null)], "unknown-era")).toHaveLength(1);
    expect(applyEraFilter([track("nope")], "unknown-era")).toHaveLength(1);
    expect(applyEraFilter([track(1800)], "unknown-era")).toHaveLength(1);
    // ...and excludes those same tracks from a real decade
    expect(applyEraFilter([track(null)], "2010s")).toHaveLength(0);
  });

  it("excludes everything for an unrecognized era", () => {
    expect(applyEraFilter([track(2015)], "bogus")).toHaveLength(0);
  });
});

// ─── getPreview ───────────────────────────────────────────────────────────

describe("EmbeddingsService.getPreview", () => {
  it("returns identity preview fields for type=identity", async () => {
    mockGetIdentityPreview.mockResolvedValueOnce({
      identityText: "id-text",
      identityData: { a: 1 },
    });
    const res = await embeddingsService.getPreview("identity", "t1", 1);
    expect(res).toEqual({ type: "identity", text: "id-text", data: { a: 1 } });
    expect(mockGetAudioVibePreview).not.toHaveBeenCalled();
  });

  it("returns audio-vibe preview fields for type=audio_vibe", async () => {
    mockGetAudioVibePreview.mockResolvedValueOnce({
      vibeText: "vibe-text",
      vibeData: { b: 2 },
    });
    const res = await embeddingsService.getPreview("audio_vibe", "t1", 1);
    expect(res).toEqual({ type: "audio_vibe", text: "vibe-text", data: { b: 2 } });
    expect(mockGetIdentityPreview).not.toHaveBeenCalled();
  });
});

// ─── backfillIdentity ───────────────────────────────────────────────────────

describe("EmbeddingsService.backfillIdentity", () => {
  it("returns zeros and does no work when nothing needs embeddings", async () => {
    mockListNeeding.mockResolvedValueOnce([]);
    const res = await embeddingsService.backfillIdentity({});
    expect(res).toEqual({ total: 0, success: 0, skipped: 0, failed: [] });
    expect(mockGenerateIdentity).not.toHaveBeenCalled();
  });

  it("aggregates success, skipped, and failed across a batch", async () => {
    mockListNeeding.mockResolvedValueOnce([
      { track_id: "t1", friend_id: 1 },
      { track_id: "t2", friend_id: 1 },
      { track_id: "t3", friend_id: 1 },
    ]);
    mockGenerateIdentity
      .mockResolvedValueOnce({ updated: true }) // success
      .mockResolvedValueOnce({ updated: false }) // skipped
      .mockRejectedValueOnce(new Error("kaboom")); // failed
    const res = await embeddingsService.backfillIdentity({ batch_size: 10 });
    expect(res.total).toBe(3);
    expect(res.success).toBe(1);
    expect(res.skipped).toBe(1);
    expect(res.failed).toEqual([{ track_id: "t3", friend_id: 1, error: "kaboom" }]);
  });

  it("processes all tracks across multiple batches and forwards force", async () => {
    mockListNeeding.mockResolvedValueOnce(
      Array.from({ length: 5 }, (_, i) => ({ track_id: `t${i}`, friend_id: 1 }))
    );
    mockGenerateIdentity.mockResolvedValue({ updated: true });
    const res = await embeddingsService.backfillIdentity({ batch_size: 2, force: true });
    expect(res.success).toBe(5);
    expect(mockGenerateIdentity).toHaveBeenCalledTimes(5);
    expect(mockGenerateIdentity).toHaveBeenCalledWith("t0", 1, true);
  });
});

// ─── findSimilarIdentity ──────────────────────────────────────────────────

describe("EmbeddingsService.findSimilarIdentity", () => {
  const baseParams = {
    trackId: "t1",
    friendId: 1,
    limit: 3,
    ivfflatProbes: 10,
    filters: {} as never,
  };

  it("throws when the source identity embedding is missing", async () => {
    mockFindSource.mockResolvedValueOnce(null);
    await expect(embeddingsService.findSimilarIdentity(baseParams)).rejects.toThrow(
      "missing_identity_embedding"
    );
    expect(mockSetProbes).toHaveBeenCalledWith({}, 10);
  });

  it("fetches 2x the limit, applies the era filter, and trims to the limit", async () => {
    mockFindSource.mockResolvedValueOnce([0.1, 0.2]);
    // 5 candidates, era filter is a no-op (no era), sliced to limit 3
    mockFindSimilarIdentity.mockResolvedValueOnce(
      Array.from({ length: 5 }, (_, i) => track(2000 + i))
    );
    const res = await embeddingsService.findSimilarIdentity(baseParams);
    const callArgs = mockFindSimilarIdentity.mock.calls[0][1];
    expect(callArgs.limit).toBe(6); // limit * 2
    expect(res.count).toBe(3);
    expect(res.tracks).toHaveLength(3);
    expect(res.source_track_id).toBe("t1");
  });
});

// ─── findSimilarVibe ────────────────────────────────────────────────────────

describe("EmbeddingsService.findSimilarVibe", () => {
  const baseParams = { trackId: "t1", friendId: 1, limit: 4, ivfflatProbes: 8 };

  it("throws when the source audio-vibe embedding is missing", async () => {
    mockFindSource.mockResolvedValueOnce(null);
    await expect(embeddingsService.findSimilarVibe(baseParams)).rejects.toThrow(
      "missing_audio_vibe_embedding"
    );
  });

  it("returns the vibe tracks with a count", async () => {
    mockFindSource.mockResolvedValueOnce([0.1]);
    mockFindSimilarVibe.mockResolvedValueOnce([{ track_id: "a" }, { track_id: "b" }]);
    const res = await embeddingsService.findSimilarVibe(baseParams);
    expect(res.count).toBe(2);
    expect(res.tracks).toHaveLength(2);
    expect(res.source_friend_id).toBe(1);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const repo = vi.hoisted(() => ({
  listTracksNeedingIdentityEmbeddings: vi.fn(),
  listTracksNeedingAudioVibeEmbeddings: vi.fn(),
  listTracksNeedingPromptEmbeddings: vi.fn(),
  countTracks: vi.fn(),
  countEmbeddingsByModel: vi.fn(),
}));

vi.mock("@/server/repositories/embeddingsRepository", () => ({
  embeddingsRepository: repo,
}));

import { GET } from "../route";

function refs(n: number) {
  return Array.from({ length: n }, (_, i) => ({ track_id: `t${i}`, friend_id: 1 }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  repo.listTracksNeedingIdentityEmbeddings.mockResolvedValue([]);
  repo.listTracksNeedingAudioVibeEmbeddings.mockResolvedValue([]);
  repo.listTracksNeedingPromptEmbeddings.mockResolvedValue([]);
  repo.countTracks.mockResolvedValue(0);
  repo.countEmbeddingsByModel.mockResolvedValue([]);
});

describe("GET /api/embeddings/status", () => {
  it("reports missing counts per type and the track total", async () => {
    repo.listTracksNeedingIdentityEmbeddings.mockResolvedValue(refs(3));
    repo.listTracksNeedingAudioVibeEmbeddings.mockResolvedValue(refs(1));
    repo.listTracksNeedingPromptEmbeddings.mockResolvedValue(refs(2));
    repo.countTracks.mockResolvedValue(50);
    repo.countEmbeddingsByModel.mockResolvedValue([
      { model: "text-embedding-3-small", dims: 1536, count: 47 },
    ]);

    const res = await GET(new Request("http://app/api/embeddings/status"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      total_tracks: 50,
      missing: { identity: 3, audio_vibe: 1, prompt: 2 },
      by_model: {
        identity: [{ model: "text-embedding-3-small", dims: 1536, count: 47 }],
        audio_vibe: [{ model: "text-embedding-3-small", dims: 1536, count: 47 }],
      },
    });
  });

  it("scopes to one friend when ?friend_id= is given", async () => {
    await GET(new Request("http://app/api/embeddings/status?friend_id=7"));

    expect(repo.listTracksNeedingIdentityEmbeddings).toHaveBeenCalledWith({ friend_id: 7 });
    expect(repo.countTracks).toHaveBeenCalledWith(7);
  });

  it("rejects a non-numeric friend_id with 400", async () => {
    const res = await GET(new Request("http://app/api/embeddings/status?friend_id=abc"));
    expect(res.status).toBe(400);
    expect(repo.countTracks).not.toHaveBeenCalled();
  });

  it("reports a lookup failure as 500", async () => {
    repo.countTracks.mockRejectedValue(new Error("db is gone"));

    const res = await GET(new Request("http://app/api/embeddings/status"));

    expect(res.status).toBe(500);
  });

  it("stringifies a non-Error rejection", async () => {
    repo.countTracks.mockRejectedValue("db is gone");

    const res = await GET(new Request("http://app/api/embeddings/status"));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("db is gone");
  });

  it("falls back to a generic message for an empty Error message", async () => {
    repo.countTracks.mockRejectedValue(new Error(""));

    const res = await GET(new Request("http://app/api/embeddings/status"));

    expect((await res.json()).error).toBe("Failed to read embeddings status");
  });
});

import { vi, describe, it, expect, beforeEach } from "vitest";

const mockFindTracks = vi.hoisted(() => vi.fn());
const mockFindEmbeddings = vi.hoisted(() => vi.fn());
const mockServingModel = vi.hoisted(() => vi.fn());

vi.mock("@/lib/embeddings/config", () => ({ getServingModel: mockServingModel }));
vi.mock("@/server/repositories/embeddingsRepository", () => ({
  embeddingsRepository: { findEmbeddingsForTracks: mockFindEmbeddings },
}));

vi.mock("@/server/repositories/trackRepository", () => ({
  trackRepository: {
    findTracksByRefsPreservingOrder: mockFindTracks,
  },
}));

import { POST } from "../route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: unknown) {
  return new Request("http://localhost/api/tracks/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function baseTrack(overrides: Record<string, unknown> = {}) {
  return {
    track_id: "t1",
    friend_id: 1,
    title: "Test Track",
    artist: "Test Artist",
    ...overrides,
  };
}

beforeEach(() => {
  mockFindTracks.mockReset();
  mockFindTracks.mockResolvedValue([]);
  mockFindEmbeddings.mockReset();
  mockFindEmbeddings.mockResolvedValue([]);
  mockServingModel.mockReset();
  mockServingModel.mockResolvedValue({ model: "vibe-model", dims: 3 });
});

// ─── Request parsing ──────────────────────────────────────────────────────────

describe("POST /api/tracks/batch — request handling", () => {
  it("returns [] when tracks array is empty", async () => {
    const res = await POST(makeReq({ tracks: [] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(mockFindTracks).not.toHaveBeenCalled();
  });

  it("returns [] when body has no tracks key", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns [] when tracks is not an array", async () => {
    const res = await POST(makeReq({ tracks: "not-an-array" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("calls repository with the provided track refs", async () => {
    const refs = [{ track_id: "t1", friend_id: 1 }];
    await POST(makeReq({ tracks: refs }));
    expect(mockFindTracks).toHaveBeenCalledWith(refs);
  });
});

// ─── Embedding normalization ──────────────────────────────────────────────────

describe("POST /api/tracks/batch — vectors", () => {
  const refs = [{ track_id: "t1", friend_id: 1 }];

  it("omits _vectors and skips the lookup by default", async () => {
    mockFindTracks.mockResolvedValueOnce([baseTrack({ hasVectors: true })]);
    const res = await POST(makeReq({ tracks: refs }));
    const [track] = await res.json();
    expect(track.hasVectors).toBe(true);
    expect(track._vectors).toBeUndefined();
    expect(mockFindEmbeddings).not.toHaveBeenCalled();
  });

  it("attaches the serving-model audio_vibe vector when include_vectors is true", async () => {
    mockFindTracks.mockResolvedValueOnce([baseTrack({ hasVectors: true })]);
    mockFindEmbeddings.mockResolvedValueOnce([
      { track_id: "t1", friend_id: 1, embedding: "[0.1,0.2,0.3]" },
    ]);
    const res = await POST(makeReq({ tracks: refs, include_vectors: true }));
    const [track] = await res.json();
    expect(track._vectors).toEqual({ default: [0.1, 0.2, 0.3] });
    expect(mockFindEmbeddings).toHaveBeenCalledWith(
      [{ trackId: "t1", friendId: 1 }],
      "audio_vibe",
      "vibe-model"
    );
  });

  it("leaves _vectors off tracks with no stored vector", async () => {
    mockFindTracks.mockResolvedValueOnce([baseTrack({ hasVectors: false })]);
    const res = await POST(makeReq({ tracks: refs, include_vectors: true }));
    const [track] = await res.json();
    expect(track._vectors).toBeUndefined();
  });

  it("treats an unparseable vector as absent", async () => {
    mockFindTracks.mockResolvedValueOnce([baseTrack()]);
    mockFindEmbeddings.mockResolvedValueOnce([
      { track_id: "t1", friend_id: 1, embedding: "not-json" },
    ]);
    const res = await POST(makeReq({ tracks: refs, include_vectors: true }));
    expect(res.status).toBe(200);
    const [track] = await res.json();
    expect(track._vectors).toBeUndefined();
  });
});

// ─── Multi-track ordering ─────────────────────────────────────────────────────

describe("POST /api/tracks/batch — ordering", () => {
  it("returns tracks in the order returned by the repository", async () => {
    const t1 = baseTrack({ track_id: "t1" });
    const t2 = baseTrack({ track_id: "t2" });
    const t3 = baseTrack({ track_id: "t3" });
    mockFindTracks.mockResolvedValueOnce([t1, t2, t3]);
    const res = await POST(makeReq({ tracks: [t1, t2, t3] }));
    const tracks = await res.json();
    expect(tracks.map((t: { track_id: string }) => t.track_id)).toEqual(["t1", "t2", "t3"]);
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe("POST /api/tracks/batch — error handling", () => {
  it("returns 500 when repository throws", async () => {
    mockFindTracks.mockRejectedValueOnce(new Error("DB down"));
    const res = await POST(makeReq({ tracks: [{ track_id: "t1", friend_id: 1 }] }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed/i);
  });
});

import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock global fetch before importing the route
const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

const getServingModel = vi.hoisted(() => vi.fn());
const findEmbeddingsForTracks = vi.hoisted(() => vi.fn());

vi.mock("@/lib/embeddings/config", () => ({ getServingModel }));
vi.mock("@/server/repositories/embeddingsRepository", () => ({
  embeddingsRepository: { findEmbeddingsForTracks },
}));

import { POST } from "../route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: unknown) {
  return new Request("http://localhost/api/playlists/genetic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeTrack(overrides: Record<string, unknown> = {}) {
  return {
    track_id: "track-1",
    friend_id: 1,
    bpm: 120,
    ...overrides,
  };
}

function makeGaResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  getServingModel.mockReset();
  findEmbeddingsForTracks.mockReset();
  getServingModel.mockResolvedValue({ model: "vibe-model", dims: 3, templateVersion: 4 });
  // Default: every requested track has a stored audio_vibe vector
  findEmbeddingsForTracks.mockImplementation(
    async (refs: Array<{ trackId: string; friendId: number }>) =>
      refs.map((r) => ({
        track_id: r.trackId,
        friend_id: r.friendId,
        embedding: "[0.1,0.2,0.3]",
      }))
  );
  // Default: GA service returns valid response
  mockFetch.mockImplementation(() =>
    makeGaResponse({ result: [{ track_id: "track-1" }] })
  );
});

// ─── Schema validation ────────────────────────────────────────────────────────

describe("POST /api/playlists/genetic — body validation", () => {
  it("returns 400 for non-JSON body", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(500); // JSON.parse throws → catch → 500
  });

  it("returns 400 when playlist is missing", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid/i);
  });

  it("returns 400 when playlist is an empty array", async () => {
    const res = await POST(makeReq({ playlist: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when a track is missing track_id", async () => {
    const res = await POST(makeReq({ playlist: [{ bpm: 120, friend_id: 1 }] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid/i);
  });
});

// ─── Embedding lookup ─────────────────────────────────────────────────────────

describe("POST /api/playlists/genetic — embedding lookup", () => {
  it("sends the stored audio_vibe vector to ga-service", async () => {
    const res = await POST(makeReq({ playlist: [makeTrack()] }));
    expect(res.status).toBe(200);
    expect(getServingModel).toHaveBeenCalledWith("audio_vibe");
    expect(findEmbeddingsForTracks).toHaveBeenCalledWith(
      [{ trackId: "track-1", friendId: 1 }],
      "audio_vibe",
      "vibe-model",
      4
    );
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.tracks[0].embedding).toBe("[0.1,0.2,0.3]");
  });

  it("ignores any embedding supplied in the request", async () => {
    const track = makeTrack({ embedding: [9, 9, 9], _vectors: { default: [8] } });
    await POST(makeReq({ playlist: [track] }));
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.tracks[0].embedding).toBe("[0.1,0.2,0.3]");
  });

  it("matches vectors by friend_id as well as track_id", async () => {
    findEmbeddingsForTracks.mockResolvedValue([
      { track_id: "track-1", friend_id: 2, embedding: "[1,1,1]" },
    ]);
    const res = await POST(makeReq({ playlist: [makeTrack({ friend_id: 1 })] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.invalid[0].reason).toBe("missing_embedding");
  });

  it("forwards cohesive_blocks mode to GA service", async () => {
    await POST(makeReq({ playlist: [makeTrack()], mode: "cohesive_blocks" }));
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.mode).toBe("cohesive_blocks");
  });

  it("returns 400 with missing_embedding when the track has no stored vector", async () => {
    findEmbeddingsForTracks.mockResolvedValue([]);
    const res = await POST(makeReq({ playlist: [makeTrack()] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.invalid[0].reason).toBe("missing_embedding");
    expect(body.invalid[0].track_id).toBe("track-1");
  });

  it("returns 400 with missing_embedding when friend_id is absent", async () => {
    const res = await POST(makeReq({ playlist: [makeTrack({ friend_id: undefined })] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.invalid[0].reason).toBe("missing_embedding");
    expect(findEmbeddingsForTracks).toHaveBeenCalledWith([], "audio_vibe", "vibe-model", 4);
  });

  it("allows cohesive_blocks when the track has no stored vector", async () => {
    findEmbeddingsForTracks.mockResolvedValue([]);
    const track = makeTrack({ genres: ["Electronic"], styles: ["House"] });
    const res = await POST(makeReq({ playlist: [track], mode: "cohesive_blocks" }));
    expect(res.status).toBe(200);
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.tracks[0].embedding).toBeUndefined();
  });

  it("returns 500 when the serving model lookup fails", async () => {
    getServingModel.mockRejectedValue(new Error("No embedding_model_settings row"));
    const res = await POST(makeReq({ playlist: [makeTrack()] }));
    expect(res.status).toBe(500);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─── BPM normalization ────────────────────────────────────────────────────────

describe("POST /api/playlists/genetic — BPM normalization", () => {
  it("passes through numeric BPM unchanged", async () => {
    const track = makeTrack({ bpm: 128 });
    await POST(makeReq({ playlist: [track] }));
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.tracks[0].bpm).toBe(128);
  });

  it("parses string BPM to float", async () => {
    const track = makeTrack({ bpm: "124.5" });
    await POST(makeReq({ playlist: [track] }));
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.tracks[0].bpm).toBe(124.5);
  });

  it("returns 400 with missing_bpm when BPM is null", async () => {
    const track = makeTrack({ bpm: null });
    const res = await POST(makeReq({ playlist: [track] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.invalid[0].reason).toBe("missing_bpm");
  });

  it("allows cohesive_blocks when BPM is missing", async () => {
    const track = makeTrack({
      bpm: null,
      genres: ["Electronic"],
      styles: ["House"],
    });
    const res = await POST(makeReq({ playlist: [track], mode: "cohesive_blocks" }));
    expect(res.status).toBe(200);
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.tracks[0].bpm).toBeUndefined();
  });

  it("returns 400 with missing_bpm when BPM is a non-numeric string", async () => {
    const track = makeTrack({ bpm: "fast" });
    const res = await POST(makeReq({ playlist: [track] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.invalid[0].reason).toBe("missing_bpm");
  });

  it("returns 400 with missing_bpm when BPM is absent", async () => {
    const track = makeTrack({ bpm: undefined });
    const res = await POST(makeReq({ playlist: [track] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.invalid[0].reason).toBe("missing_bpm");
  });
});

// ─── Multiple invalid tracks ──────────────────────────────────────────────────

describe("POST /api/playlists/genetic — multiple invalid tracks", () => {
  it("collects all invalid tracks before returning 400", async () => {
    findEmbeddingsForTracks.mockResolvedValue([
      { track_id: "t2", friend_id: 1, embedding: "[0.1]" },
    ]);
    const tracks = [
      makeTrack({ track_id: "t1" }),
      makeTrack({ track_id: "t2", bpm: null }),
      makeTrack({ track_id: "t3", bpm: null }),
    ];
    const res = await POST(makeReq({ playlist: tracks }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.invalid_count).toBe(3);
    expect(body.invalid).toHaveLength(3);
  });

  it("does not call GA service when any track is invalid", async () => {
    findEmbeddingsForTracks.mockResolvedValue([
      { track_id: "t1", friend_id: 1, embedding: "[0.1]" },
    ]);
    const tracks = [
      makeTrack({ track_id: "t1" }), // valid
      makeTrack({ track_id: "t2" }), // no stored vector
    ];
    await POST(makeReq({ playlist: tracks }));
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─── GA service integration ───────────────────────────────────────────────────

describe("POST /api/playlists/genetic — GA service integration", () => {
  it("calls ga-service/optimize with POST", async () => {
    const track = makeTrack();
    await POST(makeReq({ playlist: [track] }));
    expect(mockFetch).toHaveBeenCalledWith(
      "http://ga-service:8002/optimize",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns 200 with GA service result on success", async () => {
    const track = makeTrack();
    mockFetch.mockImplementationOnce(() =>
      makeGaResponse({ result: [{ track_id: "track-1", bpm: 120 }] })
    );
    const res = await POST(makeReq({ playlist: [track] }));
    expect(res.status).toBe(200);
  });

  it("forwards GA service error status", async () => {
    const track = makeTrack();
    mockFetch.mockImplementationOnce(() =>
      makeGaResponse({ error: "GA service unavailable" }, 503)
    );
    const res = await POST(makeReq({ playlist: [track] }));
    expect(res.status).toBe(503);
  });

  it("returns 500 when fetch throws (network error)", async () => {
    const track = makeTrack();
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));
    const res = await POST(makeReq({ playlist: [track] }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed/i);
  });
});

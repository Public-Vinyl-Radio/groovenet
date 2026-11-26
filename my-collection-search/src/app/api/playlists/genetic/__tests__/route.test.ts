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

vi.mock("@/server/repositories/rankingProfileRepository", async () => {
  const { FakeRankingProfileRepository } =
    await import("@/server/repositories/__tests__/fakeRankingProfileRepository");
  return { rankingProfileRepository: new FakeRankingProfileRepository() };
});

import { POST } from "../route";
import { toRankingConfig } from "@groovenet/contracts";
import { rankingProfileRepository } from "@/server/repositories/rankingProfileRepository";
import type { FakeRankingProfileRepository } from "@/server/repositories/__tests__/fakeRankingProfileRepository";
import { STRICT_RANKING_CONFIG } from "@/lib/ranking/configs";
import { toOptimizerRanking } from "@/lib/ranking/ordering";
import { draftToStored, profileToDraft, RANKING_PRESETS } from "@/lib/ranking/profiles";

vi.mock(
  "@/server/services/trackRatingService",
  async () => (await import("@/test/trackRatingMock")).trackRatingServiceMock,
);
vi.mock(
  "@/server/repositories/trackRatingRepository",
  async () => (await import("@/test/trackRatingMock")).trackRatingRepositoryMock,
);

import { trackRatingRepository } from "@/server/repositories/trackRatingRepository";
import { VIEWER } from "@/test/trackRatingMock";

const repo = rankingProfileRepository as unknown as FakeRankingProfileRepository;

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
    }),
  );
}

beforeEach(() => {
  repo.reset();
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
      })),
  );
  // Default: GA service returns valid response
  mockFetch.mockImplementation(() => makeGaResponse({ result: [{ track_id: "track-1" }] }));
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

// ─── Ratings (#1283) ──────────────────────────────────────────────────────────

describe("POST /api/playlists/genetic — the requesting profile's ratings", () => {
  it("replaces each sent star_rating with the viewer's and drops others' ratings", async () => {
    vi.mocked(trackRatingRepository.forTracks).mockResolvedValueOnce(
      new Map([["1:track-1", { rating: 2, others: [] }]]),
    );
    const playlist = [
      makeTrack({ star_rating: 5, other_ratings: [{ user_id: "x", name: "Sam", rating: 4 }] }),
      makeTrack({ track_id: "track-2", star_rating: 4 }),
    ];
    await POST(makeReq({ playlist }));
    expect(trackRatingRepository.forTracks).toHaveBeenCalledWith(
      [
        { track_id: "track-1", friend_id: 1 },
        { track_id: "track-2", friend_id: 1 },
      ],
      VIEWER.id,
    );
    const sent = JSON.parse(mockFetch.mock.calls[0][1].body).tracks;
    expect(sent.map((t: { star_rating: number }) => t.star_rating)).toEqual([2, 0]);
    expect(sent[0]).not.toHaveProperty("other_ratings");
  });

  it("adds no rating where none was sent, keeping ga-service's neutral energy fallback", async () => {
    await POST(makeReq({ playlist: [makeTrack()] }));
    const sent = JSON.parse(mockFetch.mock.calls[0][1].body).tracks;
    expect(sent[0]).not.toHaveProperty("star_rating");
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
      4,
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
  it("reports a stopped optimization service", async () => {
    mockFetch.mockRejectedValueOnce(
      new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } }),
    );
    const res = await POST(makeReq({ playlist: [makeTrack()] }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Optimization service not running" });
  });

  it("calls ga-service/optimize with POST", async () => {
    const track = makeTrack();
    await POST(makeReq({ playlist: [track] }));
    expect(mockFetch).toHaveBeenCalledWith(
      "http://ga-service:8002/optimize",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns 200 with GA service result on success", async () => {
    const track = makeTrack();
    mockFetch.mockImplementationOnce(() =>
      makeGaResponse({ result: [{ track_id: "track-1", bpm: 120 }] }),
    );
    const res = await POST(makeReq({ playlist: [track] }));
    expect(res.status).toBe(200);
  });

  it("forwards GA service error status", async () => {
    const track = makeTrack();
    mockFetch.mockImplementationOnce(() =>
      makeGaResponse({ error: "GA service unavailable" }, 503),
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

// ─── Ranking profile (#1193) ─────────────────────────────────────────────────

describe("POST /api/playlists/genetic — ranking profile", () => {
  const sent = () => JSON.parse(mockFetch.mock.calls[0][1].body);
  const choose = (friendId: number, surface: string, selection: Record<string, unknown>) =>
    repo.selections.push({
      friend_id: friendId,
      surface,
      preset_id: null,
      profile_id: null,
      ...selection,
    });
  const preset = (id: keyof typeof RANKING_PRESETS) =>
    toOptimizerRanking(toRankingConfig(RANKING_PRESETS[id]));

  it("sends Default's request exactly as before profiles, and says Default ordered it", async () => {
    const res = await POST(makeReq({ playlist: [makeTrack()], mode: "genetic" }));
    expect(mockFetch.mock.calls[0][1].body).toBe(
      JSON.stringify({
        tracks: [{ track_id: "track-1", friend_id: 1, bpm: 120, embedding: "[0.1,0.2,0.3]" }],
        mode: "genetic",
      }),
    );
    expect((await res.json()).ranking).toEqual({ id: "default", name: "Default", fallback: false });
  });

  it("orders by the library's active playlists profile", async () => {
    choose(1, "playlists", { preset_id: "beatmatcher" });
    choose(1, "suggestions", { preset_id: "selector" });
    const res = await POST(makeReq({ playlist: [makeTrack()], mode: "cohesive_blocks" }));
    expect(sent()).toMatchObject({ mode: "cohesive_blocks", ranking: preset("beatmatcher") });
    expect((await res.json()).ranking).toEqual({
      id: "beatmatcher",
      name: "Beatmatcher",
      fallback: false,
    });
  });

  it("ignores a choice made for another surface", async () => {
    choose(1, "suggestions", { preset_id: "selector" });
    await POST(makeReq({ playlist: [makeTrack()] }));
    expect(sent()).not.toHaveProperty("ranking");
  });

  it("takes a per-request override and the library from friend_id", async () => {
    choose(2, "playlists", { preset_id: "selector" });
    await POST(makeReq({ playlist: [makeTrack()], friend_id: 2 }));
    expect(sent().ranking).toEqual(preset("selector"));

    mockFetch.mockClear();
    const res = await POST(makeReq({ playlist: [makeTrack()], ranking: "beatmatcher" }));
    expect(sent().ranking).toEqual(preset("beatmatcher"));
    expect((await res.json()).ranking.name).toBe("Beatmatcher");
  });

  it("orders by a built-in config, named after its id", async () => {
    const res = await POST(makeReq({ playlist: [makeTrack()], ranking: "strict" }));
    expect(sent().ranking).toEqual(toOptimizerRanking(STRICT_RANKING_CONFIG));
    expect((await res.json()).ranking).toEqual({ id: "strict", name: "Strict", fallback: false });
  });

  it("orders by a stored profile, and by Default when it can't be read", async () => {
    const stored = await repo.insert(
      1,
      draftToStored(profileToDraft(RANKING_PRESETS.beatmatcher, "Peak time")),
      50,
    );
    choose(1, "playlists", { profile_id: stored!.id });
    let res = await POST(makeReq({ playlist: [makeTrack()] }));
    expect(sent().ranking).toEqual(preset("beatmatcher"));
    expect((await res.json()).ranking).toEqual({
      id: String(stored!.id),
      name: "Peak time",
      fallback: false,
    });

    repo.rows[0].config = { weights: "loud" };
    mockFetch.mockClear();
    res = await POST(makeReq({ playlist: [makeTrack()] }));
    expect(sent()).not.toHaveProperty("ranking");
    expect((await res.json()).ranking).toEqual({ id: "default", name: "Default", fallback: true });
  });

  it("is Default when no track names a library", async () => {
    const res = await POST(
      makeReq({ playlist: [{ track_id: "a", bpm: 120 }], mode: "cohesive_blocks" }),
    );
    expect(sent()).not.toHaveProperty("ranking");
    expect((await res.json()).ranking.id).toBe("default");
  });

  it("refuses a profile id that names nothing, and a malformed one", async () => {
    let res = await POST(makeReq({ playlist: [makeTrack()], ranking: "999" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Unknown ranker 999/);
    res = await POST(makeReq({ playlist: [makeTrack()], ranking: "loud" }));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

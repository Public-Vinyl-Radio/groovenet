import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const retriever = vi.hoisted(() => ({
  retrieveCandidates: vi.fn(),
  retrieveCandidatesForSeedTracks: vi.fn(),
  hasEmbeddings: vi.fn(),
  hasEmbeddingsForSeedTracks: vi.fn(),
  retrieveSeedMetadata: vi.fn(),
}));
vi.mock("@/lib/recommendation-candidate-retriever", () => retriever);

const genreContext = vi.hoisted(() => ({ loadGenreOverlapContext: vi.fn() }));
vi.mock("@/server/services/genreSimilarityService", () => genreContext);

// The real resolution rule, with the saved setting stubbed per test.
const savedScope = vi.hoisted(() => ({ value: "library" as "library" | "all" }));
const resolveScope = vi.hoisted(() =>
  vi.fn(async (libraryFriendId: number, requested?: "library" | "all") => {
    const scope = requested ?? savedScope.value;
    return { scope, libraryFriendId: scope === "library" ? libraryFriendId : null };
  }),
);
vi.mock("@/server/services/settingsService", () => ({
  settingsService: { resolveRecommendationScope: resolveScope },
}));

const profileRepo = vi.hoisted(() => ({
  listSelections: vi.fn(async (): Promise<unknown[]> => []),
  findById: vi.fn(async (): Promise<unknown> => null),
}));
vi.mock("@/server/repositories/rankingProfileRepository", () => ({
  rankingProfileRepository: profileRepo,
}));

import { GET, POST } from "../route";
import { setAnalyticsProvider } from "@/lib/analytics/server";
import { MemoryAnalyticsProvider } from "@/lib/analytics/providers/memory";
import { VIEWER } from "@/test/trackRatingMock";

vi.mock(
  "@/server/services/trackRatingService",
  async () => (await import("@/test/trackRatingMock")).trackRatingServiceMock,
);

const analyticsEvents = new MemoryAnalyticsProvider();
setAnalyticsProvider(analyticsEvents);

const candidate = (trackId: string) => ({
  trackId,
  friendId: 1,
  simIdentity: 0.9,
  simAudio: null,
  metadata: {
    title: "T",
    artist: "A",
    album: "B",
    year: "1999",
    genres: [],
    styles: [],
    tags: [],
    genreRefs: [],
    bpm: null,
    key: null,
    keyConfidence: null,
    tempoConfidence: null,
    eraBucket: null,
    energy: null,
    danceability: null,
    starRating: null,
    albumThumbnail: null,
    moodHappy: null,
    moodSad: null,
    moodRelaxed: null,
    moodAggressive: null,
  },
});

const result = (count: number) => ({
  seedTrackId: "seed",
  seedFriendId: 1,
  candidates: Array.from({ length: count }, (_, i) => candidate(`t${i}`)),
  stats: {
    identityCount: count,
    audioCount: 0,
    unionCount: count,
    timingMs: { identityQuery: 1, audioQuery: 0, total: 1 },
  },
});

describe("/api/recommendations/candidates — analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyticsEvents.reset();
    retriever.hasEmbeddings.mockResolvedValue({ identity: true, audio: false });
    retriever.hasEmbeddingsForSeedTracks.mockResolvedValue({ identity: true, audio: false });
  });

  it("reports a single-seed request with its mode and how many came back", async () => {
    retriever.retrieveCandidates.mockResolvedValue(result(3));
    const res = await GET(
      new NextRequest(
        "http://localhost/api/recommendations/candidates?track_id=seed&friend_id=1&mode=identity",
        { headers: { "X-Groovenet-Client": "mcp" } },
      ),
    );
    expect(res.status).toBe(200);
    expect(analyticsEvents.events.map((e) => [e.event, e.properties])).toEqual([
      [
        "recommendations_requested",
        { mode: "identity", seed_count: 1, result_count: 3, source: "mcp" },
      ],
    ]);
  });

  it("reports a batch request as combined, counting its seeds", async () => {
    retriever.retrieveCandidatesForSeedTracks.mockResolvedValue(result(5));
    const res = await POST(
      new NextRequest("http://localhost/api/recommendations/candidates", {
        method: "POST",
        body: JSON.stringify({
          tracks: [
            { track_id: "a", friend_id: 1 },
            { track_id: "b", friend_id: 1 },
          ],
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(analyticsEvents.events[0].properties).toEqual({
      mode: "combined",
      seed_count: 2,
      result_count: 5,
      source: "web",
    });
  });

  it("reports nothing when the seed has no embeddings", async () => {
    retriever.hasEmbeddings.mockResolvedValue({ identity: false, audio: false });
    const res = await GET(
      new NextRequest("http://localhost/api/recommendations/candidates?track_id=seed&friend_id=1"),
    );
    expect(res.status).toBe(404);
    expect(analyticsEvents.events).toEqual([]);
  });
});

describe("/api/recommendations/candidates — library scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savedScope.value = "library";
    retriever.hasEmbeddings.mockResolvedValue({ identity: true, audio: true });
    retriever.hasEmbeddingsForSeedTracks.mockResolvedValue({ identity: true, audio: true });
    retriever.retrieveCandidates.mockResolvedValue(result(1));
    retriever.retrieveCandidatesForSeedTracks.mockResolvedValue(result(1));
  });

  const get = (query: string) =>
    GET(
      new NextRequest(
        `http://localhost/api/recommendations/candidates?track_id=seed&friend_id=6&${query}`,
      ),
    );
  const post = (body: Record<string, unknown>) =>
    POST(
      new NextRequest("http://localhost/api/recommendations/candidates", {
        method: "POST",
        body: JSON.stringify({
          tracks: [
            { track_id: "a", friend_id: 6 },
            { track_id: "b", friend_id: 9 },
          ],
          ...body,
        }),
      }),
    );

  it("keeps to the seed's library by default and says so", async () => {
    const res = await get("");
    expect(resolveScope).toHaveBeenCalledWith(6, undefined);
    expect(retriever.retrieveCandidates).toHaveBeenCalledWith(
      "seed",
      6,
      expect.objectContaining({ libraryFriendId: 6 }),
    );
    expect(await res.json()).toMatchObject({ scope: "library", libraryFriendId: 6 });
  });

  it("follows a library's saved choice to search everything", async () => {
    savedScope.value = "all";
    const res = await get("library_friend_id=2");
    expect(resolveScope).toHaveBeenCalledWith(2, undefined);
    expect(retriever.retrieveCandidates).toHaveBeenCalledWith(
      "seed",
      6,
      expect.objectContaining({ libraryFriendId: undefined }),
    );
    expect(await res.json()).toMatchObject({ scope: "all", libraryFriendId: null });
  });

  it("lets the request override the saved setting, for the library it names", async () => {
    savedScope.value = "all";
    const res = await get("scope=library&library_friend_id=2");
    expect(resolveScope).toHaveBeenCalledWith(2, "library");
    expect(retriever.retrieveCandidates).toHaveBeenCalledWith(
      "seed",
      6,
      expect.objectContaining({ libraryFriendId: 2 }),
    );
    expect(await res.json()).toMatchObject({ scope: "library", libraryFriendId: 2 });
  });

  it("rejects an unknown scope", async () => {
    expect((await get("scope=everyone")).status).toBe(400);
    expect(retriever.retrieveCandidates).not.toHaveBeenCalled();
  });

  it("scopes a batch to the first seed's library unless told otherwise", async () => {
    const res = await post({});
    expect(resolveScope).toHaveBeenCalledWith(6, undefined);
    expect(retriever.retrieveCandidatesForSeedTracks).toHaveBeenCalledWith(
      [
        { trackId: "a", friendId: 6 },
        { trackId: "b", friendId: 9 },
      ],
      expect.objectContaining({ libraryFriendId: 6 }),
    );
    expect(await res.json()).toMatchObject({ scope: "library", libraryFriendId: 6 });
  });

  it("takes a batch's scope and library from the body", async () => {
    await post({ scope: "all", library_friend_id: 9 });
    expect(resolveScope).toHaveBeenCalledWith(9, "all");
    expect(retriever.retrieveCandidatesForSeedTracks).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ libraryFriendId: undefined }),
    );
  });
});

describe("/api/recommendations/candidates — ranking breakdown (#1191)", () => {
  const seedMetadata = {
    ...candidate("seed").metadata,
    bpm: 124,
    key: "8A",
  };
  const ranked = () => {
    const base = result(3);
    base.candidates[0] = { ...base.candidates[0], simIdentity: 0.5 };
    base.candidates[1] = {
      ...base.candidates[1],
      simIdentity: 0.6,
      metadata: { ...base.candidates[1].metadata, bpm: 124, key: "8A" } as never,
    };
    base.candidates[2] = {
      ...base.candidates[2],
      simIdentity: 0.9,
      metadata: { ...base.candidates[2].metadata, bpm: 140, key: "3B" } as never,
    };
    return base;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    savedScope.value = "library";
    retriever.hasEmbeddings.mockResolvedValue({ identity: true, audio: true });
    retriever.hasEmbeddingsForSeedTracks.mockResolvedValue({ identity: true, audio: true });
    retriever.retrieveCandidates.mockResolvedValue(ranked());
    retriever.retrieveCandidatesForSeedTracks.mockResolvedValue(ranked());
    retriever.retrieveSeedMetadata.mockResolvedValue(seedMetadata);
    genreContext.loadGenreOverlapContext.mockResolvedValue({
      similarity: new Map(),
      parentOf: new Map(),
    });
    profileRepo.listSelections.mockResolvedValue([]);
    profileRepo.findById.mockResolvedValue(null);
  });

  const get = (query = "") =>
    GET(
      new NextRequest(
        `http://localhost/api/recommendations/candidates?track_id=seed&friend_id=1${query}`,
      ),
    );
  const post = (body: Record<string, unknown>) =>
    POST(
      new NextRequest("http://localhost/api/recommendations/candidates", {
        method: "POST",
        body: JSON.stringify({
          tracks: [
            { track_id: "a", friend_id: 1 },
            { track_id: "last", friend_id: 2 },
          ],
          ...body,
        }),
      }),
    );

  it("leaves the response exactly as before without the flag", async () => {
    const body = await (await get()).json();
    expect(body).not.toHaveProperty("ranking");
    expect(body.candidates.every((c: object) => !("ranking" in c))).toBe(true);
    expect(body.candidates).toEqual(ranked().candidates);
    expect(retriever.retrieveSeedMetadata).not.toHaveBeenCalled();
    expect(genreContext.loadGenreOverlapContext).not.toHaveBeenCalled();
  });

  it("adds each candidate's breakdown without reordering or filtering", async () => {
    const res = await get("&breakdown=true");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(retriever.retrieveSeedMetadata).toHaveBeenCalledWith(
      { trackId: "seed", friendId: 1 },
      VIEWER.id,
    );
    expect(body.ranking).toEqual({
      config: "default",
      surface: "recommendations",
      seed: { trackId: "seed", friendId: 1 },
    });
    expect(body.candidates.map((c: { trackId: string }) => c.trackId)).toEqual(["t0", "t1", "t2"]);
    const [unknown, match, clash] = body.candidates.map(
      (c: { ranking: Record<string, unknown> }) => c.ranking,
    );
    // Identity 0.5 / 0.6 / 0.9 rank 0 / 0.5 / 1 within the pool (#1218).
    expect(unknown).toMatchObject({ score: 0, passed: true, failed: [], prior: null });
    expect(unknown.signals.identity_similarity).toMatchObject({ value: 0, detail: "raw 0.5000" });
    expect(match.score).toBeCloseTo(0.5 + 0.02 + 0.01, 12);
    expect(match.signals.key_relation).toEqual({
      value: 1,
      weight: 0.02,
      contribution: 0.02,
      detail: "same",
    });
    expect(clash).toMatchObject({ passed: false, failed: ["bpm_window", "key_rule"] });
  });

  it("scores with a named config", async () => {
    const body = await (await get("&breakdown=1&ranker=strict")).json();
    expect(body.ranking.config).toBe("strict");
    // No genres on the seed or the candidates: strict's genre floor rejects them all.
    expect(
      body.candidates.every((c: { ranking: { failed: string[] } }) =>
        c.ranking.failed.includes("genre_floor"),
      ),
    ).toBe(true);
  });

  it("scores against nothing when the seed row is gone", async () => {
    retriever.retrieveSeedMetadata.mockResolvedValue(null);
    const body = await (await get("&breakdown=true")).json();
    expect(body.candidates[1].ranking.signals.key_relation.value).toBeNull();
    expect(body.candidates[1].ranking.score).toBe(0.5);
  });

  it("rejects an unknown config", async () => {
    expect((await get("&breakdown=true&ranker=fastest")).status).toBe(400);
  });

  it("scores a batch against its last track", async () => {
    const body = await (await post({ breakdown: true, ranker: "mixable" })).json();
    expect(retriever.retrieveSeedMetadata).toHaveBeenCalledWith(
      { trackId: "last", friendId: 2 },
      VIEWER.id,
    );
    expect(body.ranking).toEqual({
      config: "mixable",
      surface: "recommendations",
      seed: { trackId: "last", friendId: 2 },
    });
    expect(body.candidates).toHaveLength(3);
  });

  const storedRow = (config: unknown) => ({
    id: 17,
    friend_id: 1,
    name: "Mine",
    description: "",
    surfaces: ["recommendations"],
    version: 2,
    config,
  });

  it("ranks with the library's active profile when no ranker is named (#1192)", async () => {
    profileRepo.listSelections.mockResolvedValue([
      { surface: "suggestions", preset_id: "selector", profile_id: null },
      { surface: "recommendations", preset_id: "beatmatcher", profile_id: null },
    ]);
    const body = await (await get("&breakdown=true&library_friend_id=4")).json();
    expect(profileRepo.listSelections).toHaveBeenCalledWith(4);
    expect(body.ranking.config).toBe("beatmatcher");
    expect(body.candidates[1].ranking.signals.key_relation.weight).toBe(0.3);
  });

  it("uses the seed's library for a batch's active profile", async () => {
    await post({ breakdown: true });
    expect(profileRepo.listSelections).toHaveBeenCalledWith(1);
  });

  it("ranks with an active stored profile", async () => {
    profileRepo.listSelections.mockResolvedValue([
      { surface: "recommendations", preset_id: null, profile_id: 17 },
    ]);
    profileRepo.findById.mockResolvedValue(storedRow({ weights: { rating: 1 }, constraints: {} }));
    const body = await (await get("&breakdown=true")).json();
    expect(body.ranking).toMatchObject({ config: "17" });
    expect(body.ranking).not.toHaveProperty("fallback");
    expect(body.candidates[0].ranking.score).toBe(0);
  });

  it("accepts a stored profile id as the ranker", async () => {
    profileRepo.findById.mockResolvedValue(storedRow({ weights: { identity_similarity: 2 } }));
    const body = await (await get("&breakdown=true&ranker=17")).json();
    expect(profileRepo.findById).toHaveBeenCalledWith(17);
    expect(body.ranking.config).toBe("17");
    expect(body.candidates[2].ranking.score).toBe(2);
  });

  it("falls back to Default for a stored profile that can't be read", async () => {
    profileRepo.findById.mockResolvedValue(storedRow({ weights: { plays: 1 } }));
    const res = await get("&breakdown=true&ranker=17");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ranking).toMatchObject({ config: "17", fallback: true });
    expect(body.candidates[1].ranking.score).toBeCloseTo(0.53, 12);
  });

  it("falls back to Default when the active stored profile is gone", async () => {
    profileRepo.listSelections.mockResolvedValue([
      { surface: "recommendations", preset_id: null, profile_id: 17 },
    ]);
    const body = await (await get("&breakdown=true")).json();
    expect(body.ranking).toMatchObject({ config: "17", fallback: true });
  });

  it("scores a batch with an inline config, for an unsaved profile's preview", async () => {
    const body = await (
      await post({
        breakdown: true,
        ranker: "999",
        ranking_config: { version: 2, id: "draft", weights: { identity_similarity: 2 } },
      })
    ).json();
    expect(profileRepo.findById).not.toHaveBeenCalled();
    expect(body.ranking.config).toBe("draft");
    expect(body.candidates[2].ranking.score).toBe(2);
  });

  it("rejects an invalid inline config", async () => {
    const res = await post({
      breakdown: true,
      ranking_config: { version: 2, id: "draft", weights: { identity_similarity: 1e6 } },
    });
    expect(res.status).toBe(400);
  });

  it("rejects a stored profile id that names nothing", async () => {
    const res = await get("&breakdown=true&ranker=999");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Unknown ranker 999");
    const batch = await post({ breakdown: true, ranker: "999" });
    expect(batch.status).toBe(400);
  });

  it("is a 500 for any other failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    retriever.retrieveCandidates.mockRejectedValueOnce(new Error("db down"));
    retriever.retrieveCandidatesForSeedTracks.mockRejectedValueOnce("db down");
    const single = await get("&breakdown=true");
    expect(single.status).toBe(500);
    expect((await single.json()).message).toBe("db down");
    expect((await post({ breakdown: true })).status).toBe(500);
    spy.mockRestore();
  });

  it("leaves a batch response unchanged without the flag", async () => {
    const body = await (await post({})).json();
    expect(body).not.toHaveProperty("ranking");
    expect(retriever.retrieveSeedMetadata).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const retriever = vi.hoisted(() => ({
  retrieveCandidates: vi.fn(),
  retrieveCandidatesForSeedTracks: vi.fn(),
  hasEmbeddings: vi.fn(),
  hasEmbeddingsForSeedTracks: vi.fn(),
}));
vi.mock("@/lib/recommendation-candidate-retriever", () => retriever);

// The real resolution rule, with the saved setting stubbed per test.
const savedScope = vi.hoisted(() => ({ value: "library" as "library" | "all" }));
const resolveScope = vi.hoisted(() =>
  vi.fn(async (libraryFriendId: number, requested?: "library" | "all") => {
    const scope = requested ?? savedScope.value;
    return { scope, libraryFriendId: scope === "library" ? libraryFriendId : null };
  })
);
vi.mock("@/server/services/settingsService", () => ({
  settingsService: { resolveRecommendationScope: resolveScope },
}));

import { GET, POST } from "../route";
import { setAnalyticsProvider } from "@/lib/analytics/server";
import { MemoryAnalyticsProvider } from "@/lib/analytics/providers/memory";

const analyticsEvents = new MemoryAnalyticsProvider();
setAnalyticsProvider(analyticsEvents);

const candidate = (trackId: string) => ({
  trackId,
  friendId: 1,
  simIdentity: 0.9,
  simAudio: null,
  metadata: {
    title: "T", artist: "A", album: "B", year: "1999", genres: [], styles: [], tags: [], genreRefs: [],
    bpm: null, key: null, keyConfidence: null, tempoConfidence: null, eraBucket: null,
    energy: null, danceability: null, starRating: null, albumThumbnail: null,
    moodHappy: null, moodSad: null, moodRelaxed: null, moodAggressive: null,
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
        { headers: { "X-Groovenet-Client": "mcp" } }
      )
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
      })
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
      new NextRequest(
        "http://localhost/api/recommendations/candidates?track_id=seed&friend_id=1"
      )
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
    GET(new NextRequest(`http://localhost/api/recommendations/candidates?track_id=seed&friend_id=6&${query}`));
  const post = (body: Record<string, unknown>) =>
    POST(
      new NextRequest("http://localhost/api/recommendations/candidates", {
        method: "POST",
        body: JSON.stringify({ tracks: [{ track_id: "a", friend_id: 6 }, { track_id: "b", friend_id: 9 }], ...body }),
      })
    );

  it("keeps to the seed's library by default and says so", async () => {
    const res = await get("");
    expect(resolveScope).toHaveBeenCalledWith(6, undefined);
    expect(retriever.retrieveCandidates).toHaveBeenCalledWith("seed", 6, expect.objectContaining({ libraryFriendId: 6 }));
    expect(await res.json()).toMatchObject({ scope: "library", libraryFriendId: 6 });
  });

  it("follows a library's saved choice to search everything", async () => {
    savedScope.value = "all";
    const res = await get("library_friend_id=2");
    expect(resolveScope).toHaveBeenCalledWith(2, undefined);
    expect(retriever.retrieveCandidates).toHaveBeenCalledWith("seed", 6, expect.objectContaining({ libraryFriendId: undefined }));
    expect(await res.json()).toMatchObject({ scope: "all", libraryFriendId: null });
  });

  it("lets the request override the saved setting, for the library it names", async () => {
    savedScope.value = "all";
    const res = await get("scope=library&library_friend_id=2");
    expect(resolveScope).toHaveBeenCalledWith(2, "library");
    expect(retriever.retrieveCandidates).toHaveBeenCalledWith("seed", 6, expect.objectContaining({ libraryFriendId: 2 }));
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
      [{ trackId: "a", friendId: 6 }, { trackId: "b", friendId: 9 }],
      expect.objectContaining({ libraryFriendId: 6 })
    );
    expect(await res.json()).toMatchObject({ scope: "library", libraryFriendId: 6 });
  });

  it("takes a batch's scope and library from the body", async () => {
    await post({ scope: "all", library_friend_id: 9 });
    expect(resolveScope).toHaveBeenCalledWith(9, "all");
    expect(retriever.retrieveCandidatesForSeedTracks).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ libraryFriendId: undefined })
    );
  });
});

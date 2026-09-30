import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const retriever = vi.hoisted(() => ({
  retrieveCandidates: vi.fn(),
  retrieveCandidatesForSeedTracks: vi.fn(),
  hasEmbeddings: vi.fn(),
  hasEmbeddingsForSeedTracks: vi.fn(),
}));
vi.mock("@/lib/recommendation-candidate-retriever", () => retriever);

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
    title: "T", artist: "A", album: "B", year: "1999", genres: [], styles: [], tags: [],
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

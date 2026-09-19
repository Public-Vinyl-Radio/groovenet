import { vi, describe, it, expect, beforeEach } from "vitest";

const {
  mockFindTrack,
  mockUpdateTrack,
  mockUpdateEmbedding,
  mockGetTrackEmbedding,
  mockGenerateIdentityEmbedding,
  mockGenerateAudioVibeEmbedding,
  mockPostHogCapture,
} = vi.hoisted(() => {
  return {
    mockFindTrack: vi.fn(),
    mockUpdateTrack: vi.fn(),
    mockUpdateEmbedding: vi.fn().mockResolvedValue(undefined),
    mockGetTrackEmbedding: vi.fn().mockResolvedValue([0.1, 0.2]),
    mockGenerateIdentityEmbedding: vi.fn().mockResolvedValue({ updated: true }),
    mockGenerateAudioVibeEmbedding: vi.fn().mockResolvedValue({ updated: true }),
    mockPostHogCapture: vi.fn(),
  };
});

vi.mock("@/server/repositories/trackRepository", () => ({
  trackRepository: {
    findTrackByTrackIdAndFriendId: mockFindTrack,
    updateTrackFields: mockUpdateTrack,
    updateTrackEmbedding: mockUpdateEmbedding,
  },
}));

vi.mock("@/lib/track-embedding", () => ({
  getTrackEmbedding: mockGetTrackEmbedding,
}));

vi.mock("@/lib/identity-embedding", () => ({
  generateAndStoreIdentityEmbedding: mockGenerateIdentityEmbedding,
}));

vi.mock("@/lib/audio-vibe-embedding", () => ({
  generateAndStoreAudioVibeEmbedding: mockGenerateAudioVibeEmbedding,
}));

vi.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: mockPostHogCapture }),
}));

import { PATCH } from "../../route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: unknown) {
  return new Request("http://localhost/api/tracks", {
    method: "PATCH",
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
    bpm: 120,
    key: "A minor",
    danceability: 0.8,
    mood_happy: 0.5,
    notes: "",
    local_tags: "",
    styles: ["Deep House"],
    genres: ["Electronic"],
    star_rating: 3,
    ...overrides,
  };
}

const PATCH_BODY = { track_id: "t1", friend_id: 1 };

beforeEach(() => {
  mockFindTrack.mockReset();
  mockUpdateTrack.mockReset();
  mockUpdateEmbedding.mockReset();
  mockGetTrackEmbedding.mockReset();
  mockGenerateIdentityEmbedding.mockReset();
  mockGenerateAudioVibeEmbedding.mockReset();
  mockPostHogCapture.mockReset();

  mockUpdateEmbedding.mockResolvedValue(undefined);
  mockGetTrackEmbedding.mockResolvedValue([0.1, 0.2]);
  mockGenerateIdentityEmbedding.mockResolvedValue({ updated: true });
  mockGenerateAudioVibeEmbedding.mockResolvedValue({ updated: true });
});

// ─── Track not found ──────────────────────────────────────────────────────────

describe("PATCH /api/tracks — track not found", () => {
  it("returns 404 when updateTrackFields returns null", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack());
    mockUpdateTrack.mockResolvedValueOnce(null);
    const res = await PATCH(makeReq(PATCH_BODY));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });
});

// ─── shouldUpdateEmbedding — scalar fields ────────────────────────────────────

describe("PATCH /api/tracks — embedding update (scalar fields)", () => {
  it("regenerates embedding when bpm changes", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ bpm: 120 }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ bpm: 130 }));
    await PATCH(makeReq(PATCH_BODY));
    expect(mockGetTrackEmbedding).toHaveBeenCalledOnce();
    expect(mockUpdateEmbedding).toHaveBeenCalledOnce();
    expect(mockGenerateAudioVibeEmbedding).toHaveBeenCalledOnce();
  });

  it("regenerates embedding when key changes", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ key: "A minor" }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ key: "C major" }));
    await PATCH(makeReq(PATCH_BODY));
    expect(mockGetTrackEmbedding).toHaveBeenCalledOnce();
  });

  it("regenerates embedding when notes changes", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ notes: "" }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ notes: "Great track" }));
    await PATCH(makeReq(PATCH_BODY));
    expect(mockGetTrackEmbedding).toHaveBeenCalledOnce();
  });

  it("regenerates embedding when danceability changes", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ danceability: 0.5 }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ danceability: 0.9 }));
    await PATCH(makeReq(PATCH_BODY));
    expect(mockGetTrackEmbedding).toHaveBeenCalledOnce();
  });

  it("does NOT regenerate embedding when only star_rating changes", async () => {
    const current = baseTrack({ star_rating: 3 });
    const updated = baseTrack({ star_rating: 5 });
    mockFindTrack.mockResolvedValueOnce(current);
    mockUpdateTrack.mockResolvedValueOnce(updated);
    await PATCH(makeReq(PATCH_BODY));
    expect(mockGetTrackEmbedding).not.toHaveBeenCalled();
    expect(mockUpdateEmbedding).not.toHaveBeenCalled();
    expect(mockGenerateIdentityEmbedding).not.toHaveBeenCalled();
    expect(mockGenerateAudioVibeEmbedding).not.toHaveBeenCalled();
  });

  it("does NOT regenerate embedding when only title changes", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ title: "Old Title" }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ title: "New Title" }));
    await PATCH(makeReq(PATCH_BODY));
    expect(mockGetTrackEmbedding).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/tracks — track_embeddings updates", () => {
  it("regenerates identity embedding when identity fields change", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ title: "Old Title" }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ title: "New Title" }));
    await PATCH(makeReq(PATCH_BODY));
    expect(mockGenerateIdentityEmbedding).toHaveBeenCalledWith("t1", 1);
    expect(mockGenerateAudioVibeEmbedding).not.toHaveBeenCalled();
  });

  it("regenerates audio vibe embedding when audio fields change", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ mood_happy: 0.2 }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ mood_happy: 0.7 }));
    await PATCH(makeReq(PATCH_BODY));
    expect(mockGenerateAudioVibeEmbedding).toHaveBeenCalledWith("t1", 1);
  });
});

// ─── shouldUpdateEmbedding — array fields ─────────────────────────────────────

describe("PATCH /api/tracks — embedding update (array fields)", () => {
  it("regenerates embedding when styles array changes", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ styles: ["Deep House"] }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ styles: ["Tech House"] }));
    await PATCH(makeReq(PATCH_BODY));
    expect(mockGetTrackEmbedding).toHaveBeenCalledOnce();
  });

  it("regenerates embedding when genres array changes", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ genres: ["Electronic"] }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ genres: ["House"] }));
    await PATCH(makeReq(PATCH_BODY));
    expect(mockGetTrackEmbedding).toHaveBeenCalledOnce();
  });

  it("does NOT regenerate embedding when array content is identical", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ styles: ["Deep House", "Tech House"] }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ styles: ["Deep House", "Tech House"] }));
    await PATCH(makeReq(PATCH_BODY));
    expect(mockGetTrackEmbedding).not.toHaveBeenCalled();
  });

  it("regenerates embedding when local_tags changes", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ local_tags: "crate1" }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ local_tags: "crate1,crate2" }));
    await PATCH(makeReq(PATCH_BODY));
    expect(mockGetTrackEmbedding).toHaveBeenCalledOnce();
  });
});

// ─── Response ─────────────────────────────────────────────────────────────────

describe("PATCH /api/tracks — response", () => {
  it("returns 200 with the updated track", async () => {
    const updated = baseTrack({ star_rating: 5, title: "Updated Title" });
    mockFindTrack.mockResolvedValueOnce(baseTrack());
    mockUpdateTrack.mockResolvedValueOnce(updated);
    const res = await PATCH(makeReq(PATCH_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.star_rating).toBe(5);
    expect(body.title).toBe("Updated Title");
  });

  it("returns 500 when repository throws", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack());
    mockUpdateTrack.mockRejectedValueOnce(new Error("DB error"));
    const res = await PATCH(makeReq(PATCH_BODY));
    expect(res.status).toBe(500);
  });
});

// ─── No-op change ─────────────────────────────────────────────────────────────

describe("PATCH /api/tracks — no embedding-relevant change", () => {
  it("regenerates nothing when current and updated are identical", async () => {
    const track = baseTrack();
    mockFindTrack.mockResolvedValueOnce(track);
    mockUpdateTrack.mockResolvedValueOnce(baseTrack());
    const res = await PATCH(makeReq(PATCH_BODY));
    expect(res.status).toBe(200);
    expect(mockGetTrackEmbedding).not.toHaveBeenCalled();
    expect(mockUpdateEmbedding).not.toHaveBeenCalled();
    expect(mockGenerateIdentityEmbedding).not.toHaveBeenCalled();
    expect(mockGenerateAudioVibeEmbedding).not.toHaveBeenCalled();
  });
});

// ─── Error swallowing (side effects must not fail the request) ─────────────────

describe("PATCH /api/tracks — side-effect errors are swallowed", () => {
  it("still returns 200 when prompt embedding generation throws", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ notes: "" }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ notes: "changed" }));
    mockGetTrackEmbedding.mockRejectedValueOnce(new Error("embed fail"));
    const res = await PATCH(makeReq(PATCH_BODY));
    expect(res.status).toBe(200);
    expect(mockUpdateEmbedding).not.toHaveBeenCalled();
  });

  it("still returns 200 when updateTrackEmbedding throws", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ notes: "" }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ notes: "changed" }));
    mockUpdateEmbedding.mockRejectedValueOnce(new Error("store fail"));
    const res = await PATCH(makeReq(PATCH_BODY));
    expect(res.status).toBe(200);
  });

  it("still returns 200 when identity embedding generation throws", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ title: "Old" }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ title: "New" }));
    mockGenerateIdentityEmbedding.mockRejectedValueOnce(new Error("identity fail"));
    const res = await PATCH(makeReq(PATCH_BODY));
    expect(res.status).toBe(200);
  });

  it("still returns 200 when audio vibe embedding generation throws", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ mood_happy: 0.2 }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ mood_happy: 0.9 }));
    mockGenerateAudioVibeEmbedding.mockRejectedValueOnce(new Error("vibe fail"));
    const res = await PATCH(makeReq(PATCH_BODY));
    expect(res.status).toBe(200);
  });

  it("still returns 200 when PostHog capture throws", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack());
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ star_rating: 5 }));
    mockPostHogCapture.mockImplementationOnce(() => {
      throw new Error("posthog fail");
    });
    const res = await PATCH(makeReq(PATCH_BODY));
    expect(res.status).toBe(200);
  });
});

// ─── Analytics ────────────────────────────────────────────────────────────────

describe("PATCH /api/tracks — PostHog analytics", () => {
  it("captures track_edited with changed fields excluding identifiers", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack());
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ star_rating: 5, notes: "hi" }));
    await PATCH(
      makeReq({ track_id: "t1", friend_id: 1, star_rating: 5, notes: "hi" })
    );
    expect(mockPostHogCapture).toHaveBeenCalledOnce();
    const arg = mockPostHogCapture.mock.calls[0][0];
    expect(arg.event).toBe("track_edited");
    expect(arg.properties.track_id).toBe("t1");
    expect(arg.properties.changed_fields).toEqual(
      expect.arrayContaining(["star_rating", "notes"])
    );
    expect(arg.properties.changed_fields).not.toContain("track_id");
    expect(arg.properties.changed_fields).not.toContain("friend_id");
    expect(arg.properties.has_rating_change).toBe(true);
    expect(arg.properties.has_notes_change).toBe(true);
    expect(arg.properties.has_tags_change).toBe(false);
  });
});

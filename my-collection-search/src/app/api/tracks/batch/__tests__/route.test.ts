import { vi, describe, it, expect, beforeEach } from "vitest";

const mockFindTracks = vi.hoisted(() => vi.fn());

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

describe("POST /api/tracks/batch — vector flag", () => {
  it("passes hasVectors through and never returns raw vectors", async () => {
    mockFindTracks.mockResolvedValueOnce([baseTrack({ hasVectors: true })]);
    const res = await POST(makeReq({ tracks: [{ track_id: "t1", friend_id: 1 }] }));
    const [track] = await res.json();
    expect(track.hasVectors).toBe(true);
    expect(track._vectors).toBeUndefined();
    expect(track.embedding).toBeUndefined();
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

import { vi, describe, it, expect, beforeEach } from "vitest";

const { mockFindTrack, mockUpdateTrack, mockEnqueue, mockStartFingerprintRun } =
  vi.hoisted(() => {
    return {
      mockFindTrack: vi.fn(),
      mockUpdateTrack: vi.fn(),
      mockEnqueue: vi.fn().mockResolvedValue(undefined),
      mockStartFingerprintRun: vi.fn().mockResolvedValue({ run_id: "run-1" }),
    };
  });

vi.mock("@/server/repositories/trackRepository", () => ({
  trackRepository: {
    findTrackByTrackIdAndFriendId: mockFindTrack,
    updateTrackFields: mockUpdateTrack,
  },
}));

vi.mock("@/server/services/embeddingQueueService", () => ({
  embeddingQueueService: { enqueue: mockEnqueue },
}));

vi.mock("@/server/services/fingerprintIndexService", () => ({
  fingerprintIndexService: { startRun: mockStartFingerprintRun },
}));

import { PATCH } from "../../route";
import { setAnalyticsProvider } from "@/lib/analytics/server";
import { MemoryAnalyticsProvider } from "@/lib/analytics/providers/memory";

const analyticsEvents = new MemoryAnalyticsProvider();
setAnalyticsProvider(analyticsEvents);

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

/** Job kinds enqueued by the most recent `enqueue` call, order-independent. */
function enqueuedKinds(): string[] {
  if (mockEnqueue.mock.calls.length === 0) return [];
  const jobs = mockEnqueue.mock.calls[mockEnqueue.mock.calls.length - 1][0] as Array<{
    kind: string;
  }>;
  return jobs.map((job) => job.kind);
}

beforeEach(() => {
  mockFindTrack.mockReset();
  mockUpdateTrack.mockReset();
  mockEnqueue.mockReset();
  analyticsEvents.reset();
  mockStartFingerprintRun.mockReset();

  mockEnqueue.mockResolvedValue(undefined);
  mockStartFingerprintRun.mockResolvedValue({ run_id: "run-1" });
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

describe("PATCH /api/tracks — embedding queueing (scalar fields)", () => {
  it("enqueues an audio-vibe job when bpm changes", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ bpm: 120 }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ bpm: 130 }));
    await PATCH(makeReq(PATCH_BODY));
    expect(mockEnqueue).toHaveBeenCalledOnce();
    expect(enqueuedKinds()).toEqual(["audio_vibe"]);
  });

  it("enqueues an audio-vibe job when key changes", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ key: "A minor" }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ key: "C major" }));
    await PATCH(makeReq(PATCH_BODY));
    expect(enqueuedKinds()).toContain("audio_vibe");
  });

  it("enqueues nothing when only notes changes", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ notes: "" }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ notes: "Great track" }));
    await PATCH(makeReq(PATCH_BODY));
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("enqueues an audio-vibe job when danceability changes", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ danceability: 0.5 }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ danceability: 0.9 }));
    await PATCH(makeReq(PATCH_BODY));
    expect(enqueuedKinds()).toContain("audio_vibe");
  });

  it("enqueues nothing when only star_rating changes", async () => {
    const current = baseTrack({ star_rating: 3 });
    const updated = baseTrack({ star_rating: 5 });
    mockFindTrack.mockResolvedValueOnce(current);
    mockUpdateTrack.mockResolvedValueOnce(updated);
    await PATCH(makeReq(PATCH_BODY));
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("enqueues no audio-vibe job when only title changes", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ title: "Old Title" }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ title: "New Title" }));
    await PATCH(makeReq(PATCH_BODY));
    expect(enqueuedKinds()).toEqual(["identity", "context"]);
  });
});

describe("PATCH /api/tracks — track_embeddings updates", () => {
  it("enqueues identity and context jobs when identity fields change", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ title: "Old Title" }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ title: "New Title" }));
    await PATCH(makeReq(PATCH_BODY));
    // The context text (#408) is built from the same inputs as identity.
    expect(mockEnqueue).toHaveBeenCalledWith([
      { track_id: "t1", friend_id: 1, kind: "identity" },
      { track_id: "t1", friend_id: 1, kind: "context" },
    ]);
  });

  it("enqueues an audio-vibe job when audio fields change", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ mood_happy: 0.2 }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ mood_happy: 0.7 }));
    await PATCH(makeReq(PATCH_BODY));
    expect(enqueuedKinds()).toContain("audio_vibe");
  });
});

// ─── shouldUpdateEmbedding — array fields ─────────────────────────────────────

describe("PATCH /api/tracks — embedding queueing (array fields)", () => {
  it("enqueues an identity job when styles array changes", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ styles: ["Deep House"] }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ styles: ["Tech House"] }));
    await PATCH(makeReq(PATCH_BODY));
    expect(enqueuedKinds()).toContain("identity");
  });

  it("enqueues an identity job when genres array changes", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ genres: ["Electronic"] }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ genres: ["House"] }));
    await PATCH(makeReq(PATCH_BODY));
    expect(enqueuedKinds()).toContain("identity");
  });

  it("enqueues nothing when array content is identical", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ styles: ["Deep House", "Tech House"] }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ styles: ["Deep House", "Tech House"] }));
    await PATCH(makeReq(PATCH_BODY));
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("enqueues an identity job when local_tags changes", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ local_tags: "crate1" }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ local_tags: "crate1,crate2" }));
    await PATCH(makeReq(PATCH_BODY));
    expect(enqueuedKinds()).toContain("identity");
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
  it("enqueues nothing when current and updated are identical", async () => {
    const track = baseTrack();
    mockFindTrack.mockResolvedValueOnce(track);
    mockUpdateTrack.mockResolvedValueOnce(baseTrack());
    const res = await PATCH(makeReq(PATCH_BODY));
    expect(res.status).toBe(200);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

// ─── Error swallowing (side effects must not fail the request) ─────────────────

describe("PATCH /api/tracks — side-effect errors are swallowed", () => {
  it("still returns 200 when enqueueing throws", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ title: "Old" }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ title: "changed" }));
    mockEnqueue.mockRejectedValueOnce(new Error("redis down"));
    const res = await PATCH(makeReq(PATCH_BODY));
    expect(res.status).toBe(200);
  });

  it("still returns 200 when the analytics provider throws", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack());
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ star_rating: 5 }));
    const track = vi.spyOn(analyticsEvents, "track").mockImplementationOnce(() => {
      throw new Error("analytics fail");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await PATCH(makeReq(PATCH_BODY));
    expect(res.status).toBe(200);
    track.mockRestore();
    warn.mockRestore();
  });
});

// ─── Fingerprint index trigger (#303) ──────────────────────────────────────────

describe("PATCH /api/tracks — fingerprint index trigger", () => {
  it("queues a fingerprint index run when local_audio_url goes from null to a value", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ local_audio_url: null }));
    mockUpdateTrack.mockResolvedValueOnce(
      baseTrack({ local_audio_url: "artist - title.m4a" })
    );
    await PATCH(makeReq(PATCH_BODY));
    expect(mockStartFingerprintRun).toHaveBeenCalledWith({
      kind: "track",
      track_id: "t1",
      friend_id: 1,
    });
  });

  it("does not queue a run when local_audio_url is unchanged", async () => {
    mockFindTrack.mockResolvedValueOnce(
      baseTrack({ local_audio_url: "artist - title.m4a" })
    );
    mockUpdateTrack.mockResolvedValueOnce(
      baseTrack({ local_audio_url: "artist - title.m4a" })
    );
    await PATCH(makeReq(PATCH_BODY));
    expect(mockStartFingerprintRun).not.toHaveBeenCalled();
  });

  it("does not queue a run when neither side has audio", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ local_audio_url: null }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ local_audio_url: null }));
    await PATCH(makeReq(PATCH_BODY));
    expect(mockStartFingerprintRun).not.toHaveBeenCalled();
  });

  it("queues a single-track run when an existing file is replaced (#303)", async () => {
    // The "missing" backfill never re-checks a track that already has a
    // fingerprint; a replaced file used to leave the index on the old audio.
    mockFindTrack.mockResolvedValueOnce(baseTrack({ local_audio_url: "old.m4a" }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ local_audio_url: "new.m4a" }));
    await PATCH(makeReq(PATCH_BODY));
    expect(mockStartFingerprintRun).toHaveBeenCalledWith({
      kind: "track",
      track_id: "t1",
      friend_id: 1,
    });
  });

  it("still returns 200 when queuing the fingerprint run throws", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ local_audio_url: null }));
    mockUpdateTrack.mockResolvedValueOnce(
      baseTrack({ local_audio_url: "artist - title.m4a" })
    );
    mockStartFingerprintRun.mockRejectedValueOnce(new Error("no engine registered"));
    const res = await PATCH(makeReq(PATCH_BODY));
    expect(res.status).toBe(200);
  });
});

// ─── Analytics ────────────────────────────────────────────────────────────────

describe("PATCH /api/tracks — analytics", () => {
  it("captures track_edited with changed fields excluding identifiers", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack());
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ star_rating: 5, notes: "hi" }));
    await PATCH(
      makeReq({ track_id: "t1", friend_id: 1, star_rating: 5, notes: "hi" })
    );
    expect(analyticsEvents.events).toHaveLength(1);
    const arg = analyticsEvents.events[0];
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

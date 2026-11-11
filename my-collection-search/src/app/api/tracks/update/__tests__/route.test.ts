import { vi, describe, it, expect, beforeEach } from "vitest";

const {
  mockFindTrack,
  mockUpdateTrack,
  mockEnqueue,
  mockStartFingerprintRun,
  mockResolveGenres,
  mockReplaceGenres,
  mockSyncIsrc,
} = vi.hoisted(() => {
  return {
    mockSyncIsrc: vi.fn().mockResolvedValue(undefined),
    mockResolveGenres: vi.fn(),
    mockReplaceGenres: vi.fn().mockResolvedValue(undefined),
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

vi.mock("@/server/repositories/trackGenreRepository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/repositories/trackGenreRepository")>()),
  trackGenreRepository: {
    resolveGenreRefs: mockResolveGenres,
    replaceTrackGenres: mockReplaceGenres,
  },
}));

vi.mock("@/server/services/embeddingQueueService", () => ({
  embeddingQueueService: { enqueue: mockEnqueue },
}));

vi.mock("@/server/services/isrcService", () => ({
  isrcService: { syncForLinkChange: mockSyncIsrc },
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
  mockResolveGenres.mockReset();
  mockReplaceGenres.mockReset();

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

// ─── Request validation (#596) ───────────────────────────────────────────────

describe("PATCH /api/tracks — request validation", () => {
  function rawReq(body: string) {
    return new Request("http://localhost/api/tracks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    });
  }

  it("returns 400 for a body that is not JSON", async () => {
    const res = await PATCH(rawReq("not json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON body");
    expect(mockUpdateTrack).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing track_id", { friend_id: 1 }],
    ["an empty track_id", { track_id: "", friend_id: 1 }],
    ["a missing friend_id", { track_id: "t1" }],
    ["a non-numeric friend_id", { track_id: "t1", friend_id: "abc" }],
    ["a zero friend_id", { track_id: "t1", friend_id: 0 }],
    ["a body that is not an object", [1, 2]],
  ])("returns 400 for %s, before reading the track", async (_label, body) => {
    const res = await PATCH(makeReq(body));
    expect(res.status).toBe(400);
    expect(mockFindTrack).not.toHaveBeenCalled();
    expect(mockUpdateTrack).not.toHaveBeenCalled();
  });

  it("names the identity fields in the 400", async () => {
    const res = await PATCH(makeReq({ friend_id: 1 }));
    const body = await res.json();
    expect(body.error).toBe("track_id and friend_id are required");
    expect(body.details).toBeDefined();
  });

  it.each([
    ["genres", { genres: "cumbia" }, "genres must be an array of genre ids or names"],
    ["genres entries", { genres: [1] }, "genres must be an array of genre ids or names"],
    ["descriptors", { descriptors: [null] }, "descriptors must be an array of strings"],
    [
      "genre_source",
      { genre_source: "reconciliation" },
      "genre_source must be 'manual' or 'enrichment'",
    ],
  ])("returns 400 for malformed %s", async (_label, extra, message) => {
    const res = await PATCH(makeReq({ ...PATCH_BODY, ...extra }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(message);
    expect(mockResolveGenres).not.toHaveBeenCalled();
    expect(mockUpdateTrack).not.toHaveBeenCalled();
  });

  it("accepts a numeric-string friend_id and passes the number on", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack());
    mockUpdateTrack.mockResolvedValueOnce(baseTrack());
    const res = await PATCH(makeReq({ track_id: "t1", friend_id: "1", notes: "x" }));
    expect(res.status).toBe(200);
    expect(mockUpdateTrack).toHaveBeenCalledWith({ track_id: "t1", friend_id: 1, notes: "x" });
  });

  it("leaves the scalar columns unchecked and passes them to the repository", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack());
    mockUpdateTrack.mockResolvedValueOnce(baseTrack());
    const res = await PATCH(makeReq({ ...PATCH_BODY, bpm: "128", star_rating: null, extra: 1 }));
    expect(res.status).toBe(200);
    expect(mockUpdateTrack).toHaveBeenCalledWith({
      ...PATCH_BODY,
      bpm: "128",
      star_rating: null,
      extra: 1,
    });
  });
});

// ─── Track genres and descriptors (#371) ──────────────────────────────────────

describe("PATCH /api/tracks — genres and descriptors", () => {
  const CUMBIA = "2b7c1f3e-8f4a-4d6b-9c1e-0a1b2c3d4e5f";

  it("resolves genres, replaces the links and returns the re-read track", async () => {
    mockResolveGenres.mockResolvedValueOnce({ ids: [CUMBIA], unknown: [] });
    mockFindTrack.mockResolvedValueOnce(baseTrack());
    const genres = [{ id: CUMBIA, name: "Psychedelic Cumbia" }];
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ track_genres: genres }));

    const res = await PATCH(makeReq({ ...PATCH_BODY, genres: ["psychedelic cumbia"] }));

    expect(res.status).toBe(200);
    expect((await res.json()).track_genres).toEqual(genres);
    expect(mockResolveGenres).toHaveBeenCalledWith(["psychedelic cumbia"]);
    expect(mockReplaceGenres).toHaveBeenCalledWith("t1", 1, [CUMBIA], "manual");
    // Genres are not a column: they must not reach the field update.
    expect(mockUpdateTrack).toHaveBeenCalledWith({ track_id: "t1", friend_id: 1 });
    const [event] = analyticsEvents.events;
    expect(event.properties).toMatchObject({ changed_fields: ["genres"] });
  });

  it("rejects an unknown genre name before writing anything", async () => {
    mockResolveGenres.mockResolvedValueOnce({ ids: [], unknown: ["Feminist Anthem"] });

    const res = await PATCH(makeReq({ ...PATCH_BODY, genres: ["Feminist Anthem"], notes: "x" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Unknown genre: Feminist Anthem",
      unknown_genres: ["Feminist Anthem"],
    });
    expect(mockReplaceGenres).not.toHaveBeenCalled();
    expect(mockUpdateTrack).not.toHaveBeenCalled();
  });

  it.each([["Cumbia"], [[1]], [null]])("rejects malformed genres %j", async (genres) => {
    const res = await PATCH(makeReq({ ...PATCH_BODY, genres }));
    expect(res.status).toBe(400);
    expect(mockResolveGenres).not.toHaveBeenCalled();
  });

  it("returns 404 for genres on a missing track without writing links", async () => {
    mockResolveGenres.mockResolvedValueOnce({ ids: [CUMBIA], unknown: [] });
    mockFindTrack.mockResolvedValueOnce(null);

    const res = await PATCH(makeReq({ ...PATCH_BODY, genres: [CUMBIA] }));

    expect(res.status).toBe(404);
    expect(mockReplaceGenres).not.toHaveBeenCalled();
  });

  it("normalises descriptors into the field update", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack());
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ descriptors: ["uplifting"] }));

    const res = await PATCH(makeReq({ ...PATCH_BODY, descriptors: ["Uplifting", "uplifting "] }));

    expect(res.status).toBe(200);
    expect(mockUpdateTrack).toHaveBeenCalledWith({ ...PATCH_BODY, descriptors: ["uplifting"] });
    expect(mockResolveGenres).not.toHaveBeenCalled();
  });

  it("rejects malformed descriptors", async () => {
    const res = await PATCH(makeReq({ ...PATCH_BODY, descriptors: "uplifting" }));
    expect(res.status).toBe(400);
    expect(mockUpdateTrack).not.toHaveBeenCalled();
  });

  it("records genres from the enrichment wizard with their source (#374)", async () => {
    mockResolveGenres.mockResolvedValueOnce({ ids: [CUMBIA], unknown: [] });
    mockFindTrack.mockResolvedValueOnce(baseTrack());
    mockUpdateTrack.mockResolvedValueOnce(baseTrack());

    const res = await PATCH(
      makeReq({ ...PATCH_BODY, genres: [CUMBIA], genre_source: "enrichment" }),
    );

    expect(res.status).toBe(200);
    expect(mockReplaceGenres).toHaveBeenCalledWith("t1", 1, [CUMBIA], "enrichment");
    // A source is not a column, and not a change to report.
    expect(mockUpdateTrack).toHaveBeenCalledWith({ track_id: "t1", friend_id: 1 });
    const [event] = analyticsEvents.events;
    expect(event.properties).toMatchObject({ changed_fields: ["genres"] });
  });

  it.each([["reconciliation"], ["ai"], [1]])(
    "rejects genre_source %j before writing anything",
    async (genre_source) => {
      const res = await PATCH(makeReq({ ...PATCH_BODY, genres: [CUMBIA], genre_source }));
      expect(res.status).toBe(400);
      expect(mockResolveGenres).not.toHaveBeenCalled();
      expect(mockUpdateTrack).not.toHaveBeenCalled();
    },
  );
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
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ local_audio_url: "artist - title.m4a" }));
    await PATCH(makeReq(PATCH_BODY));
    expect(mockStartFingerprintRun).toHaveBeenCalledWith({
      kind: "track",
      track_id: "t1",
      friend_id: 1,
    });
  });

  it("does not queue a run when local_audio_url is unchanged", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack({ local_audio_url: "artist - title.m4a" }));
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ local_audio_url: "artist - title.m4a" }));
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
    mockUpdateTrack.mockResolvedValueOnce(baseTrack({ local_audio_url: "artist - title.m4a" }));
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
    await PATCH(makeReq({ track_id: "t1", friend_id: 1, star_rating: 5, notes: "hi" }));
    expect(analyticsEvents.events).toHaveLength(1);
    const arg = analyticsEvents.events[0];
    expect(arg.event).toBe("track_edited");
    expect(arg.properties.track_id).toBe("t1");
    expect(arg.properties.changed_fields).toEqual(expect.arrayContaining(["star_rating", "notes"]));
    expect(arg.properties.changed_fields).not.toContain("track_id");
    expect(arg.properties.changed_fields).not.toContain("friend_id");
    expect(arg.properties.has_rating_change).toBe(true);
    expect(arg.properties.has_notes_change).toBe(true);
    expect(arg.properties.has_tags_change).toBe(false);
  });
});

it("rejects unknown audio sources before writing", async () => {
  mockUpdateTrack.mockClear();
  const response = await PATCH(makeReq({ track_id: "t1", friend_id: 1, audio_source: "spotify" }));
  expect(response.status).toBe(400);
  expect(mockUpdateTrack).not.toHaveBeenCalled();
});

it("accepts clearing the local audio URL", async () => {
  mockFindTrack.mockResolvedValue(baseTrack());
  mockUpdateTrack.mockResolvedValue(baseTrack({ local_audio_url: null }));
  const response = await PATCH(makeReq({ track_id: "t1", friend_id: 1, local_audio_url: null }));
  expect(response.status).toBe(200);
  expect(mockUpdateTrack).toHaveBeenCalledWith({
    track_id: "t1",
    friend_id: 1,
    local_audio_url: null,
  });
});

describe("PATCH /api/tracks — ISRC (#1156)", () => {
  const LINK = "https://music.apple.com/us/album/x/1?i=2";

  beforeEach(() => {
    mockFindTrack.mockReset();
    mockUpdateTrack.mockReset();
    mockSyncIsrc.mockClear();
  });

  it("re-syncs the ISRC when the Apple Music link changes, and returns the fresh row", async () => {
    mockFindTrack
      .mockResolvedValueOnce(baseTrack({ apple_music_url: null }))
      .mockResolvedValueOnce(baseTrack({ apple_music_url: LINK, isrc: "USAB11800123" }));
    mockUpdateTrack.mockResolvedValue(baseTrack({ apple_music_url: LINK }));
    const res = await PATCH(makeReq({ ...PATCH_BODY, apple_music_url: LINK }));
    expect(res.status).toBe(200);
    expect(mockSyncIsrc).toHaveBeenCalledWith(
      expect.objectContaining({ apple_music_url: LINK }),
      undefined,
    );
    expect((await res.json()).isrc).toBe("USAB11800123");
  });

  it("clears the ISRC when the link is removed", async () => {
    mockFindTrack.mockResolvedValue(baseTrack({ apple_music_url: LINK }));
    mockUpdateTrack.mockResolvedValue(baseTrack({ apple_music_url: undefined }));
    await PATCH(makeReq({ ...PATCH_BODY, apple_music_url: null }));
    expect(mockSyncIsrc).toHaveBeenCalledTimes(1);
  });

  it("syncs when the track was not readable beforehand", async () => {
    mockFindTrack.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mockUpdateTrack.mockResolvedValue(baseTrack({ apple_music_url: LINK }));
    await PATCH(makeReq({ ...PATCH_BODY, apple_music_url: LINK }));
    expect(mockSyncIsrc).toHaveBeenCalledTimes(1);
  });

  it("falls back to the updated row when the re-read finds nothing", async () => {
    mockFindTrack.mockResolvedValueOnce(baseTrack()).mockResolvedValueOnce(null);
    mockUpdateTrack.mockResolvedValue(baseTrack({ apple_music_url: LINK }));
    const res = await PATCH(makeReq({ ...PATCH_BODY, apple_music_url: LINK }));
    expect((await res.json()).apple_music_url).toBe(LINK);
  });

  it("hands the sync the ISRC the caller already has", async () => {
    mockFindTrack.mockResolvedValue(baseTrack({ apple_music_url: null }));
    mockUpdateTrack.mockResolvedValue(baseTrack({ apple_music_url: LINK }));
    await PATCH(makeReq({ ...PATCH_BODY, apple_music_url: LINK, isrc: "us-ab1-18-00123" }));
    expect(mockSyncIsrc).toHaveBeenCalledWith(expect.anything(), "us-ab1-18-00123");
  });

  it("does not sync when the link is unchanged or not part of the update", async () => {
    mockFindTrack.mockResolvedValue(baseTrack({ apple_music_url: LINK }));
    mockUpdateTrack.mockResolvedValue(baseTrack({ apple_music_url: LINK }));
    await PATCH(makeReq({ ...PATCH_BODY, apple_music_url: LINK }));
    await PATCH(makeReq({ ...PATCH_BODY, notes: "x" }));
    expect(mockSyncIsrc).not.toHaveBeenCalled();
  });

  it("stores a supplied ISRC normalised", async () => {
    mockFindTrack.mockResolvedValue(baseTrack());
    mockUpdateTrack.mockResolvedValue(baseTrack());
    await PATCH(makeReq({ ...PATCH_BODY, isrc: "us-ab1-18-00123" }));
    expect(mockUpdateTrack).toHaveBeenCalledWith(expect.objectContaining({ isrc: "USAB11800123" }));
  });

  it("passes null through to clear the ISRC", async () => {
    mockFindTrack.mockResolvedValue(baseTrack());
    mockUpdateTrack.mockResolvedValue(baseTrack());
    await PATCH(makeReq({ ...PATCH_BODY, isrc: null }));
    expect(mockUpdateTrack).toHaveBeenCalledWith(expect.objectContaining({ isrc: null }));
  });

  it("rejects an ISRC that is not one", async () => {
    const res = await PATCH(makeReq({ ...PATCH_BODY, isrc: "nope" }));
    expect(res.status).toBe(400);
    expect(mockUpdateTrack).not.toHaveBeenCalled();
  });
});

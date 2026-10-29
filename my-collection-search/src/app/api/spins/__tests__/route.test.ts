import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockListSpinSessions, mockCreateSpinSession } = vi.hoisted(() => ({
  mockListSpinSessions: vi.fn(),
  mockCreateSpinSession: vi.fn(),
}));

vi.mock("@/server/services/spinLoggingService", () => ({
  spinLoggingService: {
    listSpinSessions: mockListSpinSessions,
    createSpinSession: mockCreateSpinSession,
  },
}));

import { GET, POST } from "../route";

function makeSpinSessionDetail() {
  return {
    session: {
      id: 101,
      friend_id: 1,
      release_id: "rel-1",
      medium: "vinyl" as const,
      selection_mode: "sides" as const,
      played_at: "2026-06-24T01:00:00.000Z",
      note: "warmup",
      context_type: "home",
      created_at: "2026-06-24T01:01:00.000Z",
      updated_at: "2026-06-24T01:01:00.000Z",
    },
    selections: [
      {
        id: 1,
        session_id: 101,
        ordinal: 0,
        selection_type: "side" as const,
        side_key: "A",
        track_id: null,
        friend_id: null,
        position_snapshot: null,
        created_at: "2026-06-24T01:01:00.000Z",
      },
    ],
    track_events: [
      {
        id: 1,
        session_id: 101,
        friend_id: 1,
        release_id: "rel-1",
        track_id: "trk-a1",
        played_at: "2026-06-24T01:00:00.000Z",
        ordinal: 0,
        side_key: "A",
        position_snapshot: "A1",
        title_snapshot: "Track A1",
        artist_snapshot: "Artist",
        album_snapshot: "Album",
        created_at: "2026-06-24T01:01:00.000Z",
      },
    ],
    derived: {
      is_full_album_spin: false,
      selected_side_count: 1,
      album_side_count: 2,
      track_count: 1,
    },
  };
}

describe("GET /api/spins", () => {
  beforeEach(() => {
    mockListSpinSessions.mockReset();
    mockCreateSpinSession.mockReset();
  });

  it("returns 400 for invalid query params", async () => {
    const req = new Request("http://localhost/api/spins?friend_id=not-a-number");
    const res = await GET(req as never);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid spin list query/i);
  });

  it("returns 500 with the service's message when listing fails", async () => {
    mockListSpinSessions.mockRejectedValueOnce(new Error("db down"));

    const res = await GET(new Request("http://localhost/api/spins?friend_id=1") as never);

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("db down");
  });

  it("returns 500 with a generic message when listing rejects with a non-Error", async () => {
    mockListSpinSessions.mockRejectedValueOnce("boom");

    const res = await GET(new Request("http://localhost/api/spins?friend_id=1") as never);

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Failed to list spin sessions");
  });

  it("returns list response with items", async () => {
    mockListSpinSessions.mockResolvedValueOnce([makeSpinSessionDetail()]);

    const req = new Request("http://localhost/api/spins?friend_id=1&limit=25&offset=5");
    const res = await GET(req as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.limit).toBe(25);
    expect(body.offset).toBe(5);
    expect(body.items[0].session.id).toBe(101);
    expect(mockListSpinSessions).toHaveBeenCalledWith({
      friend_id: 1,
      release_id: undefined,
      track_id: undefined,
      from: undefined,
      to: undefined,
      limit: 25,
      offset: 5,
    });
  });
});

describe("POST /api/spins", () => {
  beforeEach(() => {
    mockListSpinSessions.mockReset();
    mockCreateSpinSession.mockReset();
  });

  it("returns 400 for invalid payload", async () => {
    const req = new Request("http://localhost/api/spins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        friend_id: 1,
        release_id: "rel-1",
        played_at: "2026-06-24T01:00:00.000Z",
      }),
    });

    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid spin payload/i);
  });

  it("maps service track_events to expanded_tracks", async () => {
    mockCreateSpinSession.mockResolvedValueOnce(makeSpinSessionDetail());

    const req = new Request("http://localhost/api/spins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        friend_id: 1,
        release_id: "rel-1",
        played_at: "2026-06-24T01:00:00.000Z",
        side_keys: ["A"],
      }),
    });

    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.expanded_tracks).toHaveLength(1);
    expect(body.expanded_tracks[0].track_id).toBe("trk-a1");
    expect(body.track_events).toBeUndefined();
  });

  it("rejects a selection given both ways, with the refinement's message", async () => {
    const req = new Request("http://localhost/api/spins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        friend_id: 1,
        release_id: "rel-1",
        played_at: "2026-06-24T01:00:00.000Z",
        side_keys: ["A"],
        track_refs: [{ track_id: "trk-a1", friend_id: 1 }],
      }),
    });

    const res = await POST(req as never);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid spin payload");
    expect(body.details.formErrors).toEqual(["Provide exactly one of side_keys or track_refs"]);
    expect(mockCreateSpinSession).not.toHaveBeenCalled();
  });

  it("coerces a text friend_id and passes track refs to the service", async () => {
    mockCreateSpinSession.mockResolvedValueOnce(makeSpinSessionDetail());

    const req = new Request("http://localhost/api/spins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        friend_id: "1",
        release_id: "rel-1",
        played_at: "2026-06-24T01:00:00.000Z",
        note: null,
        track_refs: [{ track_id: "trk-a1", friend_id: 1 }],
      }),
    });

    const res = await POST(req as never);

    expect(res.status).toBe(200);
    expect(mockCreateSpinSession).toHaveBeenCalledWith({
      friend_id: 1,
      release_id: "rel-1",
      played_at: "2026-06-24T01:00:00.000Z",
      note: null,
      context_type: undefined,
      track_refs: [{ track_id: "trk-a1", friend_id: 1 }],
    });
  });

  it("passes a digital medium through and maps a repeated play to 409", async () => {
    const post = () =>
      POST(
        new Request("http://localhost/api/spins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            friend_id: 1,
            release_id: "rel-1",
            medium: "digital",
            played_at: "2026-06-24T01:00:00.000Z",
            context_type: "player",
            track_refs: [{ track_id: "trk-a1", friend_id: 1 }],
          }),
        }) as never,
      );

    mockCreateSpinSession.mockResolvedValueOnce(makeSpinSessionDetail());
    expect((await post()).status).toBe(200);
    expect(mockCreateSpinSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ medium: "digital", context_type: "player" }),
    );

    mockCreateSpinSession.mockRejectedValueOnce(new Error("Digital play already logged"));
    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Digital play already logged");
  });

  it("rejects an unknown medium", async () => {
    const res = await POST(
      new Request("http://localhost/api/spins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          friend_id: 1,
          release_id: "rel-1",
          medium: "cassette",
          played_at: "2026-06-24T01:00:00.000Z",
          side_keys: ["A"],
        }),
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 for an unexpected service failure", async () => {
    mockCreateSpinSession.mockRejectedValueOnce(new Error("db down"));

    const req = new Request("http://localhost/api/spins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        friend_id: 1,
        release_id: "rel-1",
        played_at: "2026-06-24T01:00:00.000Z",
        side_keys: ["A"],
      }),
    });

    const res = await POST(req as never);

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("db down");
  });

  it("returns 404 when album is not found", async () => {
    mockCreateSpinSession.mockRejectedValueOnce(new Error("Album not found"));

    const req = new Request("http://localhost/api/spins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        friend_id: 1,
        release_id: "rel-1",
        played_at: "2026-06-24T01:00:00.000Z",
        side_keys: ["A"],
      }),
    });

    const res = await POST(req as never);
    expect(res.status).toBe(404);
  });

  it("returns 400 for service-level validation errors", async () => {
    mockCreateSpinSession.mockRejectedValueOnce(new Error("Duplicate side keys are not allowed"));

    const req = new Request("http://localhost/api/spins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        friend_id: 1,
        release_id: "rel-1",
        played_at: "2026-06-24T01:00:00.000Z",
        side_keys: ["A", "A"],
      }),
    });

    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/duplicate side keys/i);
  });
});

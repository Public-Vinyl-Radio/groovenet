import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDeleteSpinSession, mockUpdateSpinSession } = vi.hoisted(() => ({
  mockDeleteSpinSession: vi.fn(),
  mockUpdateSpinSession: vi.fn(),
}));

vi.mock("@/server/services/spinLoggingService", () => ({
  spinLoggingService: {
    deleteSpinSession: mockDeleteSpinSession,
    updateSpinSession: mockUpdateSpinSession,
  },
}));

import { DELETE, PATCH } from "../route";
import { setAnalyticsProvider } from "@/lib/analytics/server";
import { MemoryAnalyticsProvider } from "@/lib/analytics/providers/memory";

const analyticsEvents = new MemoryAnalyticsProvider();
setAnalyticsProvider(analyticsEvents);

describe("DELETE /api/spins/{id}", () => {
  beforeEach(() => {
    mockDeleteSpinSession.mockReset();
    analyticsEvents.reset();
  });

  it("returns 400 for invalid path params", async () => {
    const req = new Request("http://localhost/api/spins/not-a-number?friend_id=1", {
      method: "DELETE",
    });

    const res = await DELETE(req as never, {
      params: Promise.resolve({ id: "not-a-number" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid query params", async () => {
    const req = new Request("http://localhost/api/spins/10?friend_id=nope", {
      method: "DELETE",
    });

    const res = await DELETE(req as never, {
      params: Promise.resolve({ id: "10" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 404 when session is not found", async () => {
    mockDeleteSpinSession.mockResolvedValueOnce(null);

    const req = new Request("http://localhost/api/spins/10?friend_id=1", {
      method: "DELETE",
    });

    const res = await DELETE(req as never, {
      params: Promise.resolve({ id: "10" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns deleted session payload on success", async () => {
    mockDeleteSpinSession.mockResolvedValueOnce({
      id: 10,
      friend_id: 1,
      release_id: "rel-1",
      medium: "vinyl",
      selection_mode: "tracks",
      played_at: "2026-06-24T02:00:00.000Z",
      note: null,
      context_type: null,
      created_at: "2026-06-24T02:00:00.000Z",
      updated_at: "2026-06-24T02:00:00.000Z",
    });

    const req = new Request("http://localhost/api/spins/10?friend_id=1", {
      method: "DELETE",
    });

    const res = await DELETE(req as never, {
      params: Promise.resolve({ id: "10" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.session.id).toBe(10);
    expect(mockDeleteSpinSession).toHaveBeenCalledWith(10, 1);
  });

  it("reports the delete, and whether the listener had detected the spin", async () => {
    mockDeleteSpinSession.mockResolvedValueOnce({
      id: 11,
      friend_id: 1,
      release_id: "rel-1",
      medium: "vinyl",
      selection_mode: "automatic",
      played_at: "2026-06-24T02:00:00.000Z",
      provenance: "automatic",
      created_at: "2026-06-24T02:00:00.000Z",
      updated_at: "2026-06-24T02:00:00.000Z",
    });

    await DELETE(
      new Request("http://localhost/api/spins/11?friend_id=1", {
        method: "DELETE",
        headers: { "X-Groovenet-Client": "cli" },
      }) as never,
      { params: Promise.resolve({ id: "11" }) }
    );

    expect(analyticsEvents.events.map((e) => [e.event, e.properties])).toEqual([
      ["spin_deleted", { spin_id: 11, was_detected: true, source: "cli" }],
    ]);
  });

  it("reports nothing when there was no spin to delete", async () => {
    mockDeleteSpinSession.mockResolvedValueOnce(null);
    await DELETE(
      new Request("http://localhost/api/spins/10?friend_id=1", { method: "DELETE" }) as never,
      { params: Promise.resolve({ id: "10" }) }
    );
    expect(analyticsEvents.events).toEqual([]);
  });
});

describe("PATCH /api/spins/{id}", () => {
  const patch = (id: string, body: unknown) =>
    PATCH(
      new Request(`http://localhost/api/spins/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }) as never,
      { params: Promise.resolve({ id }) }
    );

  const updated = {
    session: {
      id: 10,
      friend_id: 1,
      release_id: "rel-1",
      medium: "vinyl",
      selection_mode: "tracks",
      played_at: "2026-09-20T21:30:00.000Z",
      provenance: "automatic",
      corrected_at: "2026-09-27T12:00:00.000Z",
      created_at: "2026-09-20T21:31:00.000Z",
      updated_at: "2026-09-27T12:00:00.000Z",
    },
    selections: [],
    track_events: [],
    derived: { is_full_album_spin: false, selected_side_count: 0, album_side_count: 0, track_count: 0 },
  };

  beforeEach(() => {
    mockUpdateSpinSession.mockReset();
    analyticsEvents.reset();
  });

  it("returns 400 for an invalid id", async () => {
    expect((await patch("nope", { friend_id: 1, note: "x" })).status).toBe(400);
  });

  it("returns 400 when there is nothing to update", async () => {
    const res = await patch("10", { friend_id: 1 });
    expect(res.status).toBe(400);
    expect(mockUpdateSpinSession).not.toHaveBeenCalled();
  });

  it("returns 400 when both sides and tracks are given", async () => {
    const res = await patch("10", {
      friend_id: 1,
      side_keys: ["A"],
      track_refs: [{ track_id: "t1", friend_id: 1 }],
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the spin is not the friend's", async () => {
    mockUpdateSpinSession.mockResolvedValueOnce(null);
    expect((await patch("10", { friend_id: 1, note: "x" })).status).toBe(404);
  });

  it("passes the changes through without friend_id and returns the edited spin", async () => {
    mockUpdateSpinSession.mockResolvedValueOnce(updated);

    const res = await patch("10", {
      friend_id: 1,
      track_refs: [{ track_id: "t1", friend_id: 1 }],
      note: null,
    });

    expect(res.status).toBe(200);
    expect(mockUpdateSpinSession).toHaveBeenCalledWith(10, 1, {
      track_refs: [{ track_id: "t1", friend_id: 1 }],
      note: null,
    });
    expect((await res.json()).session.corrected_at).toBe("2026-09-27T12:00:00.000Z");
  });

  it("reports the edit as a correction of a detected spin, naming what changed", async () => {
    mockUpdateSpinSession.mockResolvedValueOnce(updated);

    await patch("10", {
      friend_id: 1,
      track_refs: [{ track_id: "t1", friend_id: 1 }],
      note: null,
      played_at: "2026-09-20T21:35:00.000Z",
    });

    expect(analyticsEvents.events.map((e) => [e.event, e.properties])).toEqual([
      [
        "spin_edited",
        {
          spin_id: 10,
          was_detected: true,
          changed_fields: ["played_at", "note", "selection"],
          source: "web",
        },
      ],
    ]);
  });

  it("reports nothing for an edit that failed", async () => {
    mockUpdateSpinSession.mockResolvedValueOnce(null);
    await patch("10", { friend_id: 1, note: "x" });
    expect(analyticsEvents.events).toEqual([]);
  });

  it("maps a selection that does not fit the album to 400", async () => {
    mockUpdateSpinSession.mockRejectedValueOnce(new Error("Invalid side key: Z"));
    expect((await patch("10", { friend_id: 1, side_keys: ["Z"] })).status).toBe(400);
  });

  it("maps a missing album to 404 and anything else to 500", async () => {
    mockUpdateSpinSession.mockRejectedValueOnce(new Error("Album not found"));
    expect((await patch("10", { friend_id: 1, side_keys: ["A"] })).status).toBe(404);

    mockUpdateSpinSession.mockRejectedValueOnce(new Error("connection reset"));
    expect((await patch("10", { friend_id: 1, note: "x" })).status).toBe(500);
  });
});

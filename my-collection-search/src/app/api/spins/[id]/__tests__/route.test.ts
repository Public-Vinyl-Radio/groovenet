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

describe("DELETE /api/spins/{id}", () => {
  beforeEach(() => {
    mockDeleteSpinSession.mockReset();
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

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const restoreTrack = vi.fn();
vi.mock("@/server/repositories/trackRepository", () => ({
  trackRepository: { restoreTrack: (...a: unknown[]) => restoreTrack(...a) },
}));

import { POST } from "../route";

const call = (query: string) =>
  POST(new NextRequest(`http://localhost/api/tracks/t1/restore${query}`, { method: "POST" }), {
    params: Promise.resolve({ id: "t1" }),
  });

const row = { track_id: "t1", friend_id: 2, title: "A", artist: "B", album: "C", deleted_at: null };

describe("POST /api/tracks/[id]/restore", () => {
  beforeEach(() => {
    restoreTrack.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns the restored track, with dates as ISO strings", async () => {
    restoreTrack.mockResolvedValue({ ...row, created_at: new Date("2026-01-02T03:04:05Z") });
    const res = await call("?friend_id=2");
    expect(res.status).toBe(200);
    expect(restoreTrack).toHaveBeenCalledWith("t1", 2);
    expect(await res.json()).toEqual({
      success: true,
      track_id: "t1",
      friend_id: 2,
      track: { ...row, created_at: "2026-01-02T03:04:05.000Z" },
    });
  });

  it("rejects a missing or non-numeric friend_id", async () => {
    expect((await call("")).status).toBe(400);
    const res = await call("?friend_id=abc");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "friend_id must be a number" });
  });

  it("returns 404 when the track is not deleted", async () => {
    restoreTrack.mockResolvedValue(null);
    expect((await call("?friend_id=2")).status).toBe(404);
  });

  it("returns 500 when restoring throws", async () => {
    restoreTrack.mockRejectedValue(new Error("db"));
    const res = await call("?friend_id=2");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to restore track" });
  });
});

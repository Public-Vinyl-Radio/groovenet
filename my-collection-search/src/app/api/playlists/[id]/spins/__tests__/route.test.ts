import { beforeEach, describe, expect, it, vi } from "vitest";

const log = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/playlistSpinService", () => ({
  playlistSpinService: { log },
}));

import { POST } from "../route";

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (body: object) => new Request("http://localhost/api/playlists/9/spins", {
  method: "POST",
  body: JSON.stringify(body),
});

beforeEach(() => vi.clearAllMocks());

describe("POST /api/playlists/:id/spins", () => {
  it("validates and logs a playlist", async () => {
    log.mockResolvedValue({ playlist_id: 9, performance_id: 4, performed_at: "2026-10-01T20:00:00.000Z", created: 2, skipped: 0 });
    const response = await POST(request({ performance_id: 4 }), context("9"));
    expect(response.status).toBe(200);
    expect(log).toHaveBeenCalledWith(9, { performance_id: 4 });
    expect(await response.json()).toMatchObject({ created: 2, skipped: 0 });
  });

  it("rejects invalid ids and mutually exclusive timestamps", async () => {
    expect((await POST(request({}), context("bad"))).status).toBe(400);
    expect((await POST(request({ performed_at: "2026-10-01", performance_id: 4 }), context("9"))).status).toBe(400);
    expect(log).not.toHaveBeenCalled();
  });

  it("maps domain errors to useful statuses", async () => {
    for (const message of ["Playlist not found", "Performance not found for playlist"]) {
      log.mockRejectedValueOnce(new Error(message));
      expect((await POST(request({}), context("9"))).status).toBe(404);
    }
    for (const message of [
      "Playlist has no performance; provide performed_at",
      "Set derivation is not ready for this playlist",
      "Playlist changed since review",
      "Playlist track is missing",
    ]) {
      log.mockRejectedValueOnce(new Error(message));
      expect((await POST(request({}), context("9"))).status).toBe(400);
    }
  });

  it("returns 500 for unexpected thrown values", async () => {
    log.mockRejectedValueOnce("boom");
    const response = await POST(request({}), context("9"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to log playlist spins" });
  });
});

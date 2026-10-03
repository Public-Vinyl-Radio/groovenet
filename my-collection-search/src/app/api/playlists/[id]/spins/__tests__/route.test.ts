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

  it("maps missing playlists and absent timestamps to useful statuses", async () => {
    log.mockRejectedValueOnce(new Error("Playlist not found"));
    expect((await POST(request({}), context("9"))).status).toBe(404);
    log.mockRejectedValueOnce(new Error("Playlist has no performance; provide performed_at"));
    expect((await POST(request({}), context("9"))).status).toBe(400);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({ createForPlaylist: vi.fn(), deleteForPlaylist: vi.fn(), getByPlaylistId: vi.fn(), updateForPlaylist: vi.fn() }));
vi.mock("@/server/services/liveSetService", () => ({ liveSetService: service }));
import { DELETE, POST } from "../route";

const context = (id: string) => ({ params: Promise.resolve({ id }) });
beforeEach(() => vi.clearAllMocks());

describe("playlist set lifecycle route", () => {
  it("rejects an invalid playlist id before calling the service", async () => {
    const response = await POST(new Request("http://localhost"), context("nope"));
    expect(response.status).toBe(400);
    expect(service.createForPlaylist).not.toHaveBeenCalled();
  });

  it("returns 404 when creating a set for a missing playlist", async () => {
    service.createForPlaylist.mockResolvedValue(null);
    const response = await POST(new Request("http://localhost"), context("9"));
    expect(response.status).toBe(404);
  });

  it("returns the ensured set when create is called repeatedly", async () => {
    service.createForPlaylist.mockResolvedValue({ id: 4, playlist_id: 9 });
    const first = await POST(new Request("http://localhost"), context("9"));
    const second = await POST(new Request("http://localhost"), context("9"));
    expect(await first.json()).toEqual({ id: 4, playlist_id: 9 });
    expect(await second.json()).toEqual({ id: 4, playlist_id: 9 });
  });

  it("deletes the set response without deleting a playlist", async () => {
    service.deleteForPlaylist.mockResolvedValue(true);
    const response = await DELETE(new Request("http://localhost"), context("9"));
    expect(response.status).toBe(200);
    expect(service.deleteForPlaylist).toHaveBeenCalledWith(9);
  });
});

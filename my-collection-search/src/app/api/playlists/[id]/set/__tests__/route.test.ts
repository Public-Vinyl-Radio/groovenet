import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({ createForPlaylist: vi.fn(), deleteForPlaylist: vi.fn(), getByPlaylistId: vi.fn(), updateForPlaylist: vi.fn() }));
vi.mock("@/server/services/liveSetService", () => ({ liveSetService: service }));
import { DELETE, GET, POST, PUT } from "../route";

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

  it("gets a set and returns 404 when absent", async () => {
    service.getByPlaylistId.mockResolvedValueOnce({ id: 4, playlist_id: 9 }).mockResolvedValueOnce(null);
    expect((await GET(new Request("http://localhost"), context("9"))).status).toBe(200);
    expect((await GET(new Request("http://localhost"), context("9"))).status).toBe(404);
  });

  it("handles invalid and failing reads", async () => {
    expect((await GET(new Request("http://localhost"), context("bad"))).status).toBe(400);
    service.getByPlaylistId.mockRejectedValueOnce(new Error("db"));
    expect((await GET(new Request("http://localhost"), context("9"))).status).toBe(500);
  });

  it("validates and updates set metadata", async () => {
    const invalid = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ status: "wrong" }) }), context("9"));
    expect(invalid.status).toBe(400);
    service.updateForPlaylist.mockResolvedValue({ id: 4, playlist_id: 9 });
    const valid = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ status: "draft" }) }), context("9"));
    expect(valid.status).toBe(200);
    expect(service.updateForPlaylist).toHaveBeenCalledWith(9, { status: "draft" });
  });

  it("returns 404 for a missing set deletion", async () => {
    service.deleteForPlaylist.mockResolvedValue(false);
    expect((await DELETE(new Request("http://localhost"), context("9"))).status).toBe(404);
  });

  it("handles missing and failing updates/deletes", async () => {
    service.updateForPlaylist.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("db"));
    expect((await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({}) }), context("9"))).status).toBe(404);
    expect((await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({}) }), context("9"))).status).toBe(500);
    service.deleteForPlaylist.mockRejectedValueOnce(new Error("db"));
    expect((await DELETE(new Request("http://localhost"), context("9"))).status).toBe(500);
  });
});

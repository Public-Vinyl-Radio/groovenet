import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  getAllPlaylistsWithTracks: vi.fn(),
  createPlaylistWithTracks: vi.fn(),
  updatePlaylist: vi.fn(),
}));
const repo = vi.hoisted(() => ({ deletePlaylistById: vi.fn() }));

vi.mock("@/server/auth/viewer", async () => (await import("@/test/viewerMock")).viewerMock);
vi.mock("@/server/services/playlistManagementService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/playlistManagementService")>()),
  playlistManagementService: service,
}));
vi.mock("@/server/repositories/playlistRepository", () => ({ playlistRepository: repo }));

import { DELETE, GET, PATCH, POST } from "../route";
import { PlaylistForbiddenError } from "@/server/services/playlistManagementService";
import { OTHER, VIEWER, viewerMock } from "@/test/viewerMock";

const url = "http://localhost/api/playlists";
const json = (method: string, body: unknown) =>
  new Request(url, { method, body: JSON.stringify(body) });
const owned = {
  owner_id: VIEWER.id,
  owner_name: VIEWER.name,
  visibility: "household" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("GET /api/playlists", () => {
  it("lists the playlists the requesting profile may see, with their owners", async () => {
    const list = [{ id: 1, name: "Mix", created_at: "2026-01-01", tracks: [], ...owned }];
    service.getAllPlaylistsWithTracks.mockResolvedValue(list);
    viewerMock.resolveViewer.mockResolvedValueOnce(OTHER);
    const res = await GET(new Request(url));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(list);
    expect(service.getAllPlaylistsWithTracks).toHaveBeenCalledWith(OTHER.id);
  });

  it("returns the raw payload when it fails validation", async () => {
    service.getAllPlaylistsWithTracks.mockResolvedValue([{ id: "x" }]);
    const res = await GET(new Request(url));
    expect(await res.json()).toEqual([{ id: "x" }]);
  });

  it("returns 500 on failure", async () => {
    service.getAllPlaylistsWithTracks.mockRejectedValue(new Error("db down"));
    expect((await GET(new Request(url))).status).toBe(500);
  });
});

describe("POST /api/playlists", () => {
  it("creates the playlist for the requesting profile", async () => {
    service.createPlaylistWithTracks.mockResolvedValue({
      id: 5,
      name: "Mine",
      created_at: new Date("2026-01-01T00:00:00Z"),
      tracks: [],
      owner_id: OTHER.id,
      owner_name: OTHER.name,
      visibility: "private",
    });
    viewerMock.resolveViewer.mockResolvedValueOnce(OTHER);
    const res = await POST(json("POST", { name: "Mine", visibility: "private" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: 5, owner_id: OTHER.id, visibility: "private" });
    expect(service.createPlaylistWithTracks).toHaveBeenCalledWith({
      name: "Mine",
      tracks: [],
      ownerId: OTHER.id,
      visibility: "private",
    });
  });

  it("rejects an unknown visibility", async () => {
    const res = await POST(json("POST", { name: "Mine", visibility: "public" }));
    expect(res.status).toBe(400);
    expect(service.createPlaylistWithTracks).not.toHaveBeenCalled();
  });

  it("returns 500 on failure", async () => {
    service.createPlaylistWithTracks.mockRejectedValue(new Error("boom"));
    expect((await POST(json("POST", { name: "Mine" }))).status).toBe(500);
  });
});

describe("PATCH /api/playlists", () => {
  it("updates as the requesting profile", async () => {
    service.updatePlaylist.mockResolvedValue({
      notFound: false,
      playlist: { id: 1, name: "Renamed", created_at: "2026-01-01", tracks: [], ...owned },
    });
    const res = await PATCH(json("PATCH", { id: 1, name: "Renamed" }));
    expect(res.status).toBe(200);
    expect(service.updatePlaylist).toHaveBeenCalledWith({ id: 1, name: "Renamed" }, VIEWER.id);
  });

  it("is a 404 for a missing playlist or someone else's private one", async () => {
    service.updatePlaylist.mockResolvedValue({ notFound: true });
    expect((await PATCH(json("PATCH", { id: 1, name: "x" }))).status).toBe(404);
  });

  it("is a 403 when someone else changes visibility", async () => {
    service.updatePlaylist.mockRejectedValue(new PlaylistForbiddenError());
    viewerMock.resolveViewer.mockResolvedValueOnce(OTHER);
    const res = await PATCH(json("PATCH", { id: 1, visibility: "private" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Only the playlist's owner can change its visibility",
    });
  });

  it("validates the body and reports failures", async () => {
    expect((await PATCH(json("PATCH", { id: 1, visibility: "public" }))).status).toBe(400);
    service.updatePlaylist.mockRejectedValue(new Error("boom"));
    expect((await PATCH(json("PATCH", { id: 1 }))).status).toBe(500);
  });
});

describe("DELETE /api/playlists", () => {
  it("deletes as the requesting profile", async () => {
    repo.deletePlaylistById.mockResolvedValue({ id: 3 });
    const res = await DELETE(new Request(`${url}?id=3`, { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(repo.deletePlaylistById).toHaveBeenCalledWith(3, VIEWER.id);
  });

  it("is a 404 for someone else's private playlist", async () => {
    repo.deletePlaylistById.mockResolvedValue(null);
    viewerMock.resolveViewer.mockResolvedValueOnce(OTHER);
    expect((await DELETE(new Request(`${url}?id=3`, { method: "DELETE" }))).status).toBe(404);
    expect(repo.deletePlaylistById).toHaveBeenCalledWith(3, OTHER.id);
  });

  it("validates the id and reports failures", async () => {
    expect((await DELETE(new Request(url, { method: "DELETE" }))).status).toBe(400);
    repo.deletePlaylistById.mockRejectedValue(new Error("boom"));
    expect((await DELETE(new Request(`${url}?id=3`, { method: "DELETE" }))).status).toBe(500);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({ getPlaylistTrackDetails: vi.fn() }));
vi.mock("@/server/auth/viewer", async () => (await import("@/test/viewerMock")).viewerMock);
vi.mock("@/server/services/playlistManagementService", () => ({
  playlistManagementService: service,
}));

import { GET } from "../route";
import { OTHER, VIEWER, viewerMock } from "@/test/viewerMock";

const get = (id: string) =>
  GET(new Request(`http://localhost/api/playlists/${id}/tracks`), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/playlists/[id]/tracks", () => {
  it("returns the playlist's tracks with its owner and visibility", async () => {
    const detail = {
      playlist_id: 4,
      playlist_name: "Mix",
      owner_id: VIEWER.id,
      owner_name: VIEWER.name,
      visibility: "private",
      tracks: [{ track_id: "t1", friend_id: 1, position: 0 }],
    };
    service.getPlaylistTrackDetails.mockResolvedValue({ notFound: false, detail });
    const res = await get("4");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(detail);
    expect(service.getPlaylistTrackDetails).toHaveBeenCalledWith(4, VIEWER.id);
  });

  it("is a 404 for someone else's private playlist, like a missing one", async () => {
    service.getPlaylistTrackDetails.mockResolvedValue({ notFound: true });
    viewerMock.resolveViewer.mockResolvedValueOnce(OTHER);
    expect((await get("4")).status).toBe(404);
    expect(service.getPlaylistTrackDetails).toHaveBeenCalledWith(4, OTHER.id);
  });

  it("validates the id and reports failures", async () => {
    expect((await get("abc")).status).toBe(400);
    service.getPlaylistTrackDetails.mockRejectedValue(new Error("boom"));
    expect((await get("4")).status).toBe(500);
  });
});

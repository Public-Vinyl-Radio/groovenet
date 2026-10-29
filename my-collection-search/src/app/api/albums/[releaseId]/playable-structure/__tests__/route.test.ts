import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAlbumPlayableStructure = vi.hoisted(() => vi.fn());

vi.mock("@/server/services/spinLoggingService", () => ({
  spinLoggingService: {
    getAlbumPlayableStructure: mockGetAlbumPlayableStructure,
  },
}));

import { GET } from "../route";

describe("GET /api/albums/{releaseId}/playable-structure", () => {
  beforeEach(() => {
    mockGetAlbumPlayableStructure.mockReset();
  });

  it("returns 400 when friend_id is invalid", async () => {
    const req = new Request("http://localhost/api/albums/rel-1/playable-structure?friend_id=abc");

    const res = await GET(req as never, {
      params: Promise.resolve({ releaseId: "rel-1" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 404 when album is not found", async () => {
    mockGetAlbumPlayableStructure.mockResolvedValueOnce(null);

    const req = new Request("http://localhost/api/albums/rel-1/playable-structure?friend_id=1");

    const res = await GET(req as never, {
      params: Promise.resolve({ releaseId: "rel-1" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns playable structure payload", async () => {
    mockGetAlbumPlayableStructure.mockResolvedValueOnce({
      album: {
        release_id: "rel-1",
        friend_id: 1,
        title: "Test LP",
        artist: "Test Artist",
        track_count: 2,
        date_added: "2026-01-01T00:00:00.000Z",
        date_changed: "2026-01-02T00:00:00.000Z",
      },
      sides: [
        {
          side_key: "A",
          side_label: "Side A",
          ordinal: 0,
          track_count: 2,
          tracks: [
            {
              track_id: "trk-a1",
              friend_id: 1,
              position: "A1",
              title: "Track A1",
              artist: "Test Artist",
            },
          ],
        },
      ],
    });

    const req = new Request("http://localhost/api/albums/rel-1/playable-structure?friend_id=1");

    const res = await GET(req as never, {
      params: Promise.resolve({ releaseId: "rel-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.album.release_id).toBe("rel-1");
    expect(body.album.date_added).toBe("2026-01-01T00:00:00.000Z");
    expect(body.sides[0].side_key).toBe("A");
    expect(mockGetAlbumPlayableStructure).toHaveBeenCalledWith("rel-1", 1);
  });
});

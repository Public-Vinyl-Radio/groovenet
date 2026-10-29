import { beforeEach, describe, expect, it, vi } from "vitest";

const mockListTopTracks = vi.hoisted(() => vi.fn());

vi.mock("@/server/services/spinLoggingService", () => ({
  spinLoggingService: {
    listTopTracks: mockListTopTracks,
  },
}));

import { GET } from "../route";

describe("GET /api/spins/top-tracks", () => {
  beforeEach(() => {
    mockListTopTracks.mockReset();
  });

  it("returns 400 for invalid query params", async () => {
    const req = new Request("http://localhost/api/spins/top-tracks?friend_id=nope");

    const res = await GET(req as never);

    expect(res.status).toBe(400);
  });

  it("applies the default page when limit and offset are omitted", async () => {
    mockListTopTracks.mockResolvedValueOnce([]);

    const res = await GET(
      new Request("http://localhost/api/spins/top-tracks?friend_id=1&release_id=rel-1") as never,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], limit: 20, offset: 0 });
    expect(mockListTopTracks).toHaveBeenCalledWith({
      friend_id: 1,
      release_id: "rel-1",
      limit: 20,
      offset: 0,
    });
  });

  it("returns 500 with the service's message when the query fails", async () => {
    mockListTopTracks.mockRejectedValueOnce(new Error("db down"));

    const res = await GET(
      new Request("http://localhost/api/spins/top-tracks?friend_id=1") as never,
    );

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("db down");
  });

  it("returns 500 with a generic message for a non-Error rejection", async () => {
    mockListTopTracks.mockRejectedValueOnce("boom");

    const res = await GET(
      new Request("http://localhost/api/spins/top-tracks?friend_id=1") as never,
    );

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Failed to list top spin tracks");
  });

  it("returns top tracks payload", async () => {
    mockListTopTracks.mockResolvedValueOnce([
      {
        friend_id: 1,
        release_id: "rel-1",
        track_id: "trk-1",
        play_count: 4,
        last_played_at: "2026-06-24T16:00:00.000Z",
        title_snapshot: "Track One",
        artist_snapshot: "Artist One",
        album_snapshot: "Album One",
        side_key: "A",
        position_snapshot: "A1",
      },
    ]);

    const req = new Request("http://localhost/api/spins/top-tracks?friend_id=1&limit=10&offset=5");

    const res = await GET(req as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].track_id).toBe("trk-1");
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(5);
    expect(mockListTopTracks).toHaveBeenCalledWith({
      friend_id: 1,
      limit: 10,
      offset: 5,
    });
  });
});

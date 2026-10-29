import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { setAnalyticsProvider } from "@/lib/analytics/server";
import { MemoryAnalyticsProvider } from "@/lib/analytics/providers/memory";

const analyticsEvents = new MemoryAnalyticsProvider();
setAnalyticsProvider(analyticsEvents);

const {
  mockGetAlbumDetail,
  mockGetAlbumByReleaseAndFriend,
  mockListTrackIdsForAlbum,
  mockDeleteTracksByIds,
  mockDeleteAlbumByReleaseAndFriend,
  mockWithDbTransaction,
} = vi.hoisted(() => ({
  mockGetAlbumDetail: vi.fn(),
  mockGetAlbumByReleaseAndFriend: vi.fn(),
  mockListTrackIdsForAlbum: vi.fn(),
  mockDeleteTracksByIds: vi.fn(),
  mockDeleteAlbumByReleaseAndFriend: vi.fn(),
  mockWithDbTransaction: vi.fn(),
}));

vi.mock("@/server/services/albumApiService", () => ({
  albumApiService: { getAlbumDetail: mockGetAlbumDetail },
}));
vi.mock("@/server/repositories/albumRepository", () => ({
  albumRepository: {
    getAlbumByReleaseAndFriend: mockGetAlbumByReleaseAndFriend,
    listTrackIdsForAlbum: mockListTrackIdsForAlbum,
    deleteTracksByIds: mockDeleteTracksByIds,
    deleteAlbumByReleaseAndFriend: mockDeleteAlbumByReleaseAndFriend,
  },
}));
vi.mock("@/lib/serverDb", () => ({ withDbTransaction: mockWithDbTransaction }));

import { GET, DELETE } from "../route";

const params = (releaseId = "r1") => ({ params: Promise.resolve({ releaseId }) });

function getReq(releaseId: string, friendId?: string) {
  const qs = friendId !== undefined ? `?friend_id=${friendId}` : "";
  return new NextRequest(`http://localhost/api/albums/${releaseId}${qs}`);
}

function deleteReq(releaseId: string, friendId?: string) {
  const qs = friendId !== undefined ? `?friend_id=${friendId}` : "";
  return new NextRequest(`http://localhost/api/albums/${releaseId}${qs}`, { method: "DELETE" });
}

beforeEach(() => {
  vi.resetAllMocks();
  analyticsEvents.reset();
  mockWithDbTransaction.mockImplementation(async (cb: (c: unknown) => unknown) => cb({}));
});

describe("GET /api/albums/[releaseId]", () => {
  it("returns the album detail", async () => {
    mockGetAlbumDetail.mockResolvedValue({ album: { release_id: "r1" }, tracks: [] });

    const res = await GET(getReq("r1", "7"), params());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ album: { release_id: "r1" }, tracks: [] });
    expect(mockGetAlbumDetail).toHaveBeenCalledWith("r1", 7);
  });

  it("400s without friend_id", async () => {
    const res = await GET(getReq("r1"), params());
    expect(res.status).toBe(400);
  });

  it("400s on a non-numeric friend_id", async () => {
    const res = await GET(getReq("r1", "nope"), params());
    expect(res.status).toBe(400);
  });

  it("404s when the album isn't found", async () => {
    mockGetAlbumDetail.mockResolvedValue(null);
    const res = await GET(getReq("r1", "7"), params());
    expect(res.status).toBe(404);
  });

  it("500s when the service throws", async () => {
    mockGetAlbumDetail.mockRejectedValue(new Error("boom"));
    const res = await GET(getReq("r1", "7"), params());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("boom");
  });
});

describe("DELETE /api/albums/[releaseId]", () => {
  it("deletes the album's tracks then the album, in a transaction", async () => {
    mockGetAlbumByReleaseAndFriend.mockResolvedValue({ release_id: "r1", friend_id: 7 });
    mockListTrackIdsForAlbum.mockResolvedValue(["t1", "t2"]);

    const res = await DELETE(deleteReq("r1", "7"), params());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mockGetAlbumByReleaseAndFriend).toHaveBeenCalledWith("r1", 7);
    expect(mockListTrackIdsForAlbum).toHaveBeenCalledWith("r1", 7);
    expect(mockDeleteTracksByIds).toHaveBeenCalledWith({}, ["t1", "t2"], 7);
    expect(mockDeleteAlbumByReleaseAndFriend).toHaveBeenCalledWith({}, "r1", 7);
    // Tracks must be gone before the album row, inside the same transaction.
    expect(mockDeleteTracksByIds.mock.invocationCallOrder[0]).toBeLessThan(
      mockDeleteAlbumByReleaseAndFriend.mock.invocationCallOrder[0],
    );

    expect(analyticsEvents.events).toEqual([
      {
        event: "album_deleted",
        properties: { release_id: "r1", friend_id: 7, track_count: 2, source: "web" },
        distinctId: undefined,
      },
    ]);
  });

  it("400s without friend_id", async () => {
    const res = await DELETE(deleteReq("r1"), params());
    expect(res.status).toBe(400);
    expect(mockGetAlbumByReleaseAndFriend).not.toHaveBeenCalled();
  });

  it("400s on a non-numeric friend_id", async () => {
    const res = await DELETE(deleteReq("r1", "nope"), params());
    expect(res.status).toBe(400);
  });

  it("404s when the album doesn't exist for that friend (also covers wrong-friend scoping)", async () => {
    mockGetAlbumByReleaseAndFriend.mockResolvedValue(null);

    const res = await DELETE(deleteReq("r1", "7"), params());

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Album not found");
    expect(mockWithDbTransaction).not.toHaveBeenCalled();
    expect(analyticsEvents.events).toEqual([]);
  });

  it("rolls back and reports a 500 when the album row fails to delete after tracks are gone", async () => {
    mockGetAlbumByReleaseAndFriend.mockResolvedValue({ release_id: "r1", friend_id: 7 });
    mockListTrackIdsForAlbum.mockResolvedValue(["t1"]);
    mockDeleteAlbumByReleaseAndFriend.mockRejectedValue(new Error("db exploded"));

    const res = await DELETE(deleteReq("r1", "7"), params());

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("db exploded");
    expect(mockDeleteTracksByIds).toHaveBeenCalled();
    // The whole thing ran inside withDbTransaction, which rolls back the
    // tracks delete when the album delete that followed it throws.
    expect(mockWithDbTransaction).toHaveBeenCalledTimes(1);
    expect(analyticsEvents.events).toEqual([]);
  });

  it("500s when the existence check itself throws", async () => {
    mockGetAlbumByReleaseAndFriend.mockRejectedValue(new Error("db down"));
    const res = await DELETE(deleteReq("r1", "7"), params());
    expect(res.status).toBe(500);
    expect(mockWithDbTransaction).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when a non-Error is thrown", async () => {
    mockGetAlbumByReleaseAndFriend.mockRejectedValue("db down");
    const res = await DELETE(deleteReq("r1", "7"), params());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Unknown error");
  });
});

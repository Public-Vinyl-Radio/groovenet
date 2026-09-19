import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockSearchAlbums, mockWithDbTransaction, mockUpdateAlbumFields, mockGetTracks } =
  vi.hoisted(() => ({
    mockSearchAlbums: vi.fn(),
    mockWithDbTransaction: vi.fn(),
    mockUpdateAlbumFields: vi.fn(),
    mockGetTracks: vi.fn(),
  }));

vi.mock("@/server/services/albumApiService", () => ({
  albumApiService: { searchAlbums: mockSearchAlbums },
}));

vi.mock("@/lib/serverDb", () => ({ withDbTransaction: mockWithDbTransaction }));

vi.mock("@/server/repositories/albumRepository", () => ({
  albumRepository: {
    updateAlbumFields: mockUpdateAlbumFields,
    getTracksForAlbumWithLibraryIdentifier: mockGetTracks,
  },
}));

import { GET, PATCH } from "../route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getReq(query = "") {
  return new NextRequest(`http://localhost/api/albums${query}`);
}

function patchReq(body: unknown) {
  return new NextRequest("http://localhost/api/albums", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockSearchAlbums.mockResolvedValue({ albums: [], total: 0 });
  // Run the transaction callback with a stub client by default.
  mockWithDbTransaction.mockImplementation(async (cb: (c: unknown) => unknown) => cb({}));
  mockUpdateAlbumFields.mockResolvedValue({ release_id: "r1" });
  mockGetTracks.mockResolvedValue([]);
});

// ─── GET ────────────────────────────────────────────────────────────────────

describe("GET /api/albums", () => {
  it("applies defaults when no query params are provided", async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(mockSearchAlbums).toHaveBeenCalledWith({
      q: "",
      limit: 20,
      offset: 0,
      friendId: null,
      sort: "created_at:desc",
      missingLibraryIdentifier: undefined,
      missingLocalCoverArtUrl: undefined,
      missingAudio: undefined,
    });
  });

  it("parses query params and maps missing_* flags", async () => {
    await GET(
      getReq(
        "?q=jazz&limit=5&offset=10&friend_id=3&sort=year:asc" +
          "&missing_library_identifier=1&missing_local_cover_art_url=1&missing_audio=1"
      )
    );
    expect(mockSearchAlbums).toHaveBeenCalledWith({
      q: "jazz",
      limit: 5,
      offset: 10,
      friendId: "3",
      sort: "year:asc",
      missingLibraryIdentifier: true,
      missingLocalCoverArtUrl: true,
      missingAudio: true,
    });
  });

  it("treats missing_* values other than '1' as undefined", async () => {
    await GET(getReq("?missing_audio=0&missing_library_identifier=true"));
    const arg = mockSearchAlbums.mock.calls[0][0];
    expect(arg.missingAudio).toBeUndefined();
    expect(arg.missingLibraryIdentifier).toBeUndefined();
  });

  it("returns the service response body", async () => {
    mockSearchAlbums.mockResolvedValueOnce({ albums: [{ release_id: "r1" }], total: 1 });
    const res = await GET(getReq());
    expect(await res.json()).toEqual({ albums: [{ release_id: "r1" }], total: 1 });
  });

  it("returns 500 with a message when the service throws", async () => {
    mockSearchAlbums.mockRejectedValueOnce(new Error("boom"));
    const res = await GET(getReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to search/i);
    expect(body.message).toBe("boom");
  });
});

// ─── PATCH ────────────────────────────────────────────────────────────────────

describe("PATCH /api/albums — validation", () => {
  it("returns 400 when release_id is missing", async () => {
    const res = await PATCH(patchReq({ friend_id: 1, album_rating: 5 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });

  it("returns 400 when friend_id is missing", async () => {
    const res = await PATCH(patchReq({ release_id: "r1", album_rating: 5 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when no updatable fields are provided", async () => {
    const res = await PATCH(patchReq({ release_id: "r1", friend_id: 1 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no fields/i);
  });

  it("returns 400 when library_identifier exceeds 50 characters", async () => {
    const res = await PATCH(
      patchReq({ release_id: "r1", friend_id: 1, library_identifier: "x".repeat(51) })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/50 characters/i);
  });

  it("allows a null library_identifier (clearing the field)", async () => {
    const res = await PATCH(
      patchReq({ release_id: "r1", friend_id: 1, library_identifier: null })
    );
    expect(res.status).toBe(200);
    expect(mockUpdateAlbumFields).toHaveBeenCalled();
  });
});

describe("PATCH /api/albums — behavior", () => {
  it("returns 404 when the album is not found", async () => {
    mockUpdateAlbumFields.mockResolvedValueOnce(null);
    const res = await PATCH(patchReq({ release_id: "r1", friend_id: 1, album_rating: 4 }));
    expect(res.status).toBe(404);
  });

  it("returns tracksUpdated count when library_identifier changes", async () => {
    mockGetTracks.mockResolvedValueOnce([{ track_id: "t1" }, { track_id: "t2" }]);
    const res = await PATCH(
      patchReq({ release_id: "r1", friend_id: 1, library_identifier: "LIB-1" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.tracksUpdated).toBe(2);
  });

  it("does not fetch tracks when library_identifier is not part of the update", async () => {
    const res = await PATCH(patchReq({ release_id: "r1", friend_id: 1, album_rating: 5 }));
    expect(res.status).toBe(200);
    expect((await res.json()).tracksUpdated).toBe(0);
    expect(mockGetTracks).not.toHaveBeenCalled();
  });

  it("swallows track-fetch errors and still returns 200", async () => {
    mockGetTracks.mockRejectedValueOnce(new Error("tracks boom"));
    const res = await PATCH(
      patchReq({ release_id: "r1", friend_id: 1, library_identifier: "LIB-1" })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).tracksUpdated).toBe(0);
  });

  it("returns 409 on a duplicate library-identifier constraint violation", async () => {
    mockWithDbTransaction.mockRejectedValueOnce(
      new Error("duplicate key value violates idx_albums_unique_friend_library_identifier")
    );
    const res = await PATCH(
      patchReq({ release_id: "r1", friend_id: 1, library_identifier: "LIB-1" })
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/duplicate library identifier/i);
  });

  it("returns 500 on a generic error", async () => {
    mockWithDbTransaction.mockRejectedValueOnce(new Error("db exploded"));
    const res = await PATCH(patchReq({ release_id: "r1", friend_id: 1, album_rating: 3 }));
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe("db exploded");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockWithDbTransaction,
  mockGenTrackId,
  mockSaveAlbumCover,
  mockUpsertAlbum,
  mockGetUsername,
  mockGetAlbumThumbnail,
  mockListTrackIds,
  mockDeleteTracks,
  mockUpsertTrack,
} = vi.hoisted(() => ({
  mockWithDbTransaction: vi.fn(),
  mockGenTrackId: vi.fn(),
  mockSaveAlbumCover: vi.fn(),
  mockUpsertAlbum: vi.fn(),
  mockGetUsername: vi.fn(),
  mockGetAlbumThumbnail: vi.fn(),
  mockListTrackIds: vi.fn(),
  mockDeleteTracks: vi.fn(),
  mockUpsertTrack: vi.fn(),
}));

vi.mock("@/lib/serverDb", () => ({ withDbTransaction: mockWithDbTransaction }));
vi.mock("@/lib/localTrackHelpers", () => ({ generateLocalTrackId: mockGenTrackId }));
vi.mock("@/lib/fileUpload", () => ({ saveAlbumCover: mockSaveAlbumCover }));
vi.mock("@/server/services/albumUpsertService", () => ({ upsertAlbum: mockUpsertAlbum }));
vi.mock("@/server/repositories/albumRepository", () => ({
  albumRepository: {
    getFriendUsernameById: mockGetUsername,
    getAlbumThumbnail: mockGetAlbumThumbnail,
    listTrackIdsForAlbum: mockListTrackIds,
    deleteTracksByIds: mockDeleteTracks,
    upsertTrackByTrackIdUsername: mockUpsertTrack,
  },
}));

import { POST } from "../route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALBUM = { title: "Album", artist: "Artist", year: "2000" };
const TRACKS = [{ track_id: "t1", title: "Song 1", artist: "Artist" }];

function makeReq(
  fields: {
    release_id?: string;
    album?: unknown;
    tracks?: unknown;
    friend_id?: string;
    cover_art?: File;
    omit?: string[];
  } = {}
) {
  const fd = new FormData();
  const omit = fields.omit ?? [];
  if (!omit.includes("release_id"))
    fd.set("release_id", fields.release_id ?? "r1");
  if (!omit.includes("album")) fd.set("album", JSON.stringify(fields.album ?? ALBUM));
  if (!omit.includes("tracks"))
    fd.set("tracks", JSON.stringify(fields.tracks ?? TRACKS));
  if (!omit.includes("friend_id")) fd.set("friend_id", fields.friend_id ?? "1");
  if (fields.cover_art) fd.set("cover_art", fields.cover_art);
  return new NextRequest("http://localhost/api/albums/upsert", {
    method: "POST",
    body: fd,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockWithDbTransaction.mockImplementation(async (cb: (c: unknown) => unknown) => cb({}));
  mockGenTrackId.mockReturnValue("local-trk-new");
  mockGetUsername.mockResolvedValue("alice");
  mockGetAlbumThumbnail.mockResolvedValue(null);
  mockListTrackIds.mockResolvedValue([]);
  mockDeleteTracks.mockResolvedValue(undefined);
  mockUpsertAlbum.mockResolvedValue({ release_id: "r1" });
  mockUpsertTrack.mockImplementation(async (_c: unknown, row: unknown[]) => ({
    track_id: row[0],
  }));
});

// ─── Validation ────────────────────────────────────────────────────────────────

describe("POST /api/albums/upsert — validation", () => {
  it("returns 400 when release_id is missing", async () => {
    const res = await POST(makeReq({ omit: ["release_id"] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/missing required/i);
  });

  it("returns 400 when album title/artist are missing", async () => {
    const res = await POST(makeReq({ album: { title: "", artist: "" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/title and artist/i);
  });

  it("returns 400 when there are no tracks", async () => {
    const res = await POST(makeReq({ tracks: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when friend_id is not a number", async () => {
    const res = await POST(makeReq({ friend_id: "nope" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid friend_id/i);
  });

  it("returns 400 when a track is missing title/artist", async () => {
    const res = await POST(makeReq({ tracks: [{ track_id: "t1", title: "", artist: "A" }] }));
    expect(res.status).toBe(400);
  });
});

// ─── Cover art + friend lookup ──────────────────────────────────────────────────

describe("POST /api/albums/upsert — cover art and friend lookup", () => {
  it("returns 413 when cover art upload fails", async () => {
    mockSaveAlbumCover.mockRejectedValueOnce(new Error("too big"));
    const cover = new File(["x".repeat(10)], "cover.jpg", { type: "image/jpeg" });
    const res = await POST(makeReq({ cover_art: cover }));
    expect(res.status).toBe(413);
  });

  it("returns 404 when the friend is not found", async () => {
    mockGetUsername.mockResolvedValueOnce(null);
    const res = await POST(makeReq());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/friend not found/i);
  });
});

// ─── Track diffing ──────────────────────────────────────────────────────────────

describe("POST /api/albums/upsert — track reconciliation", () => {
  it("deletes existing tracks that are no longer in the update", async () => {
    mockListTrackIds.mockResolvedValueOnce(["t1", "t2", "t3"]);
    const res = await POST(
      makeReq({ tracks: [{ track_id: "t1", title: "Keep", artist: "A" }] })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deletedTracks).toBe(2);
    expect(mockDeleteTracks).toHaveBeenCalledWith({}, ["t2", "t3"], 1);
  });

  it("does not call delete when nothing needs removing", async () => {
    mockListTrackIds.mockResolvedValueOnce(["t1"]);
    const res = await POST(
      makeReq({ tracks: [{ track_id: "t1", title: "Keep", artist: "A" }] })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).deletedTracks).toBe(0);
    expect(mockDeleteTracks).not.toHaveBeenCalled();
  });

  it("generates ids for new tracks that have no track_id", async () => {
    mockListTrackIds.mockResolvedValueOnce([]);
    const res = await POST(
      makeReq({ tracks: [{ title: "Brand New", artist: "A" }] })
    );
    expect(res.status).toBe(200);
    expect(mockGenTrackId).toHaveBeenCalledOnce();
    const body = await res.json();
    expect(body.tracks).toEqual([{ track_id: "local-trk-new" }]);
  });
});

// ─── Error handling ─────────────────────────────────────────────────────────────

describe("POST /api/albums/upsert — error handling", () => {
  it("returns 500 when the transaction throws", async () => {
    mockWithDbTransaction.mockRejectedValueOnce(new Error("tx failed"));
    const res = await POST(makeReq());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("tx failed");
  });
});

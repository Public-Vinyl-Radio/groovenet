import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockWithDbTransaction,
  mockGenReleaseId,
  mockGenTrackId,
  mockSaveAlbumCover,
  mockUpsertAlbum,
  mockGetUsername,
  mockInsertTrack,
} = vi.hoisted(() => ({
  mockWithDbTransaction: vi.fn(),
  mockGenReleaseId: vi.fn(),
  mockGenTrackId: vi.fn(),
  mockSaveAlbumCover: vi.fn(),
  mockUpsertAlbum: vi.fn(),
  mockGetUsername: vi.fn(),
  mockInsertTrack: vi.fn(),
}));

vi.mock("@/lib/serverDb", () => ({ withDbTransaction: mockWithDbTransaction }));
vi.mock("@/lib/localTrackHelpers", () => ({
  generateLocalReleaseId: mockGenReleaseId,
  generateLocalTrackId: mockGenTrackId,
}));
vi.mock("@/lib/fileUpload", () => ({ saveAlbumCover: mockSaveAlbumCover }));
vi.mock("@/server/services/albumUpsertService", () => ({ upsertAlbum: mockUpsertAlbum }));
vi.mock("@/server/repositories/albumRepository", () => ({
  albumRepository: {
    getFriendUsernameById: mockGetUsername,
    insertTrack: mockInsertTrack,
  },
}));

import { POST } from "../route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALBUM = { title: "Album", artist: "Artist", year: "2000" };
const TRACKS = [{ title: "Song 1", artist: "Artist" }];

function makeReq(
  fields: {
    album?: unknown;
    tracks?: unknown;
    friend_id?: string;
    cover_art?: File;
    omit?: string[];
  } = {}
) {
  const fd = new FormData();
  const omit = fields.omit ?? [];
  if (!omit.includes("album"))
    fd.set("album", JSON.stringify(fields.album ?? ALBUM));
  if (!omit.includes("tracks"))
    fd.set("tracks", JSON.stringify(fields.tracks ?? TRACKS));
  if (!omit.includes("friend_id")) fd.set("friend_id", fields.friend_id ?? "1");
  if (fields.cover_art) fd.set("cover_art", fields.cover_art);
  return new NextRequest("http://localhost/api/albums/create", {
    method: "POST",
    body: fd,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockWithDbTransaction.mockImplementation(async (cb: (c: unknown) => unknown) => cb({}));
  mockGenReleaseId.mockReturnValue("local-rel-1");
  mockGenTrackId.mockReturnValue("local-trk-1");
  mockGetUsername.mockResolvedValue("alice");
  mockUpsertAlbum.mockResolvedValue({ release_id: "local-rel-1" });
  mockInsertTrack.mockResolvedValue({ track_id: "local-trk-1" });
});

// ─── Validation ────────────────────────────────────────────────────────────────

describe("POST /api/albums/create — validation", () => {
  it("returns 400 when a required field is missing", async () => {
    const res = await POST(makeReq({ omit: ["album"] }));
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
    expect((await res.json()).error).toMatch(/at least one track/i);
  });

  it("returns 400 when friend_id is not a number", async () => {
    const res = await POST(makeReq({ friend_id: "abc" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid friend_id/i);
  });

  it("returns 400 when a track is missing title/artist", async () => {
    const res = await POST(makeReq({ tracks: [{ title: "ok", artist: "" }] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/all tracks must have/i);
  });
});

// ─── Cover art + friend lookup ──────────────────────────────────────────────────

describe("POST /api/albums/create — cover art and friend lookup", () => {
  it("returns 413 when cover art upload fails", async () => {
    mockSaveAlbumCover.mockRejectedValueOnce(new Error("file too large"));
    const cover = new File(["x".repeat(10)], "cover.jpg", { type: "image/jpeg" });
    const res = await POST(makeReq({ cover_art: cover }));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/file too large/i);
  });

  it("returns 404 when the friend is not found", async () => {
    mockGetUsername.mockResolvedValueOnce(null);
    const res = await POST(makeReq());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/friend not found/i);
  });
});

// ─── Success ────────────────────────────────────────────────────────────────────

describe("POST /api/albums/create — success", () => {
  it("creates the album and its tracks and returns them", async () => {
    mockUpsertAlbum.mockResolvedValueOnce({ release_id: "local-rel-1", title: "Album" });
    mockInsertTrack
      .mockResolvedValueOnce({ track_id: "a" })
      .mockResolvedValueOnce({ track_id: "b" });
    const res = await POST(
      makeReq({
        tracks: [
          { title: "S1", artist: "A" },
          { title: "S2", artist: "A" },
        ],
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.album).toEqual({ release_id: "local-rel-1", title: "Album" });
    expect(body.tracks).toHaveLength(2);
    expect(mockUpsertAlbum).toHaveBeenCalledOnce();
    expect(mockInsertTrack).toHaveBeenCalledTimes(2);
  });

  it("passes the generated release id into the album upsert", async () => {
    mockGenReleaseId.mockReturnValueOnce("local-rel-XYZ");
    await POST(makeReq());
    const [, albumArg] = mockUpsertAlbum.mock.calls[0];
    expect(albumArg.release_id).toBe("local-rel-XYZ");
    expect(albumArg.track_count).toBe(1);
  });
});

// ─── Error handling ─────────────────────────────────────────────────────────────

describe("POST /api/albums/create — error handling", () => {
  it("returns 500 when the transaction throws", async () => {
    mockWithDbTransaction.mockRejectedValueOnce(new Error("tx failed"));
    const res = await POST(makeReq());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("tx failed");
  });
});

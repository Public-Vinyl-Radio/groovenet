import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockFindAudioMeta,
  mockUpdateTrackArt,
  mockUpdateAlbumCover,
  mockUpdateAlbumArt,
  mockResolvePath,
  mockRunFfprobe,
  mockGetAttachedPic,
  mockMkdirSync,
  mockExecFile,
} = vi.hoisted(() => ({
  mockFindAudioMeta: vi.fn(),
  mockUpdateTrackArt: vi.fn(),
  mockUpdateAlbumCover: vi.fn(),
  mockUpdateAlbumArt: vi.fn(),
  mockResolvePath: vi.fn(),
  mockRunFfprobe: vi.fn(),
  mockGetAttachedPic: vi.fn(),
  mockMkdirSync: vi.fn(),
  // promisify(execFile) drives this via the (file, args, cb) callback contract.
  mockExecFile: vi.fn((_file: string, _args: string[], cb: (e: unknown, r?: unknown) => void) =>
    cb(null, { stdout: "", stderr: "" })
  ),
}));

vi.mock("fs", () => ({ default: { mkdirSync: mockMkdirSync } }));
vi.mock("child_process", () => ({ execFile: mockExecFile }));
vi.mock("@/server/repositories/trackRepository", () => ({
  trackRepository: {
    findTrackAudioMetadata: mockFindAudioMeta,
    updateTrackAudioFileAlbumArtUrl: mockUpdateTrackArt,
  },
}));
vi.mock("@/server/repositories/albumRepository", () => ({
  albumRepository: {
    updateAlbumCoverForRelease: mockUpdateAlbumCover,
    updateAlbumAudioFileAlbumArtUrl: mockUpdateAlbumArt,
  },
}));
vi.mock("@/server/services/trackAudioMetadataService", () => ({
  trackAudioMetadataService: {
    resolveAudioFilePath: mockResolvePath,
    runFfprobe: mockRunFfprobe,
    getAttachedPicStream: mockGetAttachedPic,
  },
}));

import { GET, POST } from "../route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getReq(query = "?friend_id=1") {
  return new NextRequest(`http://localhost/api/tracks/t1/audio-metadata${query}`);
}

function postReq(body: unknown = { friend_id: 1 }) {
  return new NextRequest("http://localhost/api/tracks/t1/audio-metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function params(id = "t1") {
  return { params: Promise.resolve({ id }) };
}

const TRACK = {
  track_id: "t1",
  friend_id: 1,
  local_audio_url: "song.m4a",
  audio_file_album_art_url: null,
  release_id: null as string | null,
};

const PIC = {
  index: 2,
  codec_name: "mjpeg",
  width: 500,
  height: 500,
  pix_fmt: "yuvj420p",
};

beforeEach(() => {
  vi.resetAllMocks();
  mockFindAudioMeta.mockResolvedValue({ ...TRACK });
  mockResolvePath.mockReturnValue("/audio/song.m4a");
  mockRunFfprobe.mockResolvedValue({ streams: [] });
  mockGetAttachedPic.mockReturnValue(null);
  mockExecFile.mockImplementation(
    (_f: string, _a: string[], cb: (e: unknown, r?: unknown) => void) =>
      cb(null, { stdout: "", stderr: "" })
  );
});

// ─── GET ────────────────────────────────────────────────────────────────────

describe("GET /api/tracks/[id]/audio-metadata", () => {
  it("returns 400 when friend_id is missing", async () => {
    const res = await GET(getReq(""), params());
    expect(res.status).toBe(400);
    expect(mockFindAudioMeta).not.toHaveBeenCalled();
  });

  it("returns 404 when the track is not found", async () => {
    mockFindAudioMeta.mockResolvedValueOnce(null);
    const res = await GET(getReq(), params());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/not found/i);
  });

  it("returns 404 when the track has no local_audio_url", async () => {
    mockFindAudioMeta.mockResolvedValueOnce({ ...TRACK, local_audio_url: null });
    const res = await GET(getReq(), params());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/no local_audio_url/i);
  });

  it("returns 404 when the audio file cannot be resolved on disk", async () => {
    mockResolvePath.mockReturnValueOnce(null);
    const res = await GET(getReq(), params());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/file not found/i);
  });

  it("reports has_embedded_cover=false with a null cover when none is attached", async () => {
    const res = await GET(getReq(), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.has_embedded_cover).toBe(false);
    expect(body.embedded_cover).toBeNull();
    expect(body.probe).toEqual({ streams: [] });
  });

  it("returns embedded cover details when a picture stream is present", async () => {
    mockGetAttachedPic.mockReturnValueOnce(PIC);
    const res = await GET(getReq(), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.has_embedded_cover).toBe(true);
    expect(body.embedded_cover).toEqual({
      index: 2,
      codec_name: "mjpeg",
      width: 500,
      height: 500,
      pix_fmt: "yuvj420p",
    });
  });

  it("returns 500 when ffprobe throws", async () => {
    mockRunFfprobe.mockRejectedValueOnce(new Error("ffprobe boom"));
    const res = await GET(getReq(), params());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("ffprobe boom");
  });
});

// ─── POST ─────────────────────────────────────────────────────────────────────

describe("POST /api/tracks/[id]/audio-metadata", () => {
  it("returns 400 when friend_id is missing/invalid (incl. unparseable body)", async () => {
    const res = await POST(postReq({}), params());
    expect(res.status).toBe(400);
  });

  it("returns 404 when the track is not found", async () => {
    mockFindAudioMeta.mockResolvedValueOnce(null);
    const res = await POST(postReq(), params());
    expect(res.status).toBe(404);
  });

  it("returns 404 when there is no embedded cover art to extract", async () => {
    mockGetAttachedPic.mockReturnValueOnce(null);
    const res = await POST(postReq(), params());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/no embedded cover/i);
  });

  it("extracts the cover and saves it to the track when there is no release_id", async () => {
    mockFindAudioMeta.mockResolvedValueOnce({ ...TRACK, release_id: null });
    mockGetAttachedPic.mockReturnValueOnce(PIC);
    const res = await POST(postReq(), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.audio_file_album_art_url).toBe("/uploads/album-covers/t1_1.jpg");
    expect(body.message).toMatch(/saved to track/i);
    expect(mockUpdateTrackArt).toHaveBeenCalledWith("t1", 1, "/uploads/album-covers/t1_1.jpg");
    expect(mockUpdateAlbumCover).not.toHaveBeenCalled();
  });

  it("updates the whole album when the track has a release_id", async () => {
    mockFindAudioMeta.mockResolvedValueOnce({ ...TRACK, release_id: "rel-9" });
    mockGetAttachedPic.mockReturnValueOnce(PIC);
    const res = await POST(postReq(), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toMatch(/all tracks on the album/i);
    expect(mockUpdateAlbumCover).toHaveBeenCalledWith(1, "rel-9", "/uploads/album-covers/t1_1.jpg");
    expect(mockUpdateAlbumArt).toHaveBeenCalledWith("rel-9", 1, "/uploads/album-covers/t1_1.jpg");
    expect(mockUpdateTrackArt).not.toHaveBeenCalled();
  });

  it("sanitizes unsafe characters in the output filename", async () => {
    mockFindAudioMeta.mockResolvedValueOnce({ ...TRACK, track_id: "a/b c", release_id: null });
    mockGetAttachedPic.mockReturnValueOnce(PIC);
    const res = await POST(postReq(), params("a/b c"));
    expect(res.status).toBe(200);
    expect((await res.json()).audio_file_album_art_url).toBe(
      "/uploads/album-covers/a_b_c_1.jpg"
    );
  });

  it("returns 500 when ffmpeg extraction fails", async () => {
    mockGetAttachedPic.mockReturnValueOnce(PIC);
    mockExecFile.mockImplementationOnce(
      (_f: string, _a: string[], cb: (e: unknown) => void) => cb(new Error("ffmpeg failed"))
    );
    const res = await POST(postReq(), params());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("ffmpeg failed");
  });
});

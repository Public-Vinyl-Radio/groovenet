import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AlbumArtworkRow } from "@/server/repositories/albumRepository";

const repo = vi.hoisted(() => ({
  getAlbumArtwork: vi.fn(),
  getTracksForReleaseWithAudio: vi.fn(),
  setAlbumDisplayArt: vi.fn(),
  setAppleMusicArtUrl: vi.fn(),
  recordArtMatch: vi.fn(),
  listArtworkReview: vi.fn(),
}));
vi.mock("@/server/repositories/albumRepository", () => ({ albumRepository: repo }));

const audio = vi.hoisted(() => ({
  resolveAudioFilePath: vi.fn(),
  runFfprobe: vi.fn(),
  getAttachedPicStream: vi.fn(),
  extractAttachedPic: vi.fn(),
}));
vi.mock("@/server/services/trackAudioMetadataService", () => ({
  trackAudioMetadataService: audio,
}));

const saveAlbumCover = vi.hoisted(() => vi.fn());
vi.mock("@/lib/fileUpload", () => ({ saveAlbumCover }));

import { AlbumArtworkError, AlbumArtworkService } from "../albumArtworkService";

const DISCOGS = "https://i.discogs.com/r1.jpg";

async function cover(variant: "a" | "b", size = 400): Promise<Buffer> {
  const shapes =
    variant === "a"
      ? `<rect x="10%" y="10%" width="35%" height="35%" fill="#d33"/><circle cx="70%" cy="70%" r="20%" fill="#fff"/>`
      : `<rect x="55%" y="5%" width="40%" height="80%" fill="#111"/><circle cx="25%" cy="75%" r="15%" fill="#ee0"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="100%" height="100%" fill="#357"/>${shapes}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function album(overrides: Partial<AlbumArtworkRow> = {}): AlbumArtworkRow {
  return {
    release_id: "r1",
    friend_id: 7,
    title: "Blue Lines",
    artist: "Massive Attack",
    album_thumbnail: DISCOGS,
    audio_file_album_art_url: null,
    album_art_source: null,
    discogs_art_url: DISCOGS,
    apple_music_art_url: null,
    art_match_status: null,
    art_match_distance: null,
    ...overrides,
  };
}

function withEmbeddedArt(image: Buffer) {
  repo.getTracksForReleaseWithAudio.mockResolvedValue([
    { track_id: "t0", friend_id: 7, release_id: "r1", local_audio_url: null },
    { track_id: "t1", friend_id: 7, release_id: "r1", local_audio_url: "gone.m4a" },
    { track_id: "t2", friend_id: 7, release_id: "r1", local_audio_url: "a.m4a" },
  ]);
  audio.resolveAudioFilePath.mockImplementation((name: string) =>
    name === "a.m4a" ? "/app/audio/a.m4a" : null
  );
  audio.runFfprobe.mockResolvedValue({ streams: [] });
  audio.getAttachedPicStream.mockReturnValue({ index: 1 });
  audio.extractAttachedPic.mockResolvedValue(image);
}

function mockFetch(response: Partial<Response> | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function imageResponse(body: Buffer): Partial<Response> {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
  };
}

let tmp: string;
const service = new AlbumArtworkService();
const coversDir = () => path.join(tmp, "public", "uploads", "album-covers");

beforeEach(() => {
  vi.resetAllMocks();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "artwork-"));
  vi.spyOn(process, "cwd").mockReturnValue(tmp);
  repo.getAlbumArtwork.mockResolvedValue(album());
  repo.getTracksForReleaseWithAudio.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("getState", () => {
  it("reports the displayed art, its source and whether audio exists", async () => {
    repo.getAlbumArtwork.mockResolvedValue(
      album({ audio_file_album_art_url: "/uploads/album-covers/x.jpg", album_art_source: "apple_music" })
    );
    repo.getTracksForReleaseWithAudio.mockResolvedValue([{ track_id: "t" }]);

    const state = await service.getState("r1", 7);

    expect(state).toMatchObject({
      current_url: "/uploads/album-covers/x.jpg",
      source: "apple_music",
      discogs_art_url: DISCOGS,
      has_local_audio: true,
    });
  });

  it("falls back to a remote album_thumbnail for the Discogs art, and null when there is no art", async () => {
    repo.getAlbumArtwork.mockResolvedValueOnce(album({ discogs_art_url: null }));
    expect((await service.getState("r1", 7)).discogs_art_url).toBe(DISCOGS);

    repo.getAlbumArtwork.mockResolvedValueOnce(
      album({ discogs_art_url: null, album_thumbnail: null })
    );
    const empty = await service.getState("r1", 7);
    expect(empty.discogs_art_url).toBeNull();
    expect(empty.current_url).toBeNull();
    expect(empty.has_local_audio).toBe(false);
  });

  it("is a 404 for an unknown album", async () => {
    repo.getAlbumArtwork.mockResolvedValue(null);
    await expect(service.getState("r1", 7)).rejects.toMatchObject({ status: 404 });
  });
});

describe("previewAppleMusicArtwork", () => {
  it("extracts and caches the embedded cover without changing the display", async () => {
    withEmbeddedArt(await cover("a", 600));

    const preview = await service.previewAppleMusicArt("r1", 7);

    expect(preview).toMatchObject({ width: 600, height: 600, track_id: "t2" });
    expect(preview.url).toMatch(/^\/uploads\/album-covers\/apple_r1_7_[0-9a-f]{12}\.jpg$/);
    expect(fs.existsSync(path.join(coversDir(), path.basename(preview.url)))).toBe(true);
    expect(repo.setAppleMusicArtUrl).toHaveBeenCalledWith("r1", 7, preview.url);
    expect(repo.setAlbumDisplayArt).not.toHaveBeenCalled();
  });

  it("skips tracks without an attached picture and 404s when none has one", async () => {
    withEmbeddedArt(await cover("a"));
    audio.getAttachedPicStream.mockReturnValue(null);

    await expect(service.previewAppleMusicArt("r1", 7)).rejects.toMatchObject({
      status: 404,
      message: "No downloaded track on this album has embedded cover art",
    });
  });

  it("rejects embedded data that is not an image", async () => {
    withEmbeddedArt(Buffer.from("not an image"));
    await expect(service.previewAppleMusicArt("r1", 7)).rejects.toMatchObject({ status: 422 });
  });
});

describe("apply", () => {
  it("applies the previewed Apple Music cover when it is still cached", async () => {
    fs.mkdirSync(coversDir(), { recursive: true });
    fs.writeFileSync(path.join(coversDir(), "apple_r1_7_abc.jpg"), "x");
    repo.getAlbumArtwork.mockResolvedValue(
      album({ apple_music_art_url: "/uploads/album-covers/apple_r1_7_abc.jpg" })
    );

    await service.apply("r1", 7, "apple_music");

    expect(audio.extractAttachedPic).not.toHaveBeenCalled();
    expect(repo.setAlbumDisplayArt).toHaveBeenCalledWith(
      "r1",
      7,
      "/uploads/album-covers/apple_r1_7_abc.jpg",
      "apple_music"
    );
  });

  it("re-extracts the Apple Music cover when the cached file is gone", async () => {
    repo.getAlbumArtwork.mockResolvedValue(
      album({ apple_music_art_url: "/uploads/album-covers/missing.jpg" })
    );
    withEmbeddedArt(await cover("a"));

    await service.apply("r1", 7, "apple_music");

    const [, , url, source] = repo.setAlbumDisplayArt.mock.calls[0];
    expect(url).toMatch(/^\/uploads\/album-covers\/apple_/);
    expect(source).toBe("apple_music");
  });

  it("re-extracts when the stored Apple Music URL is not a local cover", async () => {
    repo.getAlbumArtwork.mockResolvedValue(album({ apple_music_art_url: "https://elsewhere/a.jpg" }));
    withEmbeddedArt(await cover("a"));

    await service.apply("r1", 7, "apple_music");

    expect(audio.extractAttachedPic).toHaveBeenCalled();
  });

  it("restores Discogs art by downloading and caching it locally", async () => {
    const fetchMock = mockFetch(imageResponse(await cover("a", 150)));

    await service.apply("r1", 7, "discogs");

    expect(fetchMock).toHaveBeenCalledWith(DISCOGS, expect.objectContaining({ headers: expect.any(Object) }));
    const [, , url, source] = repo.setAlbumDisplayArt.mock.calls[0];
    expect(url).toMatch(/^\/uploads\/album-covers\/discogs_r1_7_[0-9a-f]{12}\.jpg$/);
    expect(source).toBe("discogs");
    expect(fs.existsSync(path.join(coversDir(), path.basename(url)))).toBe(true);
  });

  it("is a 404 to restore Discogs art an album never had", async () => {
    repo.getAlbumArtwork.mockResolvedValue(
      album({ discogs_art_url: null, album_thumbnail: "/uploads/album-covers/u.jpg" })
    );
    await expect(service.apply("r1", 7, "discogs")).rejects.toMatchObject({ status: 404 });
  });

  it("is a 502 when the Discogs download fails", async () => {
    mockFetch({ ok: false, status: 404 });
    await expect(service.apply("r1", 7, "discogs")).rejects.toMatchObject({
      status: 502,
      message: "Could not download artwork: HTTP 404",
    });

    mockFetch(new Error("timeout"));
    await expect(service.apply("r1", 7, "discogs")).rejects.toMatchObject({
      status: 502,
      message: "Could not download artwork: timeout",
    });

    vi.stubGlobal("fetch", vi.fn(() => Promise.reject("socket hang up")));
    await expect(service.apply("r1", 7, "discogs")).rejects.toMatchObject({
      message: "Could not download artwork: socket hang up",
    });

    mockFetch(imageResponse(Buffer.alloc(16 * 1024 * 1024)));
    await expect(service.apply("r1", 7, "discogs")).rejects.toMatchObject({
      message: "Artwork download is too large",
    });
  });
});

describe("upload", () => {
  it("saves the file and makes it the displayed art", async () => {
    saveAlbumCover.mockResolvedValue("/uploads/album-covers/u.png");
    const file = new File(["x"], "c.png", { type: "image/png" });

    await service.upload("r1", 7, file);

    expect(saveAlbumCover).toHaveBeenCalledWith(file);
    expect(repo.setAlbumDisplayArt).toHaveBeenCalledWith("r1", 7, "/uploads/album-covers/u.png", "upload");
  });

  it("turns a rejected file into a 400", async () => {
    saveAlbumCover.mockRejectedValueOnce(new Error("File too large. Maximum size is 5MB."));
    await expect(service.upload("r1", 7, new File(["x"], "c.png"))).rejects.toMatchObject({
      status: 400,
      message: "File too large. Maximum size is 5MB.",
    });

    saveAlbumCover.mockRejectedValueOnce("disk full");
    await expect(service.upload("r1", 7, new File(["x"], "c.png"))).rejects.toMatchObject({
      message: "Failed to save cover art",
    });
  });

  it("records a form upload as the displayed art", async () => {
    await service.useUploadedCover("r1", 7, "/uploads/album-covers/f.jpg");
    expect(repo.setAlbumDisplayArt).toHaveBeenCalledWith("r1", 7, "/uploads/album-covers/f.jpg", "upload");
  });
});

describe("match", () => {
  it("applies Apple Music art that matches the Discogs cover", async () => {
    withEmbeddedArt(await cover("a", 1000));
    mockFetch(imageResponse(await sharp(await cover("a", 150)).jpeg({ quality: 60 }).toBuffer()));

    const result = await service.match("r1", 7);

    expect(result.status).toBe("matched");
    expect(result.applied).toBe(true);
    expect(result.distance).toBeLessThanOrEqual(10);
    expect(repo.setAlbumDisplayArt).toHaveBeenCalledWith("r1", 7, result.apple_music_art_url, "apple_music");
    expect(repo.recordArtMatch).toHaveBeenCalledWith("r1", 7, "matched", result.distance);
  });

  it("flags a different cover for review instead of applying it", async () => {
    withEmbeddedArt(await cover("b"));
    mockFetch(imageResponse(await cover("a")));

    const result = await service.match("r1", 7);

    expect(result).toMatchObject({ status: "mismatch", applied: false });
    expect(result.distance).toBeGreaterThan(10);
    expect(repo.setAlbumDisplayArt).not.toHaveBeenCalled();
    expect(repo.recordArtMatch).toHaveBeenCalledWith("r1", 7, "mismatch", result.distance);
  });

  it("records no_reference when there is no Discogs art to compare with", async () => {
    // A local album_thumbnail is an upload, not Discogs art.
    repo.getAlbumArtwork.mockResolvedValue(
      album({ discogs_art_url: null, album_thumbnail: "/uploads/album-covers/d.jpg" })
    );
    withEmbeddedArt(await cover("a"));

    const result = await service.match("r1", 7);

    expect(result).toMatchObject({ status: "no_reference", applied: false });
    expect(result.apple_music_art_url).toMatch(/^\/uploads\/album-covers\/apple_/);
    expect(repo.recordArtMatch).toHaveBeenCalledWith("r1", 7, "no_reference", null);
    expect(repo.setAlbumDisplayArt).not.toHaveBeenCalled();
  });

  it("records no_candidate when no track has embedded art", async () => {
    const result = await service.match("r1", 7);
    expect(result).toEqual({
      release_id: "r1",
      friend_id: 7,
      status: "no_candidate",
      distance: null,
      applied: false,
      apple_music_art_url: null,
    });
    expect(repo.recordArtMatch).toHaveBeenCalledWith("r1", 7, "no_candidate", null);
  });

  it("leaves the album unmatched when the Discogs download fails, so a later run retries", async () => {
    withEmbeddedArt(await cover("a"));
    mockFetch({ ok: false, status: 503 });

    await expect(service.match("r1", 7)).rejects.toBeInstanceOf(AlbumArtworkError);
    expect(repo.recordArtMatch).not.toHaveBeenCalled();
  });

  it("rethrows unexpected extraction failures", async () => {
    withEmbeddedArt(await cover("a"));
    audio.runFfprobe.mockRejectedValue(new Error("ffprobe crashed"));
    await expect(service.match("r1", 7)).rejects.toThrow("ffprobe crashed");
    expect(repo.recordArtMatch).not.toHaveBeenCalled();
  });
});

describe("listReview", () => {
  it("maps flagged albums to review items", async () => {
    repo.listArtworkReview.mockResolvedValue([
      album({ art_match_status: "mismatch", art_match_distance: 22, apple_music_art_url: "/uploads/album-covers/a.jpg" }),
      album({ release_id: "r2", album_thumbnail: null, discogs_art_url: null, art_match_status: "no_reference" }),
    ]);

    const items = await service.listReview(7, 50);

    expect(repo.listArtworkReview).toHaveBeenCalledWith(7, 50);
    expect(items[0]).toEqual({
      release_id: "r1",
      friend_id: 7,
      title: "Blue Lines",
      artist: "Massive Attack",
      current_url: DISCOGS,
      discogs_art_url: DISCOGS,
      apple_music_art_url: "/uploads/album-covers/a.jpg",
      art_match_status: "mismatch",
      art_match_distance: 22,
    });
    expect(items[1]).toMatchObject({ current_url: null, discogs_art_url: null });
  });
});

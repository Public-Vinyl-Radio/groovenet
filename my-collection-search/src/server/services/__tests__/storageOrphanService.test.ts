import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  listTracksWithAudio: vi.fn(),
  saveResult: vi.fn(),
  saveError: vi.fn(),
  getPage: vi.fn(),
  getFileBytes: vi.fn(),
}));
vi.mock("@/server/repositories/storageOrphanRepository", () => ({ storageOrphanRepository: repo }));

import { getOrphans, scanOrphans, startOrphanScan } from "../storageOrphanService";

let root: string;
const OLD = new Date("2026-01-01T00:00:00Z");

function put(rel: string, bytes = 10, mtime: Date = OLD) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Buffer.alloc(bytes));
  fs.utimesSync(full, mtime, mtime);
}

const track = (id: string, url: string) => ({
  track_id: id,
  username: "adam",
  title: `T${id}`,
  artist: "A",
  local_audio_url: url,
});

beforeEach(() => {
  vi.resetAllMocks();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "orphans-"));
  vi.stubEnv("AUDIO_DIR", path.join(root, "audio"));
  vi.stubEnv("AUDIO_INGEST_DIR", path.join(root, "audio", "ingest"));
  vi.stubEnv("SET_RECORDINGS_DIR", path.join(root, "audio", "sets"));
  root = path.join(root, "audio");
  fs.mkdirSync(root, { recursive: true });
  repo.listTracksWithAudio.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(path.dirname(root), { recursive: true, force: true });
});

describe("scanOrphans", () => {
  it("lists audio no track resolves to, largest first, and tracks with no file", async () => {
    put("kept.mp3");
    put("sub/small.flac", 5);
    put("big.m4a", 50);
    repo.listTracksWithAudio.mockResolvedValue([
      track("1", "kept.mp3"),
      track("2", "/audio/gone.mp3"),
    ]);

    const result = await scanOrphans(Date.now());

    expect(result.files.map((f) => [f.path, f.size_bytes])).toEqual([
      ["big.m4a", 50],
      ["sub/small.flac", 5],
    ]);
    expect(result.files[0].modified_at).toBe(OLD.toISOString());
    expect(result.tracks.map((t) => t.track_id)).toEqual(["2"]);
  });

  it("resolves a track the way playback does: a URL, a prefix, a basename fallback", async () => {
    put("a.mp3");
    put("b.mp3");
    put("c.mp3");
    repo.listTracksWithAudio.mockResolvedValue([
      track("1", "http://x/api/audio?filename=a.mp3"),
      track("2", "app/audio/b.mp3"),
      track("3", "elsewhere/c.mp3"),
    ]);
    const result = await scanOrphans(Date.now());
    expect(result.files).toEqual([]);
    expect(result.tracks).toEqual([]);
  });

  it("skips other services' volumes, partial downloads, non-audio and fresh files", async () => {
    put("ingest/chunk.wav");
    put("sets/mix.wav");
    put("x.mp3.part");
    put("cover.jpg");
    put("fresh.mp3", 10, new Date());
    put("real.mp3");
    const result = await scanOrphans(Date.now());
    expect(result.files.map((f) => f.path)).toEqual(["real.mp3"]);
  });

  it("ignores symlinks and uses the default volumes and clock when nothing is configured", async () => {
    fs.symlinkSync(path.join(root, "nowhere.mp3"), path.join(root, "link.mp3"));
    expect((await scanOrphans()).files).toEqual([]);
    vi.stubEnv("AUDIO_DIR", "");
    vi.stubEnv("AUDIO_INGEST_DIR", "");
    vi.stubEnv("SET_RECORDINGS_DIR", "");
    expect(await scanOrphans()).toEqual({ files: [], tracks: [] });
  });

  it("is empty when the audio volume is not mounted", async () => {
    fs.rmSync(root, { recursive: true });
    expect(await scanOrphans(Date.now())).toEqual({ files: [], tracks: [] });
  });

  it("yields to the event loop on large libraries", async () => {
    repo.listTracksWithAudio.mockResolvedValue(
      Array.from({ length: 450 }, (_, i) => track(String(i), `m${i}.mp3`)),
    );
    expect((await scanOrphans(Date.now())).tracks).toHaveLength(450);
  });
});

describe("startOrphanScan", () => {
  it("stores the result and refuses a second scan while one runs", async () => {
    let release!: () => void;
    repo.listTracksWithAudio.mockReturnValue(new Promise((r) => (release = () => r([]))));
    repo.saveResult.mockResolvedValue(undefined);

    expect(startOrphanScan()).toEqual({ started: true, running: true });
    expect(startOrphanScan()).toEqual({ started: false, running: true });
    repo.getPage.mockResolvedValue(null);
    expect((await getOrphans({ limit: 5, files_offset: 0, tracks_offset: 0 })).running).toBe(true);

    release();
    await vi.waitFor(() => expect(repo.saveResult).toHaveBeenCalled());
    expect(repo.saveResult).toHaveBeenCalledWith(
      expect.objectContaining({ files: [], tracks: [], durationMs: expect.any(Number) }),
    );
    await vi.waitFor(() => expect(startOrphanScan().started).toBe(true));
    release();
    await vi.waitFor(() => expect(repo.saveResult).toHaveBeenCalledTimes(2));
  });

  it("records a failure and frees the guard", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    repo.listTracksWithAudio.mockRejectedValue(new Error("db down"));
    repo.saveError.mockResolvedValue(undefined);
    startOrphanScan();
    await vi.waitFor(() => expect(repo.saveError).toHaveBeenCalledWith("db down"));
    await vi.waitFor(() => expect(startOrphanScan().started).toBe(true));
    await vi.waitFor(() => expect(repo.saveError).toHaveBeenCalledTimes(2));
  });

  it("survives a failure to record the failure, and non-Error throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    repo.listTracksWithAudio.mockRejectedValue("boom");
    repo.saveError.mockRejectedValue(new Error("also down"));
    startOrphanScan();
    await vi.waitFor(() => expect(repo.saveError).toHaveBeenCalledWith("boom"));
    await vi.waitFor(() => expect(startOrphanScan().started).toBe(true));
    await vi.waitFor(() => expect(repo.saveError).toHaveBeenCalledTimes(2));
  });
});

describe("getOrphans", () => {
  const query = { limit: 5, files_offset: 2, tracks_offset: 0 };

  it("is empty before any scan", async () => {
    repo.getPage.mockResolvedValue(null);
    const result = await getOrphans(query);
    expect(result).toMatchObject({
      running: false,
      last_scan: null,
      last_error: null,
      files: { items: [], total: 0, limit: 5, offset: 2 },
      tracks: { items: [], total: 0, limit: 5, offset: 0 },
    });
  });

  it("returns the stored scan with its totals", async () => {
    repo.getPage.mockResolvedValue({
      scanned_at: new Date("2026-11-06T00:00:00Z"),
      duration_ms: 1500,
      error: "later failure",
      files_total: 7,
      tracks_total: 1,
      files: [{ path: "a.mp3", size_bytes: 9, modified_at: "m" }],
      tracks: [track("1", "x.mp3")],
    });
    repo.getFileBytes.mockResolvedValue(900);
    const result = await getOrphans(query);
    expect(result.last_scan).toEqual({
      scanned_at: "2026-11-06T00:00:00.000Z",
      duration_ms: 1500,
      orphan_file_count: 7,
      orphan_file_bytes: 900,
      missing_track_count: 1,
    });
    expect(result.last_error).toBe("later failure");
    expect(result.files).toMatchObject({ total: 7, limit: 5, offset: 2 });
    expect(result.tracks.items).toHaveLength(1);
  });

  it("reports a zero duration when a stored scan has none", async () => {
    repo.getPage.mockResolvedValue({
      scanned_at: new Date(),
      duration_ms: null,
      error: null,
      files_total: 0,
      tracks_total: 0,
      files: [],
      tracks: [],
    });
    repo.getFileBytes.mockResolvedValue(0);
    expect((await getOrphans(query)).last_scan?.duration_ms).toBe(0);
  });

  it("has no last_scan when only a failure was recorded", async () => {
    repo.getPage.mockResolvedValue({
      scanned_at: null,
      duration_ms: null,
      error: "first scan failed",
      files_total: 0,
      tracks_total: 0,
      files: [],
      tracks: [],
    });
    const result = await getOrphans(query);
    expect(result.last_scan).toBeNull();
    expect(result.last_error).toBe("first scan failed");
  });
});

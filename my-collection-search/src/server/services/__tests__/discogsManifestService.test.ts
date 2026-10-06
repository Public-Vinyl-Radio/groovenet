import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type * as ManifestService from "../discogsManifestService";
import type { DiscogsRelease } from "@/types/track";

let tmpDir: string;
let exportsDir: string;
let mod: typeof ManifestService;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "discogs-manifest-test-"));
  exportsDir = path.join(tmpDir, "discogs_exports");
  fs.mkdirSync(exportsDir);

  vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  process.env.DISCOGS_USERNAME = "owner";
  vi.resetModules();
  mod = await import("../discogsManifestService");
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.DISCOGS_USERNAME;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── helpers ──────────────────────────────────────────────────────────────────

function writeJson(filePath: string, data: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(data), "utf8");
}

function makeAlbum(overrides: Partial<DiscogsRelease> = {}): DiscogsRelease {
  return {
    id: 100,
    title: "Test Album",
    artists_sort: "Test Artist",
    artists: [{ name: "Test Artist" }],
    year: 2000,
    genres: ["Electronic"],
    styles: ["House"],
    uri: "https://discogs.com/release/100",
    thumb: "https://img.discogs.com/thumb.jpg",
    tracklist: [
      {
        position: "A1",
        title: "Track One",
        duration: "5:30",
        artists: [],
        duration_seconds: 330,
      },
      {
        position: "A2",
        title: "Track Two",
        duration: "6:00",
        artists: [{ name: "Guest Artist (2)" }],
        duration_seconds: 360,
      },
    ],
    date_added: "2024-01-01T00:00:00Z",
    date_changed: "2024-01-02T00:00:00Z",
    labels: [{ name: "Warp", catno: "WARP1" }],
    country: "UK",
    formats: [{ name: "Vinyl" }] as unknown as string,
    ...overrides,
  } as DiscogsRelease;
}

// ─── getManifestPath ──────────────────────────────────────────────────────────

describe("getManifestPath()", () => {
  it("returns manifest.json for the current user", () => {
    const p = mod.getManifestPath("owner");
    expect(p).toBe(path.join(exportsDir, "manifest.json"));
  });

  it("returns manifest_<username>.json for a friend", () => {
    const p = mod.getManifestPath("friend1");
    expect(p).toBe(path.join(exportsDir, "manifest_friend1.json"));
  });

  it("sanitizes special characters in username", () => {
    const p = mod.getManifestPath("bad/user");
    expect(p).toContain(exportsDir);
    expect(p).not.toContain("/bad");
  });

  it("does not escape the exports directory for traversal usernames", () => {
    // '../../../etc' should be sanitised and stay within exportsDir
    const p = mod.getManifestPath("../../../etc");
    expect(p.startsWith(exportsDir)).toBe(true);
  });

  it("returns manifest.json when DISCOGS_USERNAME is unset and username matches empty string edge case", () => {
    delete process.env.DISCOGS_USERNAME;
    // Without DISCOGS_USERNAME set, always falls to friend branch
    const p = mod.getManifestPath("anyuser");
    expect(p).toBe(path.join(exportsDir, "manifest_anyuser.json"));
  });
});

// ─── getManifestReleaseIds ────────────────────────────────────────────────────

describe("getManifestReleaseIds()", () => {
  it("returns empty array when manifest file does not exist", () => {
    expect(mod.getManifestReleaseIds("owner")).toEqual([]);
  });

  it("returns releaseIds from a valid manifest", () => {
    writeJson(path.join(exportsDir, "manifest.json"), { releaseIds: ["1", "2", "3"] });
    expect(mod.getManifestReleaseIds("owner")).toEqual(["1", "2", "3"]);
  });

  it("coerces numeric releaseIds to strings", () => {
    writeJson(path.join(exportsDir, "manifest.json"), { releaseIds: [1, 2] });
    expect(mod.getManifestReleaseIds("owner")).toEqual(["1", "2"]);
  });

  it("returns empty array when releaseIds is not an array", () => {
    writeJson(path.join(exportsDir, "manifest.json"), { releaseIds: null });
    expect(mod.getManifestReleaseIds("owner")).toEqual([]);
  });

  it("returns empty array on invalid JSON", () => {
    fs.writeFileSync(path.join(exportsDir, "manifest.json"), "not-json", "utf8");
    expect(mod.getManifestReleaseIds("owner")).toEqual([]);
  });

  it("reads a friend manifest by username", () => {
    writeJson(path.join(exportsDir, "manifest_friend1.json"), { releaseIds: ["99"] });
    expect(mod.getManifestReleaseIds("friend1")).toEqual(["99"]);
  });
});

// ─── getManifestFiles ─────────────────────────────────────────────────────────

describe("getManifestFiles()", () => {
  it("returns empty array when exports dir does not exist", () => {
    fs.rmSync(exportsDir, { recursive: true });
    expect(mod.getManifestFiles()).toEqual([]);
  });

  it("returns manifest JSON files only", () => {
    writeJson(path.join(exportsDir, "manifest.json"), {});
    writeJson(path.join(exportsDir, "manifest_friend1.json"), {});
    fs.writeFileSync(path.join(exportsDir, "release_100.json"), "{}", "utf8");
    fs.writeFileSync(path.join(exportsDir, "notes.txt"), "hi", "utf8");

    const files = mod.getManifestFiles();
    expect(files.sort()).toEqual(["manifest.json", "manifest_friend1.json"]);
  });
});

// ─── createExportsDir ─────────────────────────────────────────────────────────

describe("createExportsDir()", () => {
  it("creates the exports directory when it does not exist", () => {
    fs.rmSync(exportsDir, { recursive: true });
    mod.createExportsDir();
    expect(fs.existsSync(exportsDir)).toBe(true);
  });

  it("does nothing if the exports directory already exists", () => {
    expect(() => mod.createExportsDir()).not.toThrow();
    expect(fs.existsSync(exportsDir)).toBe(true);
  });
});

// ─── getReleasePath ───────────────────────────────────────────────────────────

describe("getReleasePath()", () => {
  it("returns friend-specific path when the friend file exists", () => {
    const friendFile = path.join(exportsDir, "friend1_release_100.json");
    writeJson(friendFile, {});

    const result = mod.getReleasePath("friend1", "100");
    expect(result).toBe(friendFile);
  });

  it("falls back to current user path when friend file is absent", () => {
    const ownerFile = path.join(exportsDir, "release_100.json");
    writeJson(ownerFile, {});

    const result = mod.getReleasePath("friend1", "100");
    expect(result).toBe(ownerFile);
  });

  it("returns null when neither file exists", () => {
    const result = mod.getReleasePath("friend1", "999");
    expect(result).toBeNull();
  });

  it("returns current user release path for the current user", () => {
    const ownerFile = path.join(exportsDir, "release_100.json");
    writeJson(ownerFile, {});

    const result = mod.getReleasePath("owner", "100");
    expect(result).toBe(ownerFile);
  });

  it("sanitizes dangerous characters in releaseId", () => {
    // Should not throw; the sanitised path just won't exist
    const result = mod.getReleasePath("owner", "../secret");
    expect(result).toBeNull();
  });
});

// ─── getReleaseWritePath ──────────────────────────────────────────────────────

describe("getReleaseWritePath()", () => {
  it("returns friend-namespaced path for a friend", () => {
    const p = mod.getReleaseWritePath("friend1", "100");
    expect(p).toBe(path.join(exportsDir, "friend1_release_100.json"));
  });

  it("returns owner-style path for the current user", () => {
    const p = mod.getReleaseWritePath("owner", "100");
    expect(p).toBe(path.join(exportsDir, "release_100.json"));
  });
});

// ─── loadAlbum ────────────────────────────────────────────────────────────────

describe("loadAlbum()", () => {
  it("returns parsed album data on success", () => {
    const albumPath = path.join(exportsDir, "release_100.json");
    writeJson(albumPath, { id: 100, title: "Test" });
    const album = mod.loadAlbum(albumPath);
    expect(album).toMatchObject({ id: 100, title: "Test" });
  });

  it("returns null when the file does not exist", () => {
    expect(mod.loadAlbum(path.join(exportsDir, "missing.json"))).toBeNull();
  });

  it("returns null when the file contains invalid JSON", () => {
    const albumPath = path.join(exportsDir, "bad.json");
    fs.writeFileSync(albumPath, "not-json", "utf8");
    expect(mod.loadAlbum(albumPath)).toBeNull();
  });
});

// ─── saveManifest ─────────────────────────────────────────────────────────────

describe("saveManifest()", () => {
  it("writes a manifest file with deduplicated releaseIds", () => {
    const manifestPath = path.join(exportsDir, "manifest.json");
    mod.saveManifest(manifestPath, ["1", "2", "1", "3"]);

    const written = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect(written.releaseIds).toEqual(["1", "2", "3"]);
  });

  it("includes provided deletedReleaseIds", () => {
    const manifestPath = path.join(exportsDir, "manifest.json");
    mod.saveManifest(manifestPath, ["1"], ["99", "100"]);

    const written = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect(written.deletedReleaseIds).toEqual(["99", "100"]);
  });

  it("preserves existing deletedReleaseIds when not provided", () => {
    const manifestPath = path.join(exportsDir, "manifest.json");
    writeJson(manifestPath, { releaseIds: ["1"], deletedReleaseIds: ["50"] });

    mod.saveManifest(manifestPath, ["1", "2"]);

    const written = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect(written.deletedReleaseIds).toEqual(["50"]);
  });

  it("writes a lastSynced ISO timestamp", () => {
    const manifestPath = path.join(exportsDir, "manifest.json");
    const before = Date.now();
    mod.saveManifest(manifestPath, []);
    const after = Date.now();

    const written = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const ts = new Date(written.lastSynced).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

// ─── deleteRelease ────────────────────────────────────────────────────────────

describe("deleteRelease()", () => {
  it("deletes the release file and returns true", () => {
    const releasePath = path.join(exportsDir, "release_100.json");
    writeJson(releasePath, {});

    const result = mod.deleteRelease("owner", "100");
    expect(result).toBe(true);
    expect(fs.existsSync(releasePath)).toBe(false);
  });

  it("returns false when the release file does not exist", () => {
    expect(mod.deleteRelease("owner", "999")).toBe(false);
  });
});

// ─── extractTracksFromAlbum ───────────────────────────────────────────────────

describe("extractTracksFromAlbum()", () => {
  it("leaves local tags null for newly imported tracks", () => {
    const tracks = mod.extractTracksFromAlbum(makeAlbum(), "owner");
    expect(tracks.map((track) => track.local_tags)).toEqual([null, null]);
  });

  it("maps basic fields from the album", () => {
    const tracks = mod.extractTracksFromAlbum(makeAlbum(), "owner");
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({
      track_id: "100-A1",
      title: "Track One",
      artist: "Test Artist",
      album: "Test Album",
      year: 2000,
      genres: ["Electronic"],
      styles: ["House"],
      discogs_url: "https://discogs.com/release/100",
      album_thumbnail: "https://img.discogs.com/thumb.jpg",
      duration_seconds: 330,
      username: "owner",
      date_added: "2024-01-01T00:00:00Z",
      release_id: "100",
    });
  });

  it("uses track-level artist when provided", () => {
    const tracks = mod.extractTracksFromAlbum(makeAlbum(), "owner");
    // Track Two has a guest artist
    expect(tracks[1].artist).toBe("Guest Artist");
  });

  it("strips Discogs disambiguation numbering from artist names", () => {
    const album = makeAlbum({ artists_sort: "DJ Shadow (2)" });
    const tracks = mod.extractTracksFromAlbum(album, "owner");
    expect(tracks[0].artist).toBe("DJ Shadow");
  });

  it("falls back to album artist when track has no artists", () => {
    const tracks = mod.extractTracksFromAlbum(makeAlbum(), "owner");
    expect(tracks[0].artist).toBe("Test Artist");
  });

  it("parses duration string when duration_seconds is absent", () => {
    const album = makeAlbum({
      tracklist: [
        { position: "A1", title: "T", duration: "3:00", artists: [], duration_seconds: undefined as unknown as number },
      ],
    });
    const tracks = mod.extractTracksFromAlbum(album, "owner");
    expect(tracks[0].duration_seconds).toBe(180);
  });

  it("uses numeric duration_seconds when present", () => {
    const tracks = mod.extractTracksFromAlbum(makeAlbum(), "owner");
    expect(tracks[0].duration_seconds).toBe(330);
  });
});

// ─── parseManifestFile ────────────────────────────────────────────────────────

describe("parseManifestFile()", () => {
  it("uses username from manifest.username when present", () => {
    writeJson(path.join(exportsDir, "manifest.json"), {
      username: "embedded_user",
      releaseIds: [],
    });
    const { username } = mod.parseManifestFile("manifest.json");
    expect(username).toBe("embedded_user");
  });

  it("falls back to DISCOGS_USERNAME for manifest.json", () => {
    writeJson(path.join(exportsDir, "manifest.json"), { releaseIds: [] });
    const { username } = mod.parseManifestFile("manifest.json");
    expect(username).toBe("owner");
  });

  it("extracts username from manifest_<username>.json filename", () => {
    writeJson(path.join(exportsDir, "manifest_friend1.json"), { releaseIds: [] });
    const { username } = mod.parseManifestFile("manifest_friend1.json");
    expect(username).toBe("friend1");
  });
});

// ─── getTracksFromManifestReleases ────────────────────────────────────────────

describe("getTracksFromManifestReleases()", () => {
  it("returns tracks for all provided release IDs", () => {
    const releaseFile = path.join(exportsDir, "release_100.json");
    writeJson(releaseFile, makeAlbum());

    const tracks = mod.getTracksFromManifestReleases("owner", ["100"]);
    expect(tracks).toHaveLength(2);
  });

  it("skips release IDs whose files are missing", () => {
    const tracks = mod.getTracksFromManifestReleases("owner", ["999"]);
    expect(tracks).toHaveLength(0);
  });

  it("aggregates tracks across multiple releases", () => {
    writeJson(path.join(exportsDir, "release_100.json"), makeAlbum({ id: 100 }));
    writeJson(path.join(exportsDir, "release_200.json"), makeAlbum({ id: 200, title: "Album 2" }));

    const tracks = mod.getTracksFromManifestReleases("owner", ["100", "200"]);
    expect(tracks).toHaveLength(4);
  });
});

// ─── getAllTracksFromManifests ─────────────────────────────────────────────────

describe("getAllTracksFromManifests()", () => {
  it("returns empty array when no manifests exist", () => {
    expect(mod.getAllTracksFromManifests()).toEqual([]);
  });

  it("collects tracks from all manifest files", () => {
    writeJson(path.join(exportsDir, "manifest.json"), { releaseIds: ["100"] });
    writeJson(path.join(exportsDir, "release_100.json"), makeAlbum());

    const tracks = mod.getAllTracksFromManifests();
    expect(tracks).toHaveLength(2);
    expect(tracks[0].username).toBe("owner");
  });

  it("skips release files that are missing", () => {
    writeJson(path.join(exportsDir, "manifest.json"), { releaseIds: ["999"] });

    const tracks = mod.getAllTracksFromManifests();
    expect(tracks).toEqual([]);
  });
});

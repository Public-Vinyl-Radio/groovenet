import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  discogsReleaseToAlbum,
  upsertAlbum,
  upsertAlbums,
  getAllAlbumsFromManifests,
  getAlbumsFromManifestReleases,
} from "../albumUpsertService";
import type { DiscogsRelease, Album } from "@/types/track";

// ─── mocks ────────────────────────────────────────────────────────────────────

const albumRepo = vi.hoisted(() => ({
  upsertAlbumRecord: vi.fn(),
}));

const friendRepo = vi.hoisted(() => ({
  ensureIdByUsername: vi.fn(),
}));

const manifestSvc = vi.hoisted(() => ({
  getManifestFiles: vi.fn(),
  parseManifestFile: vi.fn(),
  getReleasePath: vi.fn(),
  loadAlbum: vi.fn(),
}));

vi.mock("@/server/repositories/albumRepository", () => ({
  albumRepository: albumRepo,
}));

vi.mock("@/server/repositories/friendRepository", () => ({
  friendRepository: friendRepo,
}));

vi.mock("@/server/services/discogsManifestService", () => manifestSvc);

// ─── setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeRelease(overrides: Partial<DiscogsRelease> = {}): DiscogsRelease {
  return {
    id: 123,
    title: "Test Album",
    artists_sort: "Test Artist",
    artists: [{ name: "Test Artist" }],
    year: 1995,
    genres: ["Electronic"],
    styles: ["Deep House", "Tech House"],
    uri: "https://www.discogs.com/release/123",
    thumb: "https://img.discogs.com/thumb.jpg",
    tracklist: [
      { position: "A1", title: "Track One", duration: "5:30", artists: [], duration_seconds: 330 },
      { position: "A2", title: "Track Two", duration: "6:00", artists: [], duration_seconds: 360 },
    ],
    date_added: "2024-01-01T00:00:00Z",
    date_changed: "2024-01-02T00:00:00Z",
    labels: [{ name: "Warp Records", catno: "WARP001" }],
    country: "UK",
    formats: [{ name: "Vinyl" }] as unknown as string,
    ...overrides,
  };
}

function makeAlbum(overrides: Partial<Album> = {}): Album {
  return {
    release_id: "123",
    friend_id: 1,
    title: "Test Album",
    artist: "Test Artist",
    year: "1995",
    track_count: 2,
    ...overrides,
  } as Album;
}

// ─── discogsReleaseToAlbum ────────────────────────────────────────────────────

describe("discogsReleaseToAlbum", () => {
  it("maps all standard fields correctly", () => {
    const result = discogsReleaseToAlbum(makeRelease(), 42);

    expect(result.release_id).toBe("123");
    expect(result.friend_id).toBe(42);
    expect(result.title).toBe("Test Album");
    expect(result.artist).toBe("Test Artist");
    expect(result.year).toBe("1995");
    expect(result.genres).toEqual(["Electronic"]);
    expect(result.styles).toEqual(["Deep House", "Tech House"]);
    expect(result.album_thumbnail).toBe("https://img.discogs.com/thumb.jpg");
    expect(result.discogs_url).toBe("https://www.discogs.com/release/123");
    expect(result.date_added).toBe("2024-01-01T00:00:00Z");
    expect(result.date_changed).toBe("2024-01-02T00:00:00Z");
    expect(result.track_count).toBe(2);
    expect(result.label).toBe("Warp Records");
    expect(result.catalog_number).toBe("WARP001");
    expect(result.country).toBe("UK");
    expect(result.format).toBe("Vinyl");
  });

  it("prefers artists_sort over artists[0].name", () => {
    const result = discogsReleaseToAlbum(
      makeRelease({ artists_sort: "Sorted Artist", artists: [{ name: "Other Artist" }] }),
      1,
    );
    expect(result.artist).toBe("Sorted Artist");
  });

  it("falls back to artists[0].name when artists_sort is absent", () => {
    const result = discogsReleaseToAlbum(
      makeRelease({ artists_sort: undefined, artists: [{ name: "Fallback Artist" }] }),
      1,
    );
    expect(result.artist).toBe("Fallback Artist");
  });

  it("uses 'Unknown Artist' when both artists_sort and artists are absent", () => {
    const result = discogsReleaseToAlbum(
      makeRelease({ artists_sort: undefined, artists: undefined }),
      1,
    );
    expect(result.artist).toBe("Unknown Artist");
  });

  it("uses 'Unknown Artist' when artists array is empty", () => {
    const result = discogsReleaseToAlbum(makeRelease({ artists_sort: undefined, artists: [] }), 1);
    expect(result.artist).toBe("Unknown Artist");
  });

  it("stringifies numeric release id", () => {
    const result = discogsReleaseToAlbum(makeRelease({ id: 456 }), 1);
    expect(result.release_id).toBe("456");
  });

  it("uses undefined label when labels array is absent", () => {
    const result = discogsReleaseToAlbum(makeRelease({ labels: undefined }), 1);
    expect(result.label).toBeUndefined();
    expect(result.catalog_number).toBeUndefined();
  });

  it("uses undefined label when labels array is empty", () => {
    const result = discogsReleaseToAlbum(makeRelease({ labels: [] }), 1);
    expect(result.label).toBeUndefined();
    expect(result.catalog_number).toBeUndefined();
  });

  it("uses 0 for track_count when tracklist is empty", () => {
    const result = discogsReleaseToAlbum(makeRelease({ tracklist: [] }), 1);
    expect(result.track_count).toBe(0);
  });

  it("sets undefined format when formats is not an array", () => {
    // DiscogsRelease.formats is typed as string in some code paths
    const result = discogsReleaseToAlbum(makeRelease({ formats: "Vinyl" as unknown as string }), 1);
    expect(result.format).toBeUndefined();
  });

  it("sets undefined format when formats array is empty", () => {
    const result = discogsReleaseToAlbum(makeRelease({ formats: [] as unknown as string }), 1);
    expect(result.format).toBeUndefined();
  });

  it("omits year when release has no year", () => {
    const result = discogsReleaseToAlbum(makeRelease({ year: undefined }), 1);
    expect(result.year).toBeUndefined();
  });

  it("uses empty arrays for absent genres and styles", () => {
    const result = discogsReleaseToAlbum(makeRelease({ genres: undefined, styles: undefined }), 1);
    expect(result.genres).toEqual([]);
    expect(result.styles).toEqual([]);
  });

  it("strips Discogs disambiguation numbering from artists_sort", () => {
    const result = discogsReleaseToAlbum(makeRelease({ artists_sort: "Surgeon (2)" }), 1);
    expect(result.artist).toBe("Surgeon");
  });

  it("strips disambiguation when falling back to artists[0].name", () => {
    const result = discogsReleaseToAlbum(
      makeRelease({ artists_sort: undefined, artists: [{ name: "DJ Stingray 313 (2)" }] }),
      1,
    );
    expect(result.artist).toBe("DJ Stingray 313");
  });

  it("does not strip numbers that are not a trailing parenthesised suffix", () => {
    const result = discogsReleaseToAlbum(makeRelease({ artists_sort: "Boards Of Canada" }), 1);
    expect(result.artist).toBe("Boards Of Canada");
  });
});

// ─── upsertAlbum ─────────────────────────────────────────────────────────────

describe("upsertAlbum()", () => {
  it("delegates to albumRepository.upsertAlbumRecord and returns the result", async () => {
    const db = { query: vi.fn() };
    const input = {
      release_id: "123",
      friend_id: 1,
      title: "Test",
      artist: "Artist",
      track_count: 0,
    };
    const saved = makeAlbum();
    albumRepo.upsertAlbumRecord.mockResolvedValue(saved);

    const result = await upsertAlbum(db as any, input as any);

    expect(albumRepo.upsertAlbumRecord).toHaveBeenCalledWith(db, input, undefined);
    expect(result).toBe(saved);
  });

  it("forwards options to albumRepository.upsertAlbumRecord", async () => {
    const db = { query: vi.fn() };
    const input = { release_id: "456", friend_id: 2, title: "B", artist: "Artist", track_count: 0 };
    const options = { preserveManualFields: true };
    albumRepo.upsertAlbumRecord.mockResolvedValue(makeAlbum());

    await upsertAlbum(db as any, input as any, options);

    expect(albumRepo.upsertAlbumRecord).toHaveBeenCalledWith(db, input, options);
  });
});

// ─── upsertAlbums ─────────────────────────────────────────────────────────────

describe("upsertAlbums()", () => {
  it("returns empty array when given no albums", async () => {
    const db = { query: vi.fn() };

    const result = await upsertAlbums(db as any, []);

    expect(result).toEqual([]);
    expect(albumRepo.upsertAlbumRecord).not.toHaveBeenCalled();
  });

  it("returns all successfully upserted albums", async () => {
    const db = { query: vi.fn() };
    const a = makeAlbum({ release_id: "1" });
    const b = makeAlbum({ release_id: "2" });
    albumRepo.upsertAlbumRecord.mockResolvedValueOnce(a).mockResolvedValueOnce(b);

    const result = await upsertAlbums(db as any, [
      { release_id: "1", friend_id: 1, title: "A", artist: "Artist", track_count: 0 } as any,
      { release_id: "2", friend_id: 1, title: "B", artist: "Artist", track_count: 0 } as any,
    ]);

    expect(result).toEqual([a, b]);
  });

  it("skips a failed album and continues with the rest", async () => {
    const db = { query: vi.fn() };
    const b = makeAlbum({ release_id: "2" });
    albumRepo.upsertAlbumRecord
      .mockRejectedValueOnce(new Error("DB error"))
      .mockResolvedValueOnce(b);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await upsertAlbums(db as any, [
      { release_id: "1", friend_id: 1, title: "A", artist: "Artist", track_count: 0 } as any,
      { release_id: "2", friend_id: 1, title: "B", artist: "Artist", track_count: 0 } as any,
    ]);

    expect(result).toEqual([b]);
    expect(errorSpy).toHaveBeenCalledWith("Error upserting album 1:", "DB error");
    errorSpy.mockRestore();
  });

  it("returns empty array when all albums fail", async () => {
    const db = { query: vi.fn() };
    albumRepo.upsertAlbumRecord.mockRejectedValue(new Error("fail"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await upsertAlbums(db as any, [
      { release_id: "1", friend_id: 1, title: "A", artist: "Artist", track_count: 0 } as any,
    ]);

    expect(result).toEqual([]);
    errorSpy.mockRestore();
  });

  it("passes options to every individual upsert", async () => {
    const db = { query: vi.fn() };
    const options = { preserveManualFields: true };
    albumRepo.upsertAlbumRecord.mockResolvedValue(makeAlbum());

    await upsertAlbums(
      db as any,
      [
        { release_id: "1", friend_id: 1, title: "A", artist: "Artist", track_count: 0 } as any,
        { release_id: "2", friend_id: 1, title: "B", artist: "Artist", track_count: 0 } as any,
      ],
      options,
    );

    for (const call of albumRepo.upsertAlbumRecord.mock.calls) {
      expect(call[2]).toBe(options);
    }
  });
});

// ─── getAlbumsFromManifestReleases ────────────────────────────────────────────

describe("getAlbumsFromManifestReleases()", () => {
  it("returns albums for all found releases", async () => {
    friendRepo.ensureIdByUsername.mockResolvedValue(7);
    manifestSvc.getReleasePath.mockReturnValueOnce("/path/r1").mockReturnValueOnce("/path/r2");
    manifestSvc.loadAlbum
      .mockReturnValueOnce(makeRelease({ id: 1 }))
      .mockReturnValueOnce(makeRelease({ id: 2 }));

    const result = await getAlbumsFromManifestReleases("testuser", ["1", "2"]);

    expect(result).toHaveLength(2);
    expect(result[0].release_id).toBe("1");
    expect(result[1].release_id).toBe("2");
    expect(result[0].friend_id).toBe(7);
    expect(friendRepo.ensureIdByUsername).toHaveBeenCalledWith("testuser");
  });

  it("skips releases where getReleasePath returns a falsy value", async () => {
    friendRepo.ensureIdByUsername.mockResolvedValue(5);
    manifestSvc.getReleasePath.mockReturnValueOnce(null).mockReturnValueOnce("/path/r2");
    manifestSvc.loadAlbum.mockReturnValueOnce(makeRelease({ id: 2 }));

    const result = await getAlbumsFromManifestReleases("testuser", ["1", "2"]);

    expect(result).toHaveLength(1);
    expect(result[0].release_id).toBe("2");
  });

  it("skips releases where loadAlbum returns a falsy value", async () => {
    friendRepo.ensureIdByUsername.mockResolvedValue(5);
    manifestSvc.getReleasePath.mockReturnValue("/path/r");
    manifestSvc.loadAlbum.mockReturnValueOnce(null).mockReturnValueOnce(makeRelease({ id: 2 }));

    const result = await getAlbumsFromManifestReleases("testuser", ["1", "2"]);

    expect(result).toHaveLength(1);
    expect(result[0].release_id).toBe("2");
  });

  it("returns empty array when all releases are skipped", async () => {
    friendRepo.ensureIdByUsername.mockResolvedValue(5);
    manifestSvc.getReleasePath.mockReturnValue(null);

    const result = await getAlbumsFromManifestReleases("testuser", ["1", "2"]);

    expect(result).toEqual([]);
  });

  it("returns empty array for empty releaseIds input", async () => {
    friendRepo.ensureIdByUsername.mockResolvedValue(5);

    const result = await getAlbumsFromManifestReleases("testuser", []);

    expect(result).toEqual([]);
    expect(manifestSvc.getReleasePath).not.toHaveBeenCalled();
  });
});

// ─── getAllAlbumsFromManifests ─────────────────────────────────────────────────

describe("getAllAlbumsFromManifests()", () => {
  it("returns all albums across all manifests", async () => {
    manifestSvc.getManifestFiles.mockReturnValue(["file1.json"]);
    manifestSvc.parseManifestFile.mockReturnValue({
      manifest: { releaseIds: [10, 20] },
      username: "user1",
    });
    friendRepo.ensureIdByUsername.mockResolvedValue(3);
    manifestSvc.getReleasePath.mockReturnValueOnce("/path/10").mockReturnValueOnce("/path/20");
    manifestSvc.loadAlbum
      .mockReturnValueOnce(makeRelease({ id: 10 }))
      .mockReturnValueOnce(makeRelease({ id: 20 }));

    const result = await getAllAlbumsFromManifests();

    expect(result).toHaveLength(2);
    expect(result[0].release_id).toBe("10");
    expect(result[1].release_id).toBe("20");
    expect(result[0].friend_id).toBe(3);
  });

  it("aggregates albums from multiple manifest files", async () => {
    manifestSvc.getManifestFiles.mockReturnValue(["f1.json", "f2.json"]);
    manifestSvc.parseManifestFile
      .mockReturnValueOnce({ manifest: { releaseIds: [1] }, username: "user1" })
      .mockReturnValueOnce({ manifest: { releaseIds: [2] }, username: "user2" });
    friendRepo.ensureIdByUsername.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    manifestSvc.getReleasePath.mockReturnValue("/path/r");
    manifestSvc.loadAlbum
      .mockReturnValueOnce(makeRelease({ id: 1 }))
      .mockReturnValueOnce(makeRelease({ id: 2 }));

    const result = await getAllAlbumsFromManifests();

    expect(result).toHaveLength(2);
    expect(result[0].friend_id).toBe(1);
    expect(result[1].friend_id).toBe(2);
  });

  it("returns empty array when no manifest files exist", async () => {
    manifestSvc.getManifestFiles.mockReturnValue([]);

    const result = await getAllAlbumsFromManifests();

    expect(result).toEqual([]);
  });

  it("skips a release when getReleasePath returns null", async () => {
    manifestSvc.getManifestFiles.mockReturnValue(["f1.json"]);
    manifestSvc.parseManifestFile.mockReturnValue({
      manifest: { releaseIds: [1, 2] },
      username: "user1",
    });
    friendRepo.ensureIdByUsername.mockResolvedValue(1);
    manifestSvc.getReleasePath.mockReturnValueOnce(null).mockReturnValueOnce("/path/r2");
    manifestSvc.loadAlbum.mockReturnValueOnce(makeRelease({ id: 2 }));

    const result = await getAllAlbumsFromManifests();

    expect(result).toHaveLength(1);
    expect(result[0].release_id).toBe("2");
  });

  it("handles a manifest with no releaseIds field", async () => {
    manifestSvc.getManifestFiles.mockReturnValue(["f1.json"]);
    manifestSvc.parseManifestFile.mockReturnValue({
      manifest: {},
      username: "user1",
    });
    friendRepo.ensureIdByUsername.mockResolvedValue(1);

    const result = await getAllAlbumsFromManifests();

    expect(result).toEqual([]);
    expect(manifestSvc.getReleasePath).not.toHaveBeenCalled();
  });

  it("coerces numeric releaseIds to strings", async () => {
    manifestSvc.getManifestFiles.mockReturnValue(["f1.json"]);
    manifestSvc.parseManifestFile.mockReturnValue({
      manifest: { releaseIds: [42] },
      username: "user1",
    });
    friendRepo.ensureIdByUsername.mockResolvedValue(1);
    manifestSvc.getReleasePath.mockReturnValueOnce("/path/42");
    manifestSvc.loadAlbum.mockReturnValueOnce(makeRelease({ id: 42 }));

    const result = await getAllAlbumsFromManifests();

    expect(manifestSvc.getReleasePath).toHaveBeenCalledWith("user1", "42");
    expect(result[0].release_id).toBe("42");
  });
});

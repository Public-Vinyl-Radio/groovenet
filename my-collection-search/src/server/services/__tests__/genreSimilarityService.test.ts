import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const genreRepository = vi.hoisted(() => ({ listFlat: vi.fn(), trackFacets: vi.fn() }));
const genreSimilarityRepository = vi.hoisted(() => ({
  topForGenre: vi.fn(),
  loadCoOccurrence: vi.fn(),
  replaceAll: vi.fn(),
}));
vi.mock("@/server/repositories/genreRepository", () => ({ genreRepository }));
vi.mock("@/server/repositories/genreSimilarityRepository", () => ({ genreSimilarityRepository }));

import {
  getGenreSimilarPage,
  minSupportAlbums,
  recomputeGenreSimilarity,
  refreshIntervalMinutes,
  refreshTick,
  resetGenreSimilarityRefreshClock,
  resolveRelated,
  startGenreSimilarityRefresh,
  triggerGenreSimilarityRefresh,
} from "../genreSimilarityService";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (n: number, name: string, parent: number | null) => ({
  id: uuid(n),
  name,
  slug: name.toLowerCase(),
  parent_id: parent === null ? null : uuid(parent),
  source: "discogs" as const,
  track_count: 0,
  album_count: 0,
  aliases: [],
});

const flat = [row(1, "Latin", null), row(2, "Cumbia", 1), row(3, "Salsa", 1), row(4, "Rock", null)];
const NOW = new Date("2026-09-22T00:00:00Z").getTime();
const MINUTE = 60_000;

beforeEach(() => {
  vi.resetAllMocks();
  resetGenreSimilarityRefreshClock();
});

afterEach(() => {
  delete process.env.GENRE_SIMILARITY_MIN_SUPPORT_ALBUMS;
  delete process.env.GENRE_SIMILARITY_REFRESH_INTERVAL_MINUTES;
});

describe("resolveRelated", () => {
  const totals = new Map([[uuid(2), 30], [uuid(3), 12], [uuid(4), 5]]);

  it("maps stored rows to the matching flat genre, dropping any since-deleted genre", async () => {
    genreSimilarityRepository.topForGenre.mockResolvedValue([
      { related_genre_id: uuid(3), score: 1.4, signals: { taxonomy: "sibling" } },
      { related_genre_id: uuid(999), score: 1.0, signals: {} },
    ]);

    const related = await resolveRelated(flat, flat[1], totals, 12);

    expect(related).toEqual([{ id: uuid(3), name: "Salsa", slug: "salsa", track_count: 12, score: 1.4, signals: { taxonomy: "sibling" } }]);
  });

  it("falls back to taxonomy siblings with tracks, when the table has no rows for the genre", async () => {
    genreSimilarityRepository.topForGenre.mockResolvedValue([]);

    const related = await resolveRelated(flat, flat[1], totals, 12);

    expect(related).toEqual([{ id: uuid(3), name: "Salsa", slug: "salsa", track_count: 12 }]);
  });

  it("excludes a sibling with no tracks from the fallback", async () => {
    genreSimilarityRepository.topForGenre.mockResolvedValue([]);
    const totalsNoSalsa = new Map([[uuid(2), 30], [uuid(4), 5]]);

    const related = await resolveRelated(flat, flat[1], totalsNoSalsa, 12);
    expect(related).toEqual([]);
  });
});

describe("getGenreSimilarPage", () => {
  beforeEach(() => {
    genreRepository.listFlat.mockResolvedValue(flat);
    genreRepository.trackFacets.mockResolvedValue([{ id: uuid(2), track_count: 30 }, { id: uuid(3), track_count: 12 }]);
    genreSimilarityRepository.topForGenre.mockResolvedValue([]);
  });

  it("returns null for an unknown genre", async () => {
    expect(await getGenreSimilarPage("polka")).toBeNull();
  });

  it("finds a genre by slug or id and resolves its related genres globally (no friend scope)", async () => {
    const page = await getGenreSimilarPage("cumbia");

    expect(genreRepository.trackFacets).toHaveBeenCalledWith([], []);
    expect(page).toEqual({
      genre: { id: uuid(2), name: "Cumbia", slug: "cumbia", track_count: 30 },
      related: [{ id: uuid(3), name: "Salsa", slug: "salsa", track_count: 12 }],
    });
  });

  it("counts a genre the collection doesn't use as zero", async () => {
    genreRepository.trackFacets.mockResolvedValue([]);
    const page = await getGenreSimilarPage("cumbia");
    expect(page?.genre.track_count).toBe(0);
  });
});

describe("recomputeGenreSimilarity", () => {
  it("scores every pair from the taxonomy and co-occurrence data, then replaces the whole table", async () => {
    genreRepository.listFlat.mockResolvedValue(flat);
    genreSimilarityRepository.loadCoOccurrence.mockResolvedValue({
      pairs: [{ genre_id_a: uuid(2), genre_id_b: uuid(3), shared_albums: 5 }],
      albumCounts: [{ genre_id: uuid(2), album_count: 10 }, { genre_id: uuid(3), album_count: 10 }],
      totalAlbums: 100,
    });

    const result = await recomputeGenreSimilarity();

    expect(result.genres).toBe(4);
    expect(result.rows).toBeGreaterThan(0);
    expect(genreSimilarityRepository.replaceAll).toHaveBeenCalledTimes(1);
    const [entries] = genreSimilarityRepository.replaceAll.mock.calls[0];
    expect(entries).toEqual(
      expect.arrayContaining([expect.objectContaining({ genre_id: uuid(2), related_genre_id: uuid(3) })])
    );
  });

  it("respects a configured minimum support when scoring co-occurrence", async () => {
    process.env.GENRE_SIMILARITY_MIN_SUPPORT_ALBUMS = "10";
    genreRepository.listFlat.mockResolvedValue(flat);
    genreSimilarityRepository.loadCoOccurrence.mockResolvedValue({
      pairs: [{ genre_id_a: uuid(3), genre_id_b: uuid(4), shared_albums: 5 }],
      albumCounts: [{ genre_id: uuid(3), album_count: 10 }, { genre_id: uuid(4), album_count: 10 }],
      totalAlbums: 100,
    });

    await recomputeGenreSimilarity();

    const [entries] = genreSimilarityRepository.replaceAll.mock.calls[0];
    // Salsa/Rock share no taxonomy relation; below the raised minimum, no entry.
    expect(entries.find((e: { genre_id: string; related_genre_id: string }) => e.genre_id === uuid(3) && e.related_genre_id === uuid(4))).toBeUndefined();
  });
});

describe("minSupportAlbums", () => {
  it("defaults to 3 and reads an override from the environment", () => {
    expect(minSupportAlbums()).toBe(3);
    process.env.GENRE_SIMILARITY_MIN_SUPPORT_ALBUMS = "5";
    expect(minSupportAlbums()).toBe(5);
    process.env.GENRE_SIMILARITY_MIN_SUPPORT_ALBUMS = "not-a-number";
    expect(minSupportAlbums()).toBe(3);
  });
});

describe("triggerGenreSimilarityRefresh", () => {
  it("fires the recompute without the caller waiting on it, swallowing a failure", async () => {
    genreRepository.listFlat.mockResolvedValue([]);
    genreSimilarityRepository.loadCoOccurrence.mockRejectedValue(new Error("db down"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => triggerGenreSimilarityRefresh()).not.toThrow();
    await vi.waitFor(() => expect(errorLog).toHaveBeenCalled());

    expect(errorLog).toHaveBeenCalledWith("[genre-similarity] refresh failed:", expect.any(Error));
  });
});

describe("refreshTick", () => {
  beforeEach(() => {
    genreRepository.listFlat.mockResolvedValue(flat);
    genreSimilarityRepository.loadCoOccurrence.mockResolvedValue({ pairs: [], albumCounts: [], totalAlbums: 0 });
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("recomputes once per interval, nightly by default", async () => {
    await refreshTick(NOW);
    await refreshTick(NOW + MINUTE);
    expect(genreSimilarityRepository.replaceAll).toHaveBeenCalledTimes(1);

    await refreshTick(NOW + 24 * 60 * MINUTE);
    expect(genreSimilarityRepository.replaceAll).toHaveBeenCalledTimes(2);
  });

  it("reads its interval from the environment", async () => {
    expect(refreshIntervalMinutes()).toBe(24 * 60);
    process.env.GENRE_SIMILARITY_REFRESH_INTERVAL_MINUTES = "30";
    expect(refreshIntervalMinutes()).toBe(30);
  });

  it("logs and swallows a failed tick rather than throwing", async () => {
    genreSimilarityRepository.loadCoOccurrence.mockRejectedValue(new Error("db down"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(refreshTick(NOW)).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledWith("[genre-similarity] refresh tick failed:", expect.any(Error));
  });
});

describe("startGenreSimilarityRefresh()", () => {
  const GUARD = "__groovenetGenreSimilarityRefreshStarted";

  beforeEach(() => {
    delete (globalThis as Record<string, unknown>)[GUARD];
    genreRepository.listFlat.mockResolvedValue(flat);
    genreSimilarityRepository.loadCoOccurrence.mockResolvedValue({ pairs: [], albumCounts: [], totalAlbums: 0 });
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>)[GUARD];
    vi.restoreAllMocks();
  });

  it("starts only once per process, ticking every minute", () => {
    const interval = vi.spyOn(globalThis, "setInterval").mockReturnValue(0 as unknown as NodeJS.Timeout);

    startGenreSimilarityRefresh();
    startGenreSimilarityRefresh();

    expect(interval).toHaveBeenCalledTimes(1);
    expect(interval).toHaveBeenCalledWith(expect.any(Function), 60_000);
  });
});

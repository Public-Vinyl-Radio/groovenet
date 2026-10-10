import { beforeEach, describe, expect, it, vi } from "vitest";

const genreRepository = vi.hoisted(() => ({
  findIdsBySlug: vi.fn(),
  expandToFilter: vi.fn(),
  findRefsByIds: vi.fn(),
}));
const trackGenreRepository = vi.hoisted(() => ({ resolveGenreRefs: vi.fn() }));
const genreSimilarityRepository = vi.hoisted(() => ({ topForGenre: vi.fn() }));

vi.mock("@/server/repositories/genreRepository", () => ({ genreRepository }));
vi.mock("@/server/repositories/trackGenreRepository", () => ({ trackGenreRepository }));
vi.mock("@/server/repositories/genreSimilarityRepository", () => ({ genreSimilarityRepository }));

import { resolveGenreFilter, unknownGenresError } from "./genreFilter";

describe("resolveGenreFilter", () => {
  beforeEach(() => vi.resetAllMocks());

  it("is no filter for no values, without touching the database", async () => {
    await expect(resolveGenreFilter([" ", ""])).resolves.toEqual({ filter: undefined, added: [] });
    expect(genreRepository.findIdsBySlug).not.toHaveBeenCalled();
  });

  it("resolves slugs first and the rest through ids, names and aliases", async () => {
    genreRepository.findIdsBySlug.mockResolvedValue(new Map([["latin", "id-latin"]]));
    trackGenreRepository.resolveGenreRefs.mockResolvedValue({ ids: ["id-salsa", "id-latin"], unknown: [] });
    genreRepository.expandToFilter.mockResolvedValue({ ids: ["x"], keys: ["y"] });

    const result = await resolveGenreFilter(["Latin", " Salsa Dura "]);

    expect(genreRepository.findIdsBySlug).toHaveBeenCalledWith(["latin", "salsa dura"]);
    expect(trackGenreRepository.resolveGenreRefs).toHaveBeenCalledWith(["Salsa Dura"]);
    expect(genreRepository.expandToFilter).toHaveBeenCalledWith(["id-latin", "id-salsa"]);
    expect(result).toEqual({ filter: { ids: ["x"], keys: ["y"] }, added: [] });
    expect(genreSimilarityRepository.topForGenre).not.toHaveBeenCalled();
  });

  it("reports what matched nothing instead of filtering", async () => {
    genreRepository.findIdsBySlug.mockResolvedValue(new Map());
    trackGenreRepository.resolveGenreRefs.mockResolvedValue({ ids: [], unknown: ["Cumbiaa"] });

    await expect(resolveGenreFilter(["Cumbiaa"])).resolves.toEqual({ unknown: ["Cumbiaa"] });
    expect(genreRepository.expandToFilter).not.toHaveBeenCalled();
  });

  describe("includeSimilar (#485)", () => {
    beforeEach(() => {
      genreRepository.findIdsBySlug.mockResolvedValue(new Map([["cumbia", "id-cumbia"]]));
      trackGenreRepository.resolveGenreRefs.mockResolvedValue({ ids: [], unknown: [] });
    });

    it("widens the seed to its top similar genres and names what it added", async () => {
      genreRepository.expandToFilter
        .mockResolvedValueOnce({ ids: ["id-cumbia"], keys: ["cumbia"] })
        .mockResolvedValueOnce({
          ids: ["id-cumbia", "id-porro", "id-chicha"],
          keys: ["cumbia", "porro", "chicha"],
        });
      genreSimilarityRepository.topForGenre.mockResolvedValue([
        { related_genre_id: "id-porro", score: 0.9, signals: {} },
        { related_genre_id: "id-chicha", score: 0.7, signals: {} },
      ]);
      genreRepository.findRefsByIds.mockResolvedValue([
        { id: "id-porro", name: "Porro", slug: "porro" },
        { id: "id-chicha", name: "Chicha", slug: "chicha" },
      ]);

      const result = await resolveGenreFilter(["cumbia"], { includeSimilar: true, similarLimit: 5 });

      expect(genreSimilarityRepository.topForGenre).toHaveBeenCalledWith("id-cumbia", 5);
      expect(genreRepository.expandToFilter).toHaveBeenLastCalledWith(["id-cumbia", "id-porro", "id-chicha"]);
      expect(result).toEqual({
        filter: { ids: ["id-cumbia", "id-porro", "id-chicha"], keys: ["cumbia", "porro", "chicha"] },
        added: [
          { id: "id-porro", name: "Porro", slug: "porro" },
          { id: "id-chicha", name: "Chicha", slug: "chicha" },
        ],
      });
    });

    it("never falls back to taxonomy siblings when the table has no rows", async () => {
      genreRepository.expandToFilter.mockResolvedValue({ ids: ["id-cumbia"], keys: ["cumbia"] });
      genreSimilarityRepository.topForGenre.mockResolvedValue([]);

      const result = await resolveGenreFilter(["cumbia"], { includeSimilar: true });

      expect(result).toEqual({ filter: { ids: ["id-cumbia"], keys: ["cumbia"] }, added: [] });
      expect(genreRepository.findRefsByIds).not.toHaveBeenCalled();
      // Only the one expandToFilter call for the base filter — no second widening call.
      expect(genreRepository.expandToFilter).toHaveBeenCalledTimes(1);
    });

    it("drops a similar genre that is already one of the seed's own subgenres", async () => {
      // Latin's similar genres include Salsa, which is already under it.
      genreRepository.expandToFilter.mockResolvedValueOnce({
        ids: ["id-latin", "id-salsa", "id-cumbia"],
        keys: ["latin", "salsa", "cumbia"],
      });
      genreSimilarityRepository.topForGenre.mockResolvedValue([
        { related_genre_id: "id-salsa", score: 0.95, signals: {} },
        { related_genre_id: "id-reggaeton", score: 0.6, signals: {} },
      ]);
      genreRepository.findRefsByIds.mockResolvedValue([
        { id: "id-reggaeton", name: "Reggaeton", slug: "reggaeton" },
      ]);
      genreRepository.expandToFilter.mockResolvedValueOnce({
        ids: ["id-latin", "id-salsa", "id-cumbia", "id-reggaeton"],
        keys: ["latin", "salsa", "cumbia", "reggaeton"],
      });
      genreRepository.findIdsBySlug.mockResolvedValue(new Map([["latin", "id-latin"]]));

      const result = await resolveGenreFilter(["latin"], { includeSimilar: true });

      expect(genreRepository.findRefsByIds).toHaveBeenCalledWith(["id-reggaeton"]);
      expect(result.added).toEqual([{ id: "id-reggaeton", name: "Reggaeton", slug: "reggaeton" }]);
    });

    it("keeps the best score for a related genre shared by three seeds", async () => {
      genreRepository.findIdsBySlug.mockResolvedValue(
        new Map([
          ["cumbia", "id-cumbia"],
          ["salsa", "id-salsa"],
          ["merengue", "id-merengue"],
        ])
      );
      genreRepository.expandToFilter
        .mockResolvedValueOnce({
          ids: ["id-cumbia", "id-salsa", "id-merengue"],
          keys: ["cumbia", "salsa", "merengue"],
        })
        .mockResolvedValueOnce({
          ids: ["id-cumbia", "id-salsa", "id-merengue", "id-porro"],
          keys: ["cumbia", "salsa", "merengue", "porro"],
        });
      genreSimilarityRepository.topForGenre
        .mockResolvedValueOnce([{ related_genre_id: "id-porro", score: 0.4, signals: {} }])
        .mockResolvedValueOnce([{ related_genre_id: "id-porro", score: 0.9, signals: {} }])
        // Lower than the running best (0.9): must not overwrite it.
        .mockResolvedValueOnce([{ related_genre_id: "id-porro", score: 0.6, signals: {} }]);
      genreRepository.findRefsByIds.mockResolvedValue([
        { id: "id-porro", name: "Porro", slug: "porro" },
      ]);

      const result = await resolveGenreFilter(["cumbia", "salsa", "merengue"], { includeSimilar: true });

      // The highest of the three scores (0.9, from salsa) wins; porro is added once.
      expect(result.added).toEqual([{ id: "id-porro", name: "Porro", slug: "porro" }]);
    });

    it("drops a related genre deleted since the table was last recomputed", async () => {
      genreRepository.expandToFilter
        .mockResolvedValueOnce({ ids: ["id-cumbia"], keys: ["cumbia"] })
        .mockResolvedValueOnce({ ids: ["id-cumbia", "id-gone"], keys: ["cumbia", "gone"] });
      genreSimilarityRepository.topForGenre.mockResolvedValue([
        { related_genre_id: "id-gone", score: 0.5, signals: {} },
      ]);
      genreRepository.findRefsByIds.mockResolvedValue([]);

      const result = await resolveGenreFilter(["cumbia"], { includeSimilar: true });

      expect(result.added).toEqual([]);
    });

    it("never re-adds a similar genre the caller already excluded", async () => {
      genreRepository.expandToFilter.mockResolvedValue({ ids: ["id-cumbia"], keys: ["cumbia"] });
      genreSimilarityRepository.topForGenre.mockResolvedValue([
        { related_genre_id: "id-porro", score: 0.9, signals: {} },
      ]);

      const result = await resolveGenreFilter(["cumbia"], {
        includeSimilar: true,
        excludeSimilarIds: ["id-porro"],
      });

      expect(result).toEqual({ filter: { ids: ["id-cumbia"], keys: ["cumbia"] }, added: [] });
      expect(genreRepository.findRefsByIds).not.toHaveBeenCalled();
    });
  });
});

describe("unknownGenresError", () => {
  it("names every unknown genre", () => {
    expect(unknownGenresError(["a", "b"])).toEqual({ error: "Unknown genre: a, b", unknown: ["a", "b"] });
  });
});

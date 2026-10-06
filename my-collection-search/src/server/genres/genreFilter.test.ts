import { beforeEach, describe, expect, it, vi } from "vitest";

const genreRepository = vi.hoisted(() => ({
  findIdsBySlug: vi.fn(),
  expandToFilter: vi.fn(),
}));
const trackGenreRepository = vi.hoisted(() => ({ resolveGenreRefs: vi.fn() }));

vi.mock("@/server/repositories/genreRepository", () => ({ genreRepository }));
vi.mock("@/server/repositories/trackGenreRepository", () => ({ trackGenreRepository }));

import { resolveGenreFilter, unknownGenresError } from "./genreFilter";

describe("resolveGenreFilter", () => {
  beforeEach(() => vi.resetAllMocks());

  it("is no filter for no values, without touching the database", async () => {
    await expect(resolveGenreFilter([" ", ""])).resolves.toEqual({ filter: undefined });
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
    expect(result).toEqual({ filter: { ids: ["x"], keys: ["y"] } });
  });

  it("reports what matched nothing instead of filtering", async () => {
    genreRepository.findIdsBySlug.mockResolvedValue(new Map());
    trackGenreRepository.resolveGenreRefs.mockResolvedValue({ ids: [], unknown: ["Cumbiaa"] });

    await expect(resolveGenreFilter(["Cumbiaa"])).resolves.toEqual({ unknown: ["Cumbiaa"] });
    expect(genreRepository.expandToFilter).not.toHaveBeenCalled();
  });
});

describe("unknownGenresError", () => {
  it("names every unknown genre", () => {
    expect(unknownGenresError(["a", "b"])).toEqual({ error: "Unknown genre: a, b", unknown: ["a", "b"] });
  });
});

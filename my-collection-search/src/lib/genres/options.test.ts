import { describe, expect, it } from "vitest";
import type { GenreTreeNode } from "@/api-contract/schemas";
import {
  filterGenreOptions,
  flattenGenreTree,
  genreFilterOptions,
  genreSelectionChanged,
  type GenreOption,
} from "./options";

const node = (id: string, name: string, children: GenreTreeNode[] = [], track_count = 0): GenreTreeNode => ({
  id,
  name,
  slug: name.toLowerCase(),
  parent_id: null,
  source: "discogs",
  track_count,
  album_count: 0,
  children,
});

const option = (id: string, name: string, track_count = 0): GenreOption => ({
  id,
  name,
  slug: name.toLowerCase(),
  parent_id: null,
  parent_name: null,
  track_count,
});

describe("flattenGenreTree", () => {
  it("lists every genre depth-first with its parent's name", () => {
    const cumbia = { ...node("cumbia", "Cumbia", [], 4), parent_id: "latin" };
    expect(flattenGenreTree([node("latin", "Latin", [cumbia]), node("jazz", "Jazz")])).toEqual([
      { id: "latin", name: "Latin", slug: "latin", parent_id: null, parent_name: null, track_count: 0 },
      { id: "cumbia", name: "Cumbia", slug: "cumbia", parent_id: "latin", parent_name: "Latin", track_count: 4 },
      { id: "jazz", name: "Jazz", slug: "jazz", parent_id: null, parent_name: null, track_count: 0 },
    ]);
  });
});

describe("filterGenreOptions", () => {
  const options = [
    option("pc", "Psychedelic Cumbia", 113),
    option("c", "Cumbia", 20),
    option("pp", "Post-Punk", 5),
    option("cc", "Cumbia Colombiana", 40),
  ];

  it("ranks prefix matches above substring matches, then by use", () => {
    expect(filterGenreOptions(options, "cumbia").map((o) => o.id)).toEqual(["cc", "c", "pc"]);
  });

  it("matches through the taxonomy normalisation", () => {
    expect(filterGenreOptions(options, "  POST‑punk ").map((o) => o.id)).toEqual(["pp"]);
  });

  it("lists the most used genres first for an empty input, leaving out chosen ones", () => {
    expect(filterGenreOptions(options, "", new Set(["pc"])).map((o) => o.id)).toEqual(["cc", "c", "pp"]);
  });

  it("breaks ties by name and honours the limit", () => {
    const tied = [option("b", "Bolero"), option("a", "Afrobeat")];
    expect(filterGenreOptions(tied, "").map((o) => o.id)).toEqual(["a", "b"]);
    expect(filterGenreOptions(options, "", new Set(), 1)).toHaveLength(1);
  });

  it("offers nothing for a value no genre contains", () => {
    expect(filterGenreOptions(options, "feminist anthem")).toEqual([]);
  });
});

describe("genreSelectionChanged", () => {
  const a = option("a", "A");
  const b = option("b", "B");

  it("ignores order", () => {
    expect(genreSelectionChanged([a, b], [b, a])).toBe(false);
  });

  it("notices additions, removals and swaps", () => {
    expect(genreSelectionChanged([a], [a, b])).toBe(true);
    expect(genreSelectionChanged([a, b], [a])).toBe(true);
    expect(genreSelectionChanged([a], [b])).toBe(true);
  });
});

describe("genreFilterOptions (#375)", () => {
  const options = [option("latin", "Latin", 9), option("cumbia", "Cumbia", 4), option("jazz", "Jazz", 2)];

  it("carries the search's counts and drops genres with none", () => {
    const counts = new Map([["latin", 3], ["cumbia", 1]]);
    expect(genreFilterOptions(options, counts)).toEqual([
      { ...options[0], track_count: 3 },
      { ...options[1], track_count: 1 },
    ]);
  });

  it("offers every genre unchanged without counts", () => {
    expect(genreFilterOptions(options)).toBe(options);
  });
});

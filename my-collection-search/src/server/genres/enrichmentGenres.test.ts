import { describe, expect, it } from "vitest";
import {
  albumContextLines,
  genreEnumNames,
  resolveSuggestedGenres,
  toGenreChoices,
  type GenreChoice,
} from "./enrichmentGenres";

const choice = (name: string, track_count = 0): GenreChoice => ({
  id: `id-${name}`,
  name,
  slug: name.toLowerCase(),
  parent_id: null,
  parent_name: null,
  track_count,
});

describe("toGenreChoices", () => {
  it("carries each genre's parent name, and null for a missing parent", () => {
    const rows = [
      { id: "latin", name: "Latin", slug: "latin", parent_id: null, source: "discogs" as const, track_count: 1, album_count: 1, aliases: [] },
      { id: "cumbia", name: "Cumbia", slug: "cumbia", parent_id: "latin", source: "discogs" as const, track_count: 5, album_count: 2, aliases: [] },
      { id: "orphan", name: "Orphan", slug: "orphan", parent_id: "gone", source: "custom" as const, track_count: 0, album_count: 0, aliases: [] },
    ];
    expect(toGenreChoices(rows)).toEqual([
      { id: "latin", name: "Latin", slug: "latin", parent_id: null, parent_name: null, track_count: 1 },
      { id: "cumbia", name: "Cumbia", slug: "cumbia", parent_id: "latin", parent_name: "Latin", track_count: 5 },
      { id: "orphan", name: "Orphan", slug: "orphan", parent_id: "gone", parent_name: null, track_count: 0 },
    ]);
  });
});

describe("genreEnumNames", () => {
  it("offers every name, sorted, while the taxonomy fits", () => {
    expect(genreEnumNames([choice("Salsa"), choice("Cumbia"), choice("Jazz")])).toEqual([
      "Cumbia",
      "Jazz",
      "Salsa",
    ]);
  });

  it("past the value limit, keeps the album's genres and then the most used", () => {
    const tail = Array.from({ length: 1_000 }, (_, i) => choice(`Tail ${String(i).padStart(4, "0")}`));
    const names = genreEnumNames(
      [...tail, choice("Popular", 50), choice("Chicha"), choice("Cumbia"), choice("Zouk")],
      {
        albumGenres: [],
        albumStyles: ["cumbia"],
        releaseGenres: [{ name: "Chicha", track_count: 2 }],
      }
    );
    expect(names).toHaveLength(900);
    expect(names).toEqual(expect.arrayContaining(["Chicha", "Cumbia", "Popular"]));
    expect(names).not.toContain("Zouk");
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("past the character limit, stops before the name that would exceed it", () => {
    const long = Array.from({ length: 300 }, (_, i) => choice(`${"x".repeat(60)}${i}`));
    const names = genreEnumNames(long);
    expect(names.join("").length).toBeLessThanOrEqual(14_000);
    expect(names.length).toBeLessThan(300);
  });
});

describe("albumContextLines", () => {
  it("lists what is known about the album", () => {
    expect(
      albumContextLines({
        albumGenres: ["Latin", "Jazz"],
        albumStyles: ["Cumbia"],
        releaseGenres: [
          { name: "Psychedelic Cumbia", track_count: 4 },
          { name: "Salsa", track_count: 1 },
        ],
      })
    ).toEqual([
      "Album Discogs genres: Latin, Jazz",
      "Album Discogs styles: Cumbia",
      "Track genres already used on this album: Psychedelic Cumbia (4), Salsa (1)",
    ]);
  });

  it("says nothing for an album with no genres, styles or tagged tracks", () => {
    expect(albumContextLines({ albumGenres: [], albumStyles: [], releaseGenres: [] })).toEqual([]);
  });
});

describe("resolveSuggestedGenres", () => {
  const choices = [choice("Cumbia"), choice("Salsa"), choice("Chicha"), choice("Jazz")];

  it("ignores anything that is not an array", () => {
    expect(resolveSuggestedGenres("Cumbia", choices)).toEqual([]);
    expect(resolveSuggestedGenres(undefined, choices)).toEqual([]);
  });

  it("keeps at most three taxonomy genres, without their counts", () => {
    const res = resolveSuggestedGenres(["Jazz", "SALSA", "Chicha", "Cumbia"], choices);
    expect(res.map((genre) => genre.name)).toEqual(["Jazz", "Salsa", "Chicha"]);
    expect(res[0]).not.toHaveProperty("track_count");
  });
});

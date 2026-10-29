import { describe, expect, it } from "vitest";
import type { GenreTreeNode } from "@/api-contract/schemas";
import type { Album } from "@/types/track";
import { arrivalGenreSummary, rankedSubgenres } from "./discovery";
import { countGenreTree } from "./tree";
const node = (slug: string, children: GenreTreeNode[] = []): GenreTreeNode => ({
  id: slug,
  slug,
  name: slug,
  children,
  parent_id: null,
  source: "discogs",
  track_count: 0,
  album_count: 0,
});
const tree = [node("rock", [node("punk", [node("post-punk")]), node("indie")]), node("jazz")];
const album = (fields: Partial<Album>): Album => ({
  release_id: "one",
  friend_id: 1,
  title: "One",
  artist: "Artist",
  track_count: 1,
  ...fields,
});
describe("genre discovery", () => {
  it("ranks all descendants by count with alphabetical ties", () => {
    const [entry] = countGenreTree(
      tree,
      new Map([
        ["rock", 10],
        ["punk", 5],
        ["post-punk", 5],
        ["indie", 8],
      ]),
      { showEmpty: false, search: "" },
    );
    expect(rankedSubgenres(entry).map((row) => row.node.slug)).toEqual([
      "indie",
      "post-punk",
      "punk",
    ]);
  });
  it("rolls styles into parents, deduplicates per album, and respects empty overrides", () => {
    expect(
      arrivalGenreSummary(
        [
          album({ genres: ["rock"], styles: ["punk", "indie", "post-punk"] }),
          album({ genres: ["rock", "jazz"], effective_genres: [], effective_styles: ["jazz"] }),
          album({ genres: ["Unknown"] }),
          album({}),
        ],
        tree,
      ),
    ).toEqual([
      { label: "rock", slug: "rock", count: 1 },
      { label: "jazz", slug: "jazz", count: 1 },
    ]);
    expect(arrivalGenreSummary([], [])).toEqual([]);
  });
});

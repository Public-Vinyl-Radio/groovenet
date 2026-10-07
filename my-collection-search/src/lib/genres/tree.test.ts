import { describe, expect, it } from "vitest";
import type { GenreTreeNode } from "@/api-contract/schemas";
import { countGenreTree, type CountedGenreNode } from "./tree";

const node = (id: string, name: string, children: GenreTreeNode[] = []): GenreTreeNode => ({
  id,
  name,
  slug: id,
  parent_id: null,
  source: "discogs",
  track_count: 0,
  album_count: 0,
  children,
});

const tree = [
  node("rock", "Rock", [node("punk", "Punk")]),
  node("latin", "Latin", [node("salsa", "Salsa"), node("cumbia", "Cumbia"), node("bolero", "Bolero")]),
];
const counts = new Map([
  ["rock", 5],
  ["latin", 40],
  ["cumbia", 30],
  ["salsa", 10],
  ["punk", 5],
]);

/** Names, nested the way the page renders them. */
const shape = (entries: CountedGenreNode[]): unknown =>
  entries.map((entry) => (entry.children.length ? [entry.node.name, shape(entry.children)] : entry.node.name));

describe("countGenreTree", () => {
  it("orders every level biggest first and drops genres the collection doesn't hold", () => {
    const result = countGenreTree(tree, counts, { showEmpty: false, search: "" });

    expect(shape(result)).toEqual([["Latin", ["Cumbia", "Salsa"]], ["Rock", ["Punk"]]]);
    expect(result[0].count).toBe(40);
  });

  it("keeps empty genres when asked", () => {
    const result = countGenreTree(tree, counts, { showEmpty: true, search: "" });

    expect(shape(result)).toEqual([["Latin", ["Cumbia", "Salsa", "Bolero"]], ["Rock", ["Punk"]]]);
    expect(result[0].children[2].count).toBe(0);
  });

  it("orders genres with equal counts by name", () => {
    const result = countGenreTree(tree, new Map([["rock", 7], ["latin", 7]]), { showEmpty: false, search: "" });
    expect(shape(result)).toEqual(["Latin", "Rock"]);
  });

  it("keeps a match's parents for context, and drops the rest", () => {
    expect(shape(countGenreTree(tree, counts, { showEmpty: false, search: "cumb" }))).toEqual([["Latin", ["Cumbia"]]]);
    expect(shape(countGenreTree(tree, counts, { showEmpty: false, search: "punk" }))).toEqual([["Rock", ["Punk"]]]);
  });

  it("keeps everything under a matching genre", () => {
    expect(shape(countGenreTree(tree, counts, { showEmpty: false, search: "LATIN" }))).toEqual([
      ["Latin", ["Cumbia", "Salsa"]],
    ]);
  });

  it("returns nothing when nothing matches", () => {
    expect(countGenreTree(tree, counts, { showEmpty: true, search: "polka" })).toEqual([]);
  });
});

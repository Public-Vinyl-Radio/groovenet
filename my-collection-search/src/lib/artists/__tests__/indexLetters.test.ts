import { expect, it } from "vitest";
import {
  INDEX_LETTERS,
  artistCountLabel,
  groupByIndexLetter,
  indexLetterFromHash,
  indexLetterFromParam,
  indexLetterOf,
} from "../indexLetters";

it("lists A to Z, then # for everything else", () => {
  expect(INDEX_LETTERS).toHaveLength(27);
  expect(INDEX_LETTERS[0]).toBe("A");
  expect(INDEX_LETTERS.at(-1)).toBe("#");
});

it("reads a URL letter case-insensitively, and nothing else", () => {
  expect(indexLetterFromParam(" m ")).toBe("M");
  expect(indexLetterFromParam("#")).toBe("#");
  for (const value of [null, "", "mm", "1", "é"])
    expect(indexLetterFromParam(value)).toBe(undefined);
});

it("counts artists", () => {
  expect(artistCountLabel(1)).toBe("1 artist");
  expect(artistCountLabel(1517)).toBe("1,517 artists");
});

it("files a sort name under its first letter, accents folded, the rest under #", () => {
  expect(indexLetterOf("Beatles, The")).toBe("B");
  expect(indexLetterOf("  mirlos")).toBe("M");
  expect(indexLetterOf("Álvarez")).toBe("A");
  expect(indexLetterOf("ñandú")).toBe("N");
  for (const name of ["808 State", "!!!", "Ωmega", ""]) expect(indexLetterOf(name)).toBe("#");
});

it("groups in index order with # last, keeping each group's order", () => {
  const sort = (sort_name: string) => ({ sort_name });
  expect(
    groupByIndexLetter([sort("808"), sort("Zed"), sort("Álvarez"), sort("Abba"), sort("Mirlos")]),
  ).toEqual([
    { letter: "A", items: [sort("Álvarez"), sort("Abba")] },
    { letter: "M", items: [sort("Mirlos")] },
    { letter: "Z", items: [sort("Zed")] },
    { letter: "#", items: [sort("808")] },
  ]);
  expect(groupByIndexLetter([])).toEqual([]);
});

it("reads a letter from a URL hash", () => {
  expect(indexLetterFromHash("#b")).toBe("B");
  expect(indexLetterFromHash("#%23")).toBe("#");
  expect(indexLetterFromHash("#")).toBe(undefined);
  expect(indexLetterFromHash("#bb")).toBe(undefined);
  expect(indexLetterFromHash("#%E0%A4%A")).toBe(undefined);
});

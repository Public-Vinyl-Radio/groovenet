import { expect, it } from "vitest";
import { INDEX_LETTERS, artistCountLabel, indexLetterFromParam } from "../indexLetters";

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

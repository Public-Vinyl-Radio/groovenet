import { describe, expect, it } from "vitest";
import { normalizeGenreName } from "@/lib/genres/normalization";
import { genreAliasSeed, genreSeed, genreStyleSeed } from "./taxonomySeed";

describe("genre taxonomy seed", () => {
  it("has unique canonical names and slugs", () => {
    const entries = [...genreSeed, ...genreStyleSeed];
    const normalizedNames = entries.map((entry) => normalizeGenreName(entry.name));
    const slugs = entries.map((entry) =>
      entry.name
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/&/g, " and ")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    );

    expect(new Set(normalizedNames).size).toBe(entries.length);
    expect(new Set(slugs).size).toBe(entries.length);
  });

  it("puts every child under a seeded root", () => {
    const rootNames = new Set(genreSeed.map((entry) => entry.name));

    for (const entry of genreStyleSeed) {
      expect(rootNames).toContain(entry.parentName);
    }
  });

  it("resolves each seeded alias to a canonical entry", () => {
    const names = new Set([...genreSeed, ...genreStyleSeed].map((entry) => entry.name));

    for (const alias of genreAliasSeed) {
      expect(names).toContain(alias.genreName);
      expect(normalizeGenreName(alias.alias)).not.toBe(normalizeGenreName(alias.genreName));
    }
  });
});

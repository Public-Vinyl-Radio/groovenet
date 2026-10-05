import { describe, expect, it, vi } from "vitest";
import { up, down } from "../../../migrations/1791300000000_add_genre_taxonomy.js";
import { genreAliasSeed, genreSeed, genreStyleSeed } from "./taxonomySeed";

const migration = () => ({
  func: (value: string) => value,
  createTable: vi.fn(), addConstraint: vi.fn(), createIndex: vi.fn(),
  sql: vi.fn(), dropTable: vi.fn(),
});

describe("taxonomy migration", () => {
  it("creates constrained canonical names, slugs, parents and aliases", () => {
    const pgm = migration();
    up(pgm);
    expect(pgm.createTable.mock.calls.map(([table]) => table)).toEqual(["genres", "genre_aliases"]);
    expect(pgm.addConstraint).toHaveBeenCalledWith("genres", "genres_normalized_name_key", { unique: "normalized_name" });
    expect(pgm.addConstraint).toHaveBeenCalledWith("genres", "genres_slug_key", { unique: "slug" });
    expect(pgm.createTable).toHaveBeenCalledWith("genres", expect.objectContaining({ parent_id: expect.objectContaining({ references: "genres(id)", onDelete: "RESTRICT" }) }));
    expect(pgm.createTable).toHaveBeenCalledWith("genre_aliases", expect.objectContaining({ genre_id: expect.objectContaining({ references: "genres(id)", onDelete: "CASCADE" }) }));
  });
  it("inserts roots before children, escapes names and guards every seed insert", () => {
    const pgm = migration();
    up(pgm);
    const statements = pgm.sql.mock.calls.map(([sql]) => sql as string);
    expect(statements).toHaveLength(genreSeed.length + genreStyleSeed.length + genreAliasSeed.length);
    expect(statements.slice(0, genreSeed.length).every((sql) => !sql.includes("SELECT id FROM genres"))).toBe(true);
    expect(statements.slice(genreSeed.length, genreSeed.length + genreStyleSeed.length).every((sql) => sql.includes("SELECT id FROM genres WHERE normalized_name"))).toBe(true);
    expect(statements.every((sql) => sql.includes("ON CONFLICT") && sql.includes("DO NOTHING"))).toBe(true);
    expect(statements.join("\n")).toContain("Children''s");
    expect(statements.join("\n")).toContain("'bossanova'");
    expect(statements.join("\n")).toContain("'bossa nova'");
  });
  it("drops aliases before genres on rollback", () => {
    const pgm = migration();
    down(pgm);
    expect(pgm.dropTable.mock.calls).toEqual([["genre_aliases"], ["genres"]]);
  });
});

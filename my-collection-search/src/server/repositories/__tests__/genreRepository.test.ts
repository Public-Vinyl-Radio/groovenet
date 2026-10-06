import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildGenreTree, GenreRepository, type GenreRow } from "../genreRepository";

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({ dbQuery }));

const row = (overrides: Partial<GenreRow>): GenreRow => ({
  id: "id",
  name: "Genre",
  slug: "genre",
  parent_id: null,
  source: "discogs",
  track_count: 0,
  album_count: 0,
  ...overrides,
});

describe("buildGenreTree", () => {
  it("nests children below their canonical parent", () => {
    const result = buildGenreTree([
      row({ id: "latin", name: "Latin", slug: "latin" }),
      row({ id: "cumbia", name: "Cumbia", slug: "cumbia", parent_id: "latin" }),
    ]);

    expect(result).toEqual([
      expect.objectContaining({ id: "latin", children: [expect.objectContaining({ id: "cumbia" })] }),
    ]);
  });

  it("rejects an orphaned child rather than silently omitting it", () => {
    expect(() => buildGenreTree([row({ parent_id: "missing" })])).toThrow("no parent 'missing'");
  });
});

describe("GenreRepository", () => {
  beforeEach(() => vi.resetAllMocks());

  it("counts live tracks and their albums from track genre links", async () => {
    dbQuery.mockResolvedValue({ rows: [row({ id: "latin", track_count: 3, album_count: 2 })] });

    await expect(new GenreRepository().listTree()).resolves.toEqual([
      expect.objectContaining({ id: "latin", track_count: 3, album_count: 2 }),
    ]);
    const [sql] = dbQuery.mock.calls[0];
    expect(sql).toContain("FROM track_genres tg");
    expect(sql).toContain("WHERE t.deleted_at IS NULL");
  });
});

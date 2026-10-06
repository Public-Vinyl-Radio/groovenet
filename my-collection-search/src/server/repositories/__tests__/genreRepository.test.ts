import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildGenreTree, GenreRepository, type GenreRow } from "../genreRepository";

const dbQuery = vi.hoisted(() => vi.fn());
const clientQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({
  dbQuery,
  withDbTransaction: (fn: (client: { query: typeof clientQuery }) => unknown) => fn({ query: clientQuery }),
}));

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

describe("GenreRepository.listFlat", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the rows parent-keyed, without building the tree", async () => {
    const rows = [row({ id: "cumbia", parent_id: "latin" })];
    dbQuery.mockResolvedValue({ rows });
    await expect(new GenreRepository().listFlat()).resolves.toEqual(rows);
  });
});

describe("GenreRepository genre filter lookups (#375)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("maps the slugs that exist to their ids", async () => {
    dbQuery.mockResolvedValue({ rows: [{ slug: "cumbia", id: "id-cumbia" }] });
    const result = await new GenreRepository().findIdsBySlug(["cumbia", "nope"]);
    expect(result).toEqual(new Map([["cumbia", "id-cumbia"]]));
    expect(dbQuery.mock.calls[0][1]).toEqual([["cumbia", "nope"]]);
  });

  it("does not query for no slugs", async () => {
    await expect(new GenreRepository().findIdsBySlug([])).resolves.toEqual(new Map());
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("expands to descendants with their names and aliases", async () => {
    dbQuery.mockResolvedValue({ rows: [{ ids: ["a", "b"], keys: ["cumbia", "latin"] }] });
    await expect(new GenreRepository().expandToFilter(["a"])).resolves.toEqual({
      ids: ["a", "b"],
      keys: ["cumbia", "latin"],
    });
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("WITH RECURSIVE tree");
    expect(sql).toContain("JOIN tree ON g.parent_id = tree.id");
    expect(sql).toContain("FROM genre_aliases a");
    expect(params).toEqual([["a"]]);
  });

  it("is an empty filter when no genre exists", async () => {
    dbQuery.mockResolvedValue({ rows: [{ ids: null, keys: null }] });
    await expect(new GenreRepository().expandToFilter([])).resolves.toEqual({ ids: [], keys: [] });
  });
});

describe("GenreRepository.trackFacets (#375)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("counts distinct tracks per genre and ancestor over the given clauses", async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "id-latin", track_count: 2 }] });

    const result = await new GenreRepository().trackFacets(["friend_id = $1"], [6]);

    expect(result).toEqual([{ id: "id-latin", track_count: 2 }]);
    expect(clientQuery.mock.calls[0][0]).toContain("set_config('jit', 'off', true)");
    const [sql, params] = clientQuery.mock.calls[1];
    expect(sql).toContain("WHERE friend_id = $1 AND t.deleted_at IS NULL");
    expect(sql).toContain("JOIN genre_keys k ON k.key = genre_normalize(d.name)");
    expect(sql).toContain("JOIN genres g ON g.id = l.parent_id");
    expect(sql).toContain("COUNT(DISTINCT (tg.track_id, tg.friend_id))");
    expect(params).toEqual([6]);
  });
});

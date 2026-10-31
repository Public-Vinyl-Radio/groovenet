import { beforeEach, describe, expect, it, vi } from "vitest";
import { GenreSimilarityRepository } from "../genreSimilarityRepository";
import type { GenreSimilarityEntry } from "@/lib/genres/genreSimilarity";

const dbQuery = vi.hoisted(() => vi.fn());
const clientQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({
  dbQuery,
  withDbTransaction: (fn: (client: { query: typeof clientQuery }) => unknown) =>
    fn({ query: clientQuery }),
}));

describe("GenreSimilarityRepository", () => {
  beforeEach(() => vi.resetAllMocks());

  describe("loadCoOccurrence", () => {
    it("loads pairs, per-genre album counts and the collection total with separate pooled queries", async () => {
      dbQuery
        .mockResolvedValueOnce({ rows: [{ genre_id_a: "a", genre_id_b: "b", shared_albums: 4 }] })
        .mockResolvedValueOnce({
          rows: [
            { genre_id: "a", album_count: 10 },
            { genre_id: "b", album_count: 6 },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ total: 50 }] });

      const result = await new GenreSimilarityRepository().loadCoOccurrence();

      expect(result).toEqual({
        pairs: [{ genre_id_a: "a", genre_id_b: "b", shared_albums: 4 }],
        albumCounts: [
          { genre_id: "a", album_count: 10 },
          { genre_id: "b", album_count: 6 },
        ],
        totalAlbums: 50,
      });
      expect(dbQuery).toHaveBeenCalledTimes(3);
      expect(dbQuery.mock.calls[0][0]).toContain("album_genre g1");
      expect(dbQuery.mock.calls[1][0]).toContain("GROUP BY genre_id");
      expect(dbQuery.mock.calls[2][0]).toContain("FROM albums");
      expect(clientQuery).not.toHaveBeenCalled();
    });

    it("defaults the total to zero when the query somehow returns no row", async () => {
      dbQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await new GenreSimilarityRepository().loadCoOccurrence();
      expect(result.totalAlbums).toBe(0);
    });
  });

  describe("replaceAll", () => {
    it("deletes the whole table before inserting the new rows, in one transaction", async () => {
      const entries: GenreSimilarityEntry[] = [
        { genre_id: "a", related_genre_id: "b", score: 1.5, signals: { taxonomy: "sibling" } },
        { genre_id: "b", related_genre_id: "a", score: 1.5, signals: { taxonomy: "sibling" } },
      ];
      clientQuery.mockResolvedValue({ rows: [] });

      await new GenreSimilarityRepository().replaceAll(entries);

      expect(clientQuery).toHaveBeenNthCalledWith(1, "DELETE FROM genre_similarity");
      const [sql, params] = clientQuery.mock.calls[1];
      expect(sql).toContain("INSERT INTO genre_similarity");
      expect(params).toEqual([
        ["a", "b"],
        ["b", "a"],
        [1.5, 1.5],
        [JSON.stringify({ taxonomy: "sibling" }), JSON.stringify({ taxonomy: "sibling" })],
      ]);
    });

    it("still deletes everything, but skips the insert, when there is nothing to write", async () => {
      clientQuery.mockResolvedValue({ rows: [] });

      await new GenreSimilarityRepository().replaceAll([]);

      expect(clientQuery).toHaveBeenCalledTimes(1);
      expect(clientQuery).toHaveBeenCalledWith("DELETE FROM genre_similarity");
    });
  });

  describe("loadOverlapData", () => {
    it("loads the whole similarity table and every genre's parent", async () => {
      dbQuery
        .mockResolvedValueOnce({ rows: [{ genre_id: "a", related_genre_id: "b", score: 1.2 }] })
        .mockResolvedValueOnce({
          rows: [
            { id: "a", parent_id: null },
            { id: "b", parent_id: "a" },
          ],
        });

      const result = await new GenreSimilarityRepository().loadOverlapData();

      expect(result).toEqual({
        pairs: [{ genre_id: "a", related_genre_id: "b", score: 1.2 }],
        taxonomy: [
          { id: "a", parent_id: null },
          { id: "b", parent_id: "a" },
        ],
      });
      expect(dbQuery).toHaveBeenCalledTimes(2);
      expect(dbQuery.mock.calls[0][0]).toContain("FROM genre_similarity");
      expect(dbQuery.mock.calls[1][0]).toContain("FROM genres");
    });
  });

  describe("topForGenre", () => {
    it("queries by genre_id, ordered best first, limited", async () => {
      dbQuery.mockResolvedValue({
        rows: [{ related_genre_id: "b", score: 1.2, signals: { npmi: 0.3 } }],
      });

      const result = await new GenreSimilarityRepository().topForGenre("a", 20);

      expect(result).toEqual([{ related_genre_id: "b", score: 1.2, signals: { npmi: 0.3 } }]);
      expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("ORDER BY score DESC"), [
        "a",
        20,
        [],
      ]);
    });

    it("excludes the given ids in the query, before the limit", async () => {
      dbQuery.mockResolvedValue({ rows: [] });

      await new GenreSimilarityRepository().topForGenre("a", 5, ["b", "c"]);

      const [sql, params] = dbQuery.mock.calls[0];
      expect(sql).toMatch(/related_genre_id <> ALL\(\$3::uuid\[\]\)[\s\S]*LIMIT \$2/);
      expect(params).toEqual(["a", 5, ["b", "c"]]);
    });
  });
});

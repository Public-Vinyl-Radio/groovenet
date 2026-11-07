import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArtistRepository } from "../artistRepository";
import type { ArtistCredit } from "@/types/artist";

const { dbQuery, clientQuery } = vi.hoisted(() => ({ dbQuery: vi.fn(), clientQuery: vi.fn() }));
vi.mock("@/lib/serverDb", () => ({
  dbQuery,
  withDbTransaction: (fn: (client: { query: typeof clientQuery }) => unknown) =>
    fn({ query: clientQuery }),
}));
const repo = new ArtistRepository();
const artist = { id: 1, name: "The Strokes", sort_name: "Strokes, The", slug: "the-strokes" };
const credit: ArtistCredit = {
  artist_id: 1,
  role: "primary",
  position: 0,
  credited_as: "Strokes, The",
  source: "discogs",
};
beforeEach(() => vi.resetAllMocks());

describe("artists", () => {
  it("creates shared artists with nullable external ids and placeholder default", async () => {
    dbQuery.mockResolvedValue({ rows: [artist] });
    expect(await repo.create(artist)).toEqual(artist);
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO artists"), [
      artist.name,
      artist.sort_name,
      artist.slug,
      null,
      null,
      false,
    ]);
  });
  it("preserves explicit external ids and placeholder flag", async () => {
    dbQuery.mockResolvedValue({ rows: [artist] });
    await repo.create({
      ...artist,
      discogs_artist_id: "123",
      apple_artist_id: "456",
      is_placeholder: true,
    });
    expect(dbQuery.mock.calls[0][1]).toEqual([
      artist.name,
      artist.sort_name,
      artist.slug,
      "123",
      "456",
      true,
    ]);
  });
  it.each([
    ["id", () => repo.findById(1), 1],
    ["slug", () => repo.findBySlug("the-strokes"), "the-strokes"],
    ["discogs_artist_id", () => repo.findByDiscogsId("123"), "123"],
    ["apple_artist_id", () => repo.findByAppleId("456"), "456"],
    ["aa.alias_normalized", () => repo.findByAlias("The Strókes (2)"), "strokes"],
  ] as const)("looks up by %s, including missing records", async (column, lookup, value) => {
    dbQuery.mockResolvedValueOnce({ rows: [artist] }).mockResolvedValueOnce({ rows: [] });
    expect(await lookup()).toEqual(artist);
    expect(await lookup()).toBeNull();
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining(`${column} = $1`), [value]);
  });
  it("finds an artist by a former slug too", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [artist] });
    await repo.findBySlug("artist-abc");
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("FROM artist_slug_history"), [
      "artist-abc",
    ]);
  });
  it("adds an alias without stealing another artist's spelling key", async () => {
    const alias = { artist_id: 1, alias: "The Strokes", alias_normalized: "strokes" };
    dbQuery.mockResolvedValueOnce({ rows: [alias] }).mockResolvedValueOnce({ rows: [] });
    expect(await repo.addAlias(1, "The Strokes")).toEqual(alias);
    expect(dbQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE artist_aliases.artist_id = EXCLUDED.artist_id"),
      [1, "The Strokes", "strokes"],
    );
    await expect(repo.addAlias(2, "Strokes, The")).rejects.toThrow("already belongs");
  });
  it("rejects aliases that normalise to blank", async () => {
    await expect(repo.addAlias(1, " (2) ")).rejects.toThrow("must not be blank");
    expect(dbQuery).not.toHaveBeenCalled();
  });
  it("lists aliases", async () => {
    dbQuery.mockResolvedValue({ rows: [{ alias: "The Strokes" }] });
    expect(await repo.listAliases(1)).toEqual([{ alias: "The Strokes" }]);
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("ORDER BY alias_normalized"), [1]);
  });
  it("propagates database failures", async () => {
    dbQuery.mockRejectedValue(new Error("duplicate slug"));
    await expect(repo.create(artist)).rejects.toThrow("duplicate slug");
  });
});

describe("credits", () => {
  it("reads album credits by their own album id in credit order", async () => {
    dbQuery.mockResolvedValue({ rows: [credit] });
    expect(await repo.listAlbumCredits(10)).toEqual([credit]);
    expect(dbQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE album_id = $1 ORDER BY position"),
      [10],
    );
  });
  it("scopes track reads to a friend", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    expect(await repo.listTrackCredits("t1", 6)).toEqual([]);
    expect(dbQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE track_id = $1 AND friend_id = $2"),
      ["t1", 6],
    );
  });
  it("replaces album credits, preserving all credit metadata", async () => {
    await repo.replaceAlbumCredits(10, [credit, { ...credit, role: "composer", position: 1 }]);
    expect(clientQuery).toHaveBeenNthCalledWith(
      1,
      "DELETE FROM album_artists WHERE album_id = $1",
      [10],
    );
    expect(clientQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO album_artists"),
      [10, 1, "primary", 0, "Strokes, The", "discogs"],
    );
    expect(clientQuery).toHaveBeenCalledTimes(3);
  });
  it("replaces track credits within a friend's collection", async () => {
    await repo.replaceTrackCredits("t1", 6, [credit]);
    expect(clientQuery).toHaveBeenNthCalledWith(
      1,
      "DELETE FROM track_artists WHERE track_id = $1 AND friend_id = $2",
      ["t1", 6],
    );
    expect(clientQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO track_artists"),
      ["t1", 6, 1, "primary", 0, "Strokes, The", "discogs"],
    );
  });
  it("clears credits", async () => {
    await repo.replaceAlbumCredits(10, []);
    expect(clientQuery).toHaveBeenCalledTimes(1);
  });
  it("propagates insert failures so the transaction rolls back", async () => {
    clientQuery.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("invalid artist"));
    await expect(repo.replaceAlbumCredits(10, [credit])).rejects.toThrow("invalid artist");
  });
});

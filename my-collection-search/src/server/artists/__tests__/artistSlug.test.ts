import { beforeEach, describe, expect, it, vi } from "vitest";
import { freeArtistSlug, regenerateArtistSlug } from "../artistSlug";

const query = vi.fn();
const db = { query } as never;

beforeEach(() => query.mockReset());

describe("freeArtistSlug", () => {
  it("skips slugs held by other artists or their history", async () => {
    query.mockResolvedValueOnce({ rows: [{}] }).mockResolvedValueOnce({ rows: [] });
    expect(await freeArtistSlug(db, "Nirvana", 123)).toBe("nirvana-123");
    expect(query.mock.calls[0][1]).toEqual(["nirvana", null]);
    expect(query.mock.calls[1][1]).toEqual(["nirvana-123", null]);
  });
  it("excludes the artist itself", async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await freeArtistSlug(db, "Nirvana", undefined, 7)).toBe("nirvana");
    expect(query.mock.calls[0][1]).toEqual(["nirvana", 7]);
  });
});

describe("regenerateArtistSlug", () => {
  it("does nothing for a missing artist", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await regenerateArtistSlug(db, 1);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("does nothing when the slug is already right", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ name: "Nirvana", slug: "nirvana", discogs_artist_id: null }],
      })
      .mockResolvedValueOnce({ rows: [] });
    await regenerateArtistSlug(db, 1);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("keeps the old slug as a redirect and moves to the new one", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ name: "Nirvana", slug: "artist-abc", discogs_artist_id: null }],
      })
      .mockResolvedValue({ rows: [] });
    await regenerateArtistSlug(db, 1);
    const sql = query.mock.calls.map((c) => c[0] as string).join("\n");
    expect(sql).toContain("INSERT INTO artist_slug_history");
    expect(sql).toContain("DELETE FROM artist_slug_history");
    expect(query).toHaveBeenLastCalledWith("UPDATE artists SET slug = $2 WHERE id = $1", [
      1,
      "nirvana",
    ]);
  });
});

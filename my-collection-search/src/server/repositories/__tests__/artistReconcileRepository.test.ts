import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbQuery } = vi.hoisted(() => ({ dbQuery: vi.fn() }));
vi.mock("@/lib/serverDb", () => ({ dbQuery }));

import { ArtistReconcileRepository } from "../artistReconcileRepository";

const repo = new ArtistReconcileRepository();

beforeEach(() => dbQuery.mockReset());

describe("ArtistReconcileRepository", () => {
  it("lists album artist strings in scope", async () => {
    dbQuery.mockResolvedValue({ rows: [{ artist: "A" }, { artist: "B" }] });
    expect(await repo.listAlbumArtists(6)).toEqual(["A", "B"]);
    expect(dbQuery.mock.calls[0][1]).toEqual([6]);
  });

  it("lists only albums and tracks without credits", async () => {
    dbQuery.mockResolvedValue({ rows: [{ release_id: "1" }] });
    expect(await repo.listUncreditedAlbums(null)).toEqual([{ release_id: "1" }]);
    expect(dbQuery.mock.calls[0][0]).toContain("NOT EXISTS (SELECT 1 FROM album_artists");
    expect(dbQuery.mock.calls[0][1]).toEqual([null]);
    await repo.listUncreditedTracks(6);
    expect(dbQuery.mock.calls[1][0]).toContain("FROM track_artists ta");
    expect(dbQuery.mock.calls[1][1]).toEqual([6]);
  });

  it("counts legacy credits, scoping albums through their album row", async () => {
    dbQuery.mockResolvedValue({ rows: [{ credited_as: "A & B", count: 2 }] });
    expect(await repo.countLegacyCredits("album_artists", 6)).toEqual([
      { credited_as: "A & B", count: 2 },
    ]);
    expect(dbQuery.mock.calls[0][0]).toContain("JOIN albums a ON a.id = c.album_id");
    await repo.countLegacyCredits("track_artists", null);
    expect(dbQuery.mock.calls[1][0]).toContain("FROM track_artists c WHERE");
    expect(dbQuery.mock.calls[1][0]).toContain("c.source = 'legacy'");
  });

  it("lists unreviewed artists still filed under The X and updates them guarded", async () => {
    dbQuery.mockResolvedValue({ rows: [{ id: 66, name: "The Strokes" }], rowCount: 1 });
    expect(await repo.listUninvertedArtists()).toEqual([{ id: 66, name: "The Strokes" }]);
    expect(dbQuery.mock.calls[0][0]).toContain("NOT reviewed");
    expect(await repo.setSortName(66, "Strokes, The")).toBe(true);
    expect(dbQuery.mock.calls[1][0]).toContain("NOT reviewed AND sort_name = name");
    expect(dbQuery.mock.calls[1][1]).toEqual([66, "Strokes, The"]);
    dbQuery.mockResolvedValue({ rows: [], rowCount: null });
    expect(await repo.setSortName(66, "Strokes, The")).toBe(false);
  });

  it("lists known Discogs ids and aliases", async () => {
    dbQuery
      .mockResolvedValueOnce({ rows: [{ id: "194" }] })
      .mockResolvedValueOnce({ rows: [{ alias_normalized: "various", has_discogs_id: false }] });
    expect(await repo.listKnownArtists()).toEqual({
      discogsIds: ["194"],
      aliases: [{ alias_normalized: "various", has_discogs_id: false }],
    });
  });
});

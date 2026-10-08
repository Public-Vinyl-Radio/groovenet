import { beforeEach, describe, expect, it, vi } from "vitest";

const genreRepository = vi.hoisted(() => ({
  listFlat: vi.fn(),
  expandToFilter: vi.fn(),
  trackFacets: vi.fn(),
}));
const genrePageRepository = vi.hoisted(() => ({
  counts: vi.fn(),
  topTracks: vi.fn(),
  topAlbums: vi.fn(),
}));
vi.mock("@/server/repositories/genreRepository", () => ({ genreRepository }));
vi.mock("@/server/repositories/genrePageRepository", () => ({ genrePageRepository }));

import { getGenrePage } from "../genrePageService";
import { genrePageResponseSchema } from "@/api-contract/schemas";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (n: number, name: string, parent: number | null, aliases: string[] = []) => ({
  id: uuid(n),
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  parent_id: parent === null ? null : uuid(parent),
  source: "discogs" as const,
  track_count: 0,
  album_count: 0,
  aliases,
});

const flat = [
  row(1, "Latin", null),
  row(2, "Cumbia", 1, ["cumbia colombiana"]),
  row(3, "Psychedelic Cumbia", 2),
  row(4, "Chicha", 2),
  row(5, "Salsa", 1),
  row(6, "Bolero", 1),
  row(7, "Merengue", 1),
  row(8, "Rock", null),
];
const filter = { ids: [uuid(2), uuid(3), uuid(4)], keys: ["cumbia"] };

describe("getGenrePage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    genreRepository.listFlat.mockResolvedValue(flat);
    genreRepository.expandToFilter.mockResolvedValue(filter);
    genreRepository.trackFacets.mockResolvedValue([
      { id: uuid(2), track_count: 30 },
      { id: uuid(3), track_count: 20 },
      { id: uuid(4), track_count: 0 },
      { id: uuid(5), track_count: 12 },
      { id: uuid(6), track_count: 12 },
    ]);
    genrePageRepository.counts.mockResolvedValue({ tracks: 25, albums: 4, albums_total: 9 });
    genrePageRepository.topTracks.mockResolvedValue([{ track_id: "t1", play_count: 3, date_added: new Date("2026-01-02T00:00:00Z") }]);
    genrePageRepository.topAlbums.mockResolvedValue([{ release_id: "r1", play_count: 0, date_added: "2026-01-01" }]);
  });

  it("returns null for a genre that doesn't exist", async () => {
    expect(await getGenrePage("polka")).toBeNull();
    expect(genreRepository.expandToFilter).not.toHaveBeenCalled();
  });

  it("finds a genre by slug, in any case, or by id", async () => {
    expect((await getGenrePage(" Cumbia "))?.genre.id).toBe(uuid(2));
    expect((await getGenrePage(uuid(2)))?.genre.slug).toBe("cumbia");
  });

  it("assembles lineage, subgenres, related genres and counts", async () => {
    const page = await getGenrePage("psychedelic-cumbia");

    expect(page?.ancestors.map((a) => a.name)).toEqual(["Latin", "Cumbia"]);
    expect(page?.related.map((r) => r.name)).toEqual([]);
    expect(page?.counts).toEqual({ tracks: 25, albums: 4, albums_total: 9, tracks_total: 20 });
  });

  it("orders subgenres biggest first, keeping empty ones, and relates only siblings the collection uses", async () => {
    const page = await getGenrePage("cumbia");

    expect(page?.children).toEqual([
      { id: uuid(3), name: "Psychedelic Cumbia", slug: "psychedelic-cumbia", track_count: 20 },
      { id: uuid(4), name: "Chicha", slug: "chicha", track_count: 0 },
    ]);
    // Merengue has no tracks; Bolero and Salsa tie and fall back to their names.
    expect(page?.related.map((r) => r.name)).toEqual(["Bolero", "Salsa"]);
    expect(page?.genre.aliases).toEqual(["cumbia colombiana"]);
  });

  it("matches the genre's own name and aliases for its Discogs count, and the whole filter elsewhere", async () => {
    await getGenrePage("cumbia", 6);

    expect(genreRepository.expandToFilter).toHaveBeenCalledWith([uuid(2)]);
    expect(genrePageRepository.counts).toHaveBeenCalledWith({
      genreId: uuid(2),
      ownKeys: ["cumbia", "cumbia colombiana"],
      filter,
      friendId: 6,
    });
    expect(genrePageRepository.topTracks).toHaveBeenCalledWith(filter, 6, 10);
    expect(genrePageRepository.topAlbums).toHaveBeenCalledWith(filter, 6, 8);
  });

  it("scopes the subgenre counts to a collection only when given one", async () => {
    await getGenrePage("cumbia", 6);
    expect(genreRepository.trackFacets).toHaveBeenLastCalledWith(["t.friend_id = $1"], [6]);

    await getGenrePage("cumbia");
    expect(genreRepository.trackFacets).toHaveBeenLastCalledWith([], []);
  });

  it("serialises dates the way JSON would, leaving other values alone", async () => {
    const page = await getGenrePage("cumbia");

    expect(page?.top_tracks[0]).toMatchObject({ track_id: "t1", date_added: "2026-01-02T00:00:00.000Z" });
    expect(page?.top_albums[0]).toMatchObject({ release_id: "r1", date_added: "2026-01-01" });
  });

  it("validates a genre page when top albums have nullable database fields", async () => {
    genrePageRepository.topTracks.mockResolvedValue([{
      track_id: "t1",
      friend_id: 6,
      title: "Track",
      artist: "Artist",
      album: "Album",
      play_count: 0,
      date_added: null,
    }]);
    genrePageRepository.topAlbums.mockResolvedValue([{
      release_id: "r1",
      friend_id: 6,
      title: "Album",
      artist: "Artist",
      year: null,
      genres: null,
      styles: null,
      album_thumbnail: null,
      date_added: null,
      date_changed: null,
      track_count: 1,
      album_rating: null,
      album_notes: null,
      purchase_price: null,
      condition: null,
      play_count: 0,
    }]);

    const page = await getGenrePage("cumbia", 6);
    expect(() => genrePageResponseSchema.parse(page)).not.toThrow();
  });

  it("counts a genre the collection doesn't use as zero", async () => {
    genreRepository.trackFacets.mockResolvedValue([]);
    const page = await getGenrePage("rock");

    expect(page?.counts.tracks_total).toBe(0);
    expect(page?.ancestors).toEqual([]);
    expect(page?.related).toEqual([]);
  });
});

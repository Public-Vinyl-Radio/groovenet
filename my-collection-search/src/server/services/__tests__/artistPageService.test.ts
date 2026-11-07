import { beforeEach, describe, expect, it, vi } from "vitest";

const artists = vi.hoisted(() => ({ findBySlug: vi.fn(), listAliases: vi.fn() }));
const page = vi.hoisted(() => ({
  counts: vi.fn(),
  albums: vi.fn(),
  topTracks: vi.fn(),
  genres: vi.fn(),
  collaborators: vi.fn(),
}));
vi.mock("@/server/repositories/artistRepository", () => ({ artistRepository: artists }));
vi.mock("@/server/repositories/artistPageRepository", () => ({ artistPageRepository: page }));

import { getArtistPage } from "../artistPageService";

const artist = {
  id: 4,
  name: "Los Mirlos",
  sort_name: "Mirlos, Los",
  slug: "los-mirlos",
  discogs_artist_id: "77",
  is_placeholder: false,
};
const counts = { albums: 1, appears_on: 0, tracks: 2, spins: 0, year_min: 1970, year_max: 1970 };

describe("getArtistPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    artists.findBySlug.mockResolvedValue(artist);
    artists.listAliases.mockResolvedValue([
      { alias: "Los Mirlos", alias_normalized: "los mirlos" },
      { alias: "Mirlos", alias_normalized: "mirlos" },
      { alias: "The Mirlos", alias_normalized: "the mirlos x" },
    ]);
    page.counts.mockResolvedValue(counts);
    page.albums.mockResolvedValue([
      { release_id: "1", date_added: new Date("2026-01-02T00:00:00Z") },
    ]);
    page.topTracks.mockResolvedValue([]);
    page.genres.mockResolvedValue([]);
    page.collaborators.mockResolvedValue([]);
  });

  it("is null for an unknown artist", async () => {
    artists.findBySlug.mockResolvedValue(null);
    await expect(getArtistPage("nobody")).resolves.toBeNull();
  });

  it("assembles the page, hiding the canonical spelling from the aliases", async () => {
    const result = await getArtistPage(" Los-Mirlos ", 6);
    expect(artists.findBySlug).toHaveBeenCalledWith("los-mirlos");
    expect(page.counts).toHaveBeenCalledWith(4, 6);
    expect(result?.aliases).toEqual(["Mirlos", "The Mirlos"]);
    expect(result?.albums[0]).toMatchObject({ date_added: "2026-01-02T00:00:00.000Z" });
    expect(result?.top_tracks_by).toBe("albums");
  });

  it("ranks by spins once anything was played", async () => {
    page.counts.mockResolvedValue({ ...counts, spins: 3 });
    expect((await getArtistPage("los-mirlos"))?.top_tracks_by).toBe("spins");
  });

  it("returns a flagged, empty page for a placeholder without querying lists", async () => {
    artists.findBySlug.mockResolvedValue({ ...artist, name: "Various", is_placeholder: true });
    const result = await getArtistPage("various");
    expect(result?.artist.is_placeholder).toBe(true);
    expect(result?.albums).toEqual([]);
    expect(page.counts).not.toHaveBeenCalled();
  });
});

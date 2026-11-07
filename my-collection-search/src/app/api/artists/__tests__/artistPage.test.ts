import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getArtistPage = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/artistPageService", () => ({ getArtistPage }));

import { GET } from "../[slug]/route";

const call = (query = "") =>
  GET(new NextRequest(`http://localhost/api/artists/los-mirlos${query}`), {
    params: Promise.resolve({ slug: "los-mirlos" }),
  });

const page = {
  artist: {
    id: 4,
    name: "Los Mirlos",
    sort_name: "Mirlos, Los",
    slug: "los-mirlos",
    discogs_artist_id: null,
    is_placeholder: false,
  },
  aliases: [],
  counts: { albums: 0, appears_on: 0, tracks: 0, spins: 0, year_min: null, year_max: null },
  albums: [],
  top_tracks: [],
  top_tracks_by: "albums",
  genres: [],
  collaborators: [],
};

describe("GET /api/artists/[slug]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns the page scoped to the friend", async () => {
    getArtistPage.mockResolvedValue(page);
    const response = await call("?friend_id=6");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(page);
    expect(getArtistPage).toHaveBeenCalledWith("los-mirlos", 6);
  });

  it("is 400 for a bad friend id", async () => {
    expect((await call("?friend_id=abc")).status).toBe(400);
    expect(getArtistPage).not.toHaveBeenCalled();
  });

  it("is 404 for an unknown artist", async () => {
    getArtistPage.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it("is 500 when the read fails", async () => {
    getArtistPage.mockRejectedValue(new Error("db"));
    expect((await call()).status).toBe(500);
  });
});

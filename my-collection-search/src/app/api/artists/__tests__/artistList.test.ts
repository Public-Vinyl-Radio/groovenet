import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const listArtists = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/artistListService", () => ({ listArtists }));

import { GET } from "../route";

const call = (query = "") => GET(new NextRequest(`http://localhost/api/artists${query}`));
const page = {
  items: [
    {
      id: 4,
      name: "Los Mirlos",
      sort_name: "Mirlos, Los",
      slug: "los-mirlos",
      discogs_artist_id: null,
      is_placeholder: false,
      album_count: 1,
      track_count: 2,
    },
  ],
  total: 1,
  limit: 50,
  offset: 0,
  query: "mirlos",
};

describe("GET /api/artists", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("applies defaults", async () => {
    listArtists.mockResolvedValue({ ...page, query: "" });
    expect((await call()).status).toBe(200);
    expect(listArtists).toHaveBeenCalledWith({
      q: "",
      include_placeholders: false,
      limit: 50,
      offset: 0,
    });
  });

  it("coerces the query string", async () => {
    listArtists.mockResolvedValue(page);
    const response = await call(
      "?q=%20mirlos%20&friend_id=6&include_placeholders=true&limit=10&offset=20",
    );
    expect(await response.json()).toEqual(page);
    expect(listArtists).toHaveBeenCalledWith({
      q: "mirlos",
      friend_id: 6,
      include_placeholders: true,
      limit: 10,
      offset: 20,
    });
  });

  it("is 400 for a bad limit", async () => {
    expect((await call("?limit=0")).status).toBe(400);
    expect((await call("?limit=500")).status).toBe(400);
    expect(listArtists).not.toHaveBeenCalled();
  });

  it("is 500 when the read fails", async () => {
    listArtists.mockRejectedValue(new Error("db"));
    expect((await call()).status).toBe(500);
  });

  it("reads the index letter case-insensitively, and refuses anything else (#709)", async () => {
    listArtists.mockResolvedValue({ ...page, query: "" });
    expect((await call("?letter=m")).status).toBe(200);
    expect(listArtists).toHaveBeenCalledWith(expect.objectContaining({ letter: "M" }));
    expect((await call("?letter=%23")).status).toBe(200);
    expect(listArtists).toHaveBeenLastCalledWith(expect.objectContaining({ letter: "#" }));
    expect((await call("?letter=mm")).status).toBe(400);
  });
});

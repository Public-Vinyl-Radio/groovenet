import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const trackFacets = vi.hoisted(() => vi.fn());
vi.mock("@/server/repositories/genreRepository", () => ({ genreRepository: { trackFacets } }));

import { GET } from "../route";

function req(query = "") {
  return new NextRequest(`http://localhost/api/tracks/search/facets${query}`);
}

describe("GET /api/tracks/search/facets", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    trackFacets.mockResolvedValue([{ id: "id-latin", track_count: 4 }]);
  });

  it("counts over the search's filters and words, ignoring genre and paging", async () => {
    const res = await GET(
      req("?q=dub&friend_id=6&bpm_min=100&filter=local_audio_url%20IS%20NULL&genre=latin&limit=5&offset=10")
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ genres: [{ id: "id-latin", track_count: 4 }] });
    const [where, params] = trackFacets.mock.calls[0];
    expect(where[0]).toBe("local_audio_url IS NULL");
    expect(where[1]).toBe("friend_id = $1");
    expect(where[2]).toBe("t.bpm >= $2");
    expect(where[3]).toContain("plainto_tsquery('simple', $3)");
    expect(where.join(" ")).not.toContain("track_genres");
    expect(params).toEqual([6, 100, "dub"]);
  });

  it("lists every track without words, in any mode", async () => {
    const res = await GET(req("?mode=semantic&friend_id=6"));
    expect(res.status).toBe(200);
    expect(trackFacets).toHaveBeenCalledWith(["friend_id = $1"], [6]);
  });

  it("refuses semantic or hybrid words, which a count can't describe", async () => {
    const res = await GET(req("?mode=hybrid&q=dusty%20cumbia"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("keyword search");
    expect(trackFacets).not.toHaveBeenCalled();
  });

  it.each([["?star_rating=9"], ["?bpm_min=130&bpm_max=120"]])("rejects %s", async (query) => {
    const res = await GET(req(query));
    expect(res.status).toBe(400);
    expect(trackFacets).not.toHaveBeenCalled();
  });

  it("returns 500 when counting fails", async () => {
    trackFacets.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("boom");
  });

  it("names a generic error for a non-Error throw", async () => {
    trackFacets.mockRejectedValue("nope");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await (await GET(req())).json()).error).toBe("Genre facets failed");
  });
});

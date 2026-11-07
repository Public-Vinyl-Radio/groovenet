import { describe, expect, it, vi } from "vitest";

const httpMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/http", () => ({ http: httpMock }));

import { fetchArtistPage } from "./artists";

describe("fetchArtistPage", () => {
  it("requests an artist's page, scoped to a friend when given one", async () => {
    httpMock.mockResolvedValue({ artist: { slug: "a&b" } });

    await expect(fetchArtistPage("a&b", 6)).resolves.toEqual({ artist: { slug: "a&b" } });
    expect(httpMock).toHaveBeenLastCalledWith("/api/artists/a%26b?friend_id=6");

    await fetchArtistPage("los-mirlos");
    expect(httpMock).toHaveBeenLastCalledWith("/api/artists/los-mirlos");
  });
});

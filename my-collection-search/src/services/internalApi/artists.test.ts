import { describe, expect, it, vi } from "vitest";

const httpMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/http", () => ({ http: httpMock }));

import { fetchArtistLetters, fetchArtistPage, listArtists } from "./artists";

describe("fetchArtistPage", () => {
  it("requests an artist's page, scoped to a friend when given one", async () => {
    httpMock.mockResolvedValue({ artist: { slug: "a&b" } });

    await expect(fetchArtistPage("a&b", 6)).resolves.toEqual({ artist: { slug: "a&b" } });
    expect(httpMock).toHaveBeenLastCalledWith("/api/artists/a%26b?friend_id=6");

    await fetchArtistPage("los-mirlos");
    expect(httpMock).toHaveBeenLastCalledWith("/api/artists/los-mirlos");
  });
});

describe("listArtists (#709)", () => {
  it("asks for the whole list without parameters", async () => {
    httpMock.mockResolvedValue({ items: [] });
    await listArtists();
    expect(httpMock).toHaveBeenLastCalledWith("/api/artists");
  });

  it("sends the words, letter, collection and paging it is given", async () => {
    await listArtists({ q: "mir los", letter: "#", friend_id: 6, limit: 100, offset: 200 });
    const path = String(httpMock.mock.calls.at(-1)![0]);
    const params = new URLSearchParams(path.split("?")[1]);
    expect(path.startsWith("/api/artists?")).toBe(true);
    expect(Object.fromEntries(params)).toEqual({
      q: "mir los",
      letter: "#",
      friend_id: "6",
      limit: "100",
      offset: "200",
    });
    // The first page sends no offset.
    await listArtists({ q: "x", offset: 0 });
    expect(httpMock).toHaveBeenLastCalledWith("/api/artists?q=x");
  });
});

describe("fetchArtistLetters (#1116)", () => {
  it("asks for the letter counts, scoped to a friend when given one", async () => {
    httpMock.mockResolvedValue({ letters: [], total: 0 });
    await fetchArtistLetters();
    expect(httpMock).toHaveBeenLastCalledWith("/api/artists/letters");
    await fetchArtistLetters(6);
    expect(httpMock).toHaveBeenLastCalledWith("/api/artists/letters?friend_id=6");
  });
});

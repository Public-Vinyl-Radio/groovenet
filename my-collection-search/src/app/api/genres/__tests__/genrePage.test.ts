import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getGenrePage = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/genrePageService", () => ({ getGenrePage }));

import { GET } from "../[id]/route";

const call = (ref: string, query = "") =>
  GET(new NextRequest(`http://localhost/api/genres/${ref}${query}`), { params: Promise.resolve({ id: ref }) });

const page = {
  genre: {
    id: "8c1d7f3e-2b6a-4d59-9f0e-3a7b5c2d1e40",
    name: "Cumbia",
    slug: "cumbia",
    parent_id: null,
    source: "discogs",
    aliases: [],
  },
  ancestors: [],
  children: [],
  related: [],
  counts: { tracks: 1, albums: 0, tracks_total: 1, albums_total: 0 },
  top_tracks: [{ track_id: "t1", friend_id: 6, title: "T", artist: "A", album: "B", play_count: 2 }],
  top_albums: [],
};

describe("GET /api/genres/{id}", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns the genre page, scoped to the friend", async () => {
    getGenrePage.mockResolvedValue(page);
    const response = await call("cumbia", "?friend_id=6");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(page);
    expect(getGenrePage).toHaveBeenCalledWith("cumbia", 6);
  });

  it("reads every collection without a friend", async () => {
    getGenrePage.mockResolvedValue(page);
    await call("cumbia");
    expect(getGenrePage).toHaveBeenCalledWith("cumbia", undefined);
  });

  it("404s an unknown genre", async () => {
    getGenrePage.mockResolvedValue(null);
    const response = await call("polka");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Unknown genre: polka" });
  });

  it("400s a friend_id that isn't a number, without loading anything", async () => {
    const response = await call("cumbia", "?friend_id=abc");

    expect(response.status).toBe(400);
    expect(getGenrePage).not.toHaveBeenCalled();
  });

  it("500s when the page fails to load", async () => {
    getGenrePage.mockRejectedValue(new Error("db down"));
    const response = await call("cumbia");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to load genre" });
  });
});

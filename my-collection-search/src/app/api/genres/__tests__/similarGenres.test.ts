import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getGenreSimilarPage = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/genreSimilarityService", () => ({ getGenreSimilarPage }));

import { GET } from "../[id]/similar/route";

const call = (ref: string) =>
  GET(new NextRequest(`http://localhost/api/genres/${ref}/similar`), { params: Promise.resolve({ id: ref }) });

const page = {
  genre: { id: "8c1d7f3e-2b6a-4d59-9f0e-3a7b5c2d1e40", name: "Cumbia", slug: "cumbia", track_count: 412 },
  related: [{
    id: "1f6a2c9d-4e8b-4a3f-b7d1-5c0e9a8b7f62", name: "Salsa", slug: "salsa", track_count: 253,
    score: 1.42, signals: { taxonomy: "sibling", npmi: 0.42, shared_albums: 7 },
  }],
};

describe("GET /api/genres/{id}/similar", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns the ranked similar genres", async () => {
    getGenreSimilarPage.mockResolvedValue(page);
    const response = await call("cumbia");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(page);
    expect(getGenreSimilarPage).toHaveBeenCalledWith("cumbia");
  });

  it("404s an unknown genre", async () => {
    getGenreSimilarPage.mockResolvedValue(null);
    const response = await call("polka");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Unknown genre: polka" });
  });

  it("500s when the page fails to load", async () => {
    getGenreSimilarPage.mockRejectedValue(new Error("db down"));
    const response = await call("cumbia");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to load similar genres" });
  });
});

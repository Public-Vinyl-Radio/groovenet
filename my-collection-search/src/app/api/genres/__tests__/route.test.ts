import { beforeEach, describe, expect, it, vi } from "vitest";

const listTree = vi.hoisted(() => vi.fn());
vi.mock("@/server/repositories/genreRepository", () => ({
  genreRepository: { listTree },
}));

import { GET } from "../route";

describe("GET /api/genres", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the canonical taxonomy tree", async () => {
    listTree.mockResolvedValue([
      {
        id: "6df3a956-f05c-4ef2-a218-0813d0ca7c47",
        name: "Latin",
        slug: "latin",
        parent_id: null,
        source: "discogs",
        track_count: 0,
        album_count: 0,
        children: [],
      },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      genres: [expect.objectContaining({ name: "Latin", children: [] })],
    });
  });

  it("returns a generic error when taxonomy loading fails", async () => {
    listTree.mockRejectedValue(new Error("database unavailable"));

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to list genre taxonomy" });
  });
});

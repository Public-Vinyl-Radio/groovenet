import { describe, expect, it, vi } from "vitest";

const httpMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/http", () => ({ http: httpMock }));

import { fetchGenrePage, fetchGenreTree } from "./genres";

describe("fetchGenreTree", () => {
  it("unwraps the taxonomy tree from the response", async () => {
    const tree = [{ id: "latin", name: "Latin", children: [] }];
    httpMock.mockResolvedValue({ genres: tree });

    await expect(fetchGenreTree()).resolves.toBe(tree);
    expect(httpMock).toHaveBeenCalledWith("/api/genres");
  });
});

describe("fetchGenrePage", () => {
  it("requests a genre's page, scoped to a friend when given one", async () => {
    httpMock.mockResolvedValue({ genre: { slug: "r&b" } });

    await expect(fetchGenrePage("r&b", 6)).resolves.toEqual({ genre: { slug: "r&b" } });
    expect(httpMock).toHaveBeenLastCalledWith("/api/genres/r%26b?friend_id=6");

    await fetchGenrePage("cumbia");
    expect(httpMock).toHaveBeenLastCalledWith("/api/genres/cumbia");
  });
});

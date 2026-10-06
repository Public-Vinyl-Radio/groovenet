import { describe, expect, it, vi } from "vitest";

const httpMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/http", () => ({ http: httpMock }));

import { fetchGenreTree } from "./genres";

describe("fetchGenreTree", () => {
  it("unwraps the taxonomy tree from the response", async () => {
    const tree = [{ id: "latin", name: "Latin", children: [] }];
    httpMock.mockResolvedValue({ genres: tree });

    await expect(fetchGenreTree()).resolves.toBe(tree);
    expect(httpMock).toHaveBeenCalledWith("/api/genres");
  });
});

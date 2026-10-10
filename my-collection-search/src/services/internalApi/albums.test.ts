import { beforeEach, describe, expect, it, vi } from "vitest";

const httpMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/http", () => ({ http: httpMock }));

import { searchAlbums } from "./albums";

describe("searchAlbums", () => {
  beforeEach(() => httpMock.mockReset().mockResolvedValue({ hits: [] }));

  it("repeats genre for each slug (#375)", async () => {
    await searchAlbums({ q: "blue", friend_id: 6, genre: ["latin", "jazz"] });
    const params = new URLSearchParams(String(httpMock.mock.calls[0][0]).split("?")[1]);
    expect(params.get("q")).toBe("blue");
    expect(params.getAll("genre")).toEqual(["latin", "jazz"]);
  });

  it("sends no genre without one", async () => {
    await searchAlbums({});
    expect(httpMock.mock.calls[0][0]).toBe("/api/albums");
  });

  it("sends include_similar, similar_limit and similar_exclude when set (#485)", async () => {
    await searchAlbums({
      genre: ["cumbia"],
      include_similar: true,
      similar_limit: 3,
      similar_exclude: ["id-porro", "id-chicha"],
    });
    const params = new URLSearchParams(String(httpMock.mock.calls[0][0]).split("?")[1]);
    expect(params.get("include_similar")).toBe("1");
    expect(params.get("similar_limit")).toBe("3");
    expect(params.getAll("similar_exclude")).toEqual(["id-porro", "id-chicha"]);
  });

  it("omits include_similar, similar_limit and similar_exclude when unset", async () => {
    await searchAlbums({ genre: ["cumbia"] });
    const params = new URLSearchParams(String(httpMock.mock.calls[0][0]).split("?")[1]);
    expect(params.has("include_similar")).toBe(false);
    expect(params.has("similar_limit")).toBe(false);
    expect(params.has("similar_exclude")).toBe(false);
  });
});

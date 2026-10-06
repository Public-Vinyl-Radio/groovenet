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
});

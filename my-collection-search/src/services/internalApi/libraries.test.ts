import { beforeEach, describe, expect, it, vi } from "vitest";

const httpMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/http", () => ({ http: httpMock, streamLines: vi.fn() }));

import { lookupDiscogsUser } from "./discogs";
import { fetchLibraries } from "./friends";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("fetchLibraries", () => {
  it("reads every library with its stats, uncached", async () => {
    const body = { results: [], account_username: null };
    httpMock.mockResolvedValue(body);
    await expect(fetchLibraries()).resolves.toBe(body);
    expect(httpMock).toHaveBeenCalledWith("/api/friends/libraries", {
      method: "GET",
      cache: "no-store",
    });
  });
});

describe("lookupDiscogsUser", () => {
  it("looks a username up, encoding it into the path", async () => {
    const body = { username: "dj friend", found: false };
    httpMock.mockResolvedValue(body);
    await expect(lookupDiscogsUser("dj friend")).resolves.toBe(body);
    expect(httpMock).toHaveBeenCalledWith("/api/discogs/users/dj%20friend", {
      method: "GET",
      cache: "no-store",
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => vi.fn());
vi.mock("@/services/http", () => ({ http: (...a: unknown[]) => http(...a) }));

import { lookupDiscogsUser } from "../discogsApiClient";

describe("lookupDiscogsUser()", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reads the release count from the user's All folder", async () => {
    http.mockResolvedValue({ id: 0, name: "All", count: 412 });
    await expect(lookupDiscogsUser("dj friend")).resolves.toEqual({
      found: true,
      releaseCount: 412,
    });
    expect(http.mock.calls[0][0]).toBe(
      "https://api.discogs.com/users/dj%20friend/collection/folders/0",
    );
  });

  it("counts a folder without a count as empty", async () => {
    http.mockResolvedValue({});
    await expect(lookupDiscogsUser("dj")).resolves.toEqual({ found: true, releaseCount: 0 });
  });

  it.each([404, 403])("treats a %i as not found", async (status) => {
    http.mockImplementation(async () => {
      throw Object.assign(new Error(`HTTP ${status}`), { status });
    });
    expect(await lookupDiscogsUser("dj")).toEqual({ found: false });
  });

  it("rethrows any other failure", async () => {
    http.mockImplementation(async () => {
      throw Object.assign(new Error("HTTP 500"), { status: 500 });
    });
    await expect(lookupDiscogsUser("dj")).rejects.toThrow("HTTP 500");
  });
});

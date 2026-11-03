import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lookupDiscogsUser = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/discogsApiClient", () => ({ lookupDiscogsUser }));

import { GET } from "../route";

const get = (username: string) =>
  GET(new Request(`http://localhost/api/discogs/users/${username}`), {
    params: Promise.resolve({ username }),
  });

describe("GET /api/discogs/users/{username}", () => {
  beforeEach(() => {
    lookupDiscogsUser.mockReset();
    process.env.DISCOGS_USER_TOKEN = "token";
  });
  afterEach(() => {
    delete process.env.DISCOGS_USER_TOKEN;
  });

  it("returns a found user with their collection's release count", async () => {
    lookupDiscogsUser.mockResolvedValue({ found: true, releaseCount: 1233 });
    const res = await get("dj.friend");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ username: "dj.friend", found: true, release_count: 1233 });
    expect(lookupDiscogsUser).toHaveBeenCalledWith("dj.friend");
  });

  it("answers 200 not found when Discogs has no such user", async () => {
    lookupDiscogsUser.mockResolvedValue({ found: false });
    const res = await get("collectr-5");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ username: "collectr-5", found: false });
  });

  it("reports any other Discogs failure as a 502", async () => {
    lookupDiscogsUser.mockRejectedValue(new Error("HTTP 429"));
    const res = await get("dj");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Discogs lookup failed: HTTP 429" });
  });

  it("reports a non-Error failure as a 502 too", async () => {
    lookupDiscogsUser.mockRejectedValue("socket hang up");
    const res = await get("dj");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Discogs lookup failed: socket hang up" });
  });

  it.each(["bad name", "a/b", "x".repeat(101)])(
    "rejects %s without calling Discogs",
    async (name) => {
      const res = await get(name);
      expect(res.status).toBe(400);
      expect(lookupDiscogsUser).not.toHaveBeenCalled();
    },
  );

  it("is a 500 when the server has no Discogs token", async () => {
    delete process.env.DISCOGS_USER_TOKEN;
    const res = await get("dj");
    expect(res.status).toBe(500);
    expect(lookupDiscogsUser).not.toHaveBeenCalled();
  });
});

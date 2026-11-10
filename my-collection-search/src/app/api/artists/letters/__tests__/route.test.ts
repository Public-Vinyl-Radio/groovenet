import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const listArtistLetters = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/artistListService", () => ({ listArtistLetters }));

import { GET } from "../route";

const call = (query = "") => GET(new NextRequest(`http://localhost/api/artists/letters${query}`));
const counts = {
  letters: [
    { letter: "A", count: 2 },
    { letter: "#", count: 1 },
  ],
  total: 3,
};

describe("GET /api/artists/letters", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("counts every artist by default", async () => {
    listArtistLetters.mockResolvedValue(counts);
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(counts);
    expect(listArtistLetters).toHaveBeenCalledWith({ include_placeholders: false });
  });

  it("scopes to a friend", async () => {
    listArtistLetters.mockResolvedValue(counts);
    await call("?friend_id=6&include_placeholders=true");
    expect(listArtistLetters).toHaveBeenCalledWith({ friend_id: 6, include_placeholders: true });
  });

  it("rejects a bad friend and reports failures", async () => {
    expect((await call("?friend_id=x")).status).toBe(400);
    listArtistLetters.mockRejectedValue(new Error("db"));
    expect((await call()).status).toBe(500);
  });
});

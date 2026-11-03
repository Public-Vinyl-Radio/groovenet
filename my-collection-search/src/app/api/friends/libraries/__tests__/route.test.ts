import { beforeEach, describe, expect, it, vi } from "vitest";

const listLibraries = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/friendService", () => ({ friendService: { listLibraries } }));

import { GET } from "../route";

describe("GET /api/friends/libraries", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lists libraries with their stats and the account", async () => {
    const body = {
      account_username: "owner",
      results: [
        { id: 1, username: "owner", is_account: true, release_count: 4, last_synced_at: null },
      ],
    };
    listLibraries.mockResolvedValue(body);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(body);
  });

  it.each([new Error("db down"), "db down"])("returns 500 when listing fails (%s)", async (err) => {
    listLibraries.mockRejectedValue(err);
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "db down" });
  });
});

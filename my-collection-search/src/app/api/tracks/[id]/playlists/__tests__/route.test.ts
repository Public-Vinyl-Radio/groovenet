import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listPlaylistsForTrack = vi.fn();
vi.mock("@/server/auth/viewer", async () => (await import("@/test/viewerMock")).viewerMock);
vi.mock("@/server/repositories/trackRepository", () => ({
  trackRepository: { listPlaylistsForTrack: (...a: unknown[]) => listPlaylistsForTrack(...a) },
}));

import { GET } from "../route";

const call = (query: string) =>
  GET(new NextRequest(`http://localhost/api/tracks/t1/playlists${query}`), {
    params: Promise.resolve({ id: "t1" }),
  });

describe("GET /api/tracks/[id]/playlists", () => {
  beforeEach(() => {
    listPlaylistsForTrack.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns the playlists the track is in", async () => {
    listPlaylistsForTrack.mockResolvedValue([{ id: 1, name: "Warmup", position: 3 }]);
    const res = await call("?friend_id=2");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ playlists: [{ id: 1, name: "Warmup", position: 3 }] });
    expect(listPlaylistsForTrack).toHaveBeenCalledWith(
      "t1",
      2,
      "00000000-0000-4000-8000-000000000001",
    );
  });

  it("validates friend_id", async () => {
    expect((await call("")).status).toBe(400);
    expect((await call("?friend_id=x")).status).toBe(400);
  });

  it("returns 500 when the repository fails", async () => {
    listPlaylistsForTrack.mockRejectedValue(new Error("db"));
    expect((await call("?friend_id=2")).status).toBe(500);
  });
});

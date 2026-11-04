import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const manifest = vi.hoisted(() => ({ getReleasePath: vi.fn(), loadAlbum: vi.fn() }));
vi.mock("@/server/services/discogsManifestService", () => manifest);

const repo = vi.hoisted(() => ({ getFriendUsernameById: vi.fn() }));
vi.mock("@/server/repositories/albumRepository", () => ({ albumRepository: repo }));

import { albumDiscogsRawResponseSchema } from "@/api-contract/schemas";
import { GET } from "../route";

const params = { params: Promise.resolve({ releaseId: "r1" }) };
const get = (query = "?friend_id=7") =>
  GET(new NextRequest(`http://localhost/api/albums/r1/discogs-raw${query}`), params);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/albums/[releaseId]/discogs-raw", () => {
  it("returns the stored release payload", async () => {
    repo.getFriendUsernameById.mockResolvedValue("dj");
    manifest.getReleasePath.mockReturnValue("/data/dj/r1.json");
    manifest.loadAlbum.mockReturnValue({ id: 1, title: "T" });

    const res = await get();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(albumDiscogsRawResponseSchema.parse(body)).toEqual({
      friend_id: 7,
      release_id: "r1",
      username: "dj",
      file_path: "/data/dj/r1.json",
      data: { id: 1, title: "T" },
    });
  });

  it.each(["", "?friend_id=abc", "?friend_id=0"])("rejects friend_id %j", async (query) => {
    const res = await get(query);
    expect(res.status).toBe(400);
    expect(repo.getFriendUsernameById).not.toHaveBeenCalled();
  });

  it("404s for an unknown friend and for a missing release file", async () => {
    repo.getFriendUsernameById.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(404);

    repo.getFriendUsernameById.mockResolvedValue("dj");
    manifest.getReleasePath.mockReturnValue(null);
    expect((await get()).status).toBe(404);
  });

  it("500s when the release file does not parse", async () => {
    repo.getFriendUsernameById.mockResolvedValue("dj");
    manifest.getReleasePath.mockReturnValue("/data/dj/r1.json");
    manifest.loadAlbum.mockReturnValue(null);
    expect((await get()).status).toBe(500);
  });

  it("500s when the lookup throws", async () => {
    repo.getFriendUsernameById.mockRejectedValue(new Error("db down"));
    const res = await get();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "db down" });
  });
});

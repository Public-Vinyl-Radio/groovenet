import { beforeEach, describe, expect, it, vi } from "vitest";

const dbQuery = vi.hoisted(() => vi.fn());
const albumRepository = vi.hoisted(() => ({
  getFriendUsernamesByIds: vi.fn(),
  getFirstAudioCoverByAlbumRefs: vi.fn(),
}));

vi.mock("@/lib/serverDb", () => ({ dbQuery }));
vi.mock("@/server/repositories/albumRepository", () => ({ albumRepository }));

import { AlbumApiService } from "../albumApiService";

describe("AlbumApiService.searchAlbums", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    albumRepository.getFriendUsernamesByIds.mockResolvedValue(new Map());
    albumRepository.getFirstAudioCoverByAlbumRefs.mockResolvedValue(new Map());
  });

  it("sorts recently added albums by their Groovenet creation time", async () => {
    dbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: "0" }] });

    await new AlbumApiService().searchAlbums({
      q: "",
      limit: 20,
      offset: 0,
      sort: "created_at:desc",
    });

    const [sql] = dbQuery.mock.calls[0];
    expect(sql).toContain("created_at DESC, release_id DESC, friend_id DESC");
  });

  it("binds a genre filter into the query and its count (#375)", async () => {
    dbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: "0" }] });
    const genreFilter = { ids: ["id-latin"], keys: ["latin"] };

    await new AlbumApiService().searchAlbums({
      q: "",
      limit: 20,
      offset: 0,
      friendId: "6",
      sort: "created_at:desc",
      genreFilter,
    });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("unnest(COALESCE(a.genres, '{}') || COALESCE(a.styles, '{}'))");
    expect(sql).toContain("tg.genre_id = ANY($3::uuid[])");
    expect(params).toEqual([6, ["latin"], ["id-latin"], 20, 0]);
    expect(dbQuery.mock.calls[1][1]).toEqual([6, ["latin"], ["id-latin"]]);
  });
});

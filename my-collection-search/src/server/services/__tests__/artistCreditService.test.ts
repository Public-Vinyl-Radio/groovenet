import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ forAlbums: vi.fn(), forTracks: vi.fn() }));
vi.mock("@/server/repositories/artistCreditRepository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/repositories/artistCreditRepository")>()),
  artistCreditRepository: repo,
}));

import { withArtistCredits } from "../artistCreditService";

const ref = (slug: string) => ({
  id: 1,
  name: slug,
  slug,
  is_placeholder: false,
  role: "primary" as const,
  position: 0,
  credited_as: slug,
});

describe("withArtistCredits", () => {
  beforeEach(() => vi.resetAllMocks());

  it("gives tracks their own credits, else their album's, else none", async () => {
    repo.forAlbums.mockResolvedValue(new Map([["6:r1", [ref("various")]]]));
    repo.forTracks.mockResolvedValue(new Map([["6:t1", [ref("los-mirlos")]]]));
    const out = await withArtistCredits(
      [{ release_id: "r1", friend_id: 6 }],
      [
        { track_id: "t1", friend_id: 6, release_id: "r1" },
        { track_id: "t2", friend_id: 6, release_id: "r1" },
        { track_id: "t3", friend_id: 6, release_id: null },
        { track_id: "t4", friend_id: 6, release_id: "r9" },
      ],
    );
    expect(out.albums[0].artists).toEqual([ref("various")]);
    expect(out.tracks.map((t) => t.artists.map((a) => a.slug))).toEqual([
      ["los-mirlos"],
      ["various"],
      [],
      [],
    ]);
    // The album is asked for once, whether it came as the album or a track's release.
    expect(repo.forAlbums).toHaveBeenCalledWith([
      { id: "r1", friend_id: 6 },
      { id: "r9", friend_id: 6 },
    ]);
  });

  it("leaves an album with no credits empty", async () => {
    repo.forAlbums.mockResolvedValue(new Map());
    repo.forTracks.mockResolvedValue(new Map());
    const out = await withArtistCredits([{ release_id: "r1", friend_id: 6 }], []);
    expect(out).toEqual({ albums: [{ release_id: "r1", friend_id: 6, artists: [] }], tracks: [] });
  });
});

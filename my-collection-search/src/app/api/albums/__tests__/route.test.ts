vi.mock("@/server/services/artistCreditService", () => ({
  // A plain function, so resetAllMocks keeps it: every row gets one credit.
  withArtistCredits: async (albums: object[], tracks: object[]) => {
    const artists = [
      {
        id: 4,
        name: "A",
        slug: "a",
        is_placeholder: false,
        role: "primary",
        position: 0,
        credited_as: "A",
      },
    ];
    return {
      albums: albums.map((a) => ({ ...a, artists })),
      tracks: tracks.map((t) => ({ ...t, artists })),
    };
  },
}));
vi.mock("@/server/services/trackEmbeddingSyncService", () => ({ syncIdentityEmbeddings: vi.fn() }));
vi.mock("@/server/services/genreSimilarityService", () => ({
  triggerGenreSimilarityRefresh: vi.fn(),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const EMPTY_PAGE = {
  hits: [],
  estimatedTotalHits: 0,
  offset: 0,
  limit: 20,
  query: "",
  sort: "created_at:desc",
};

const { mockSearchAlbums, mockWithDbTransaction, mockUpdateAlbumFields, mockGetTracks } =
  vi.hoisted(() => ({
    mockSearchAlbums: vi.fn(),
    mockWithDbTransaction: vi.fn(),
    mockUpdateAlbumFields: vi.fn(),
    mockGetTracks: vi.fn(),
  }));
const mockResolveGenreFilter = vi.hoisted(() => vi.fn());
const mockResolveArtistFilter = vi.hoisted(() => vi.fn());

vi.mock("@/server/artists/artistFilter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/artists/artistFilter")>()),
  resolveArtistFilter: mockResolveArtistFilter,
}));

vi.mock("@/server/genres/genreFilter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/genres/genreFilter")>()),
  resolveGenreFilter: mockResolveGenreFilter,
}));

vi.mock("@/server/services/albumApiService", () => ({
  albumApiService: { searchAlbums: mockSearchAlbums },
}));

vi.mock("@/lib/serverDb", () => ({ withDbTransaction: mockWithDbTransaction }));

vi.mock("@/server/repositories/albumRepository", () => ({
  albumRepository: {
    updateAlbumFields: mockUpdateAlbumFields,
    getTracksForAlbumWithLibraryIdentifier: mockGetTracks,
    getTracksByReleaseAndFriend: mockGetTracks,
  },
}));

import { GET, PATCH } from "../route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getReq(query = "") {
  return new NextRequest(`http://localhost/api/albums${query}`);
}

function patchReq(body: unknown) {
  return new NextRequest("http://localhost/api/albums", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockSearchAlbums.mockResolvedValue(EMPTY_PAGE);
  // Run the transaction callback with a stub client by default.
  mockWithDbTransaction.mockImplementation(async (cb: (c: unknown) => unknown) => cb({}));
  mockUpdateAlbumFields.mockResolvedValue({ release_id: "r1" });
  mockGetTracks.mockResolvedValue([]);
  mockResolveGenreFilter.mockResolvedValue({ filter: undefined });
  mockResolveArtistFilter.mockResolvedValue({ ids: undefined, artists: [] });
});

// ─── GET ────────────────────────────────────────────────────────────────────

describe("GET /api/albums", () => {
  it("applies defaults when no query params are provided", async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(mockSearchAlbums).toHaveBeenCalledWith({
      q: "",
      limit: 20,
      offset: 0,
      friendId: null,
      sort: "created_at:desc",
      missingLibraryIdentifier: undefined,
      missingLocalCoverArtUrl: undefined,
      missingAudio: undefined,
    });
  });

  it("parses query params and maps missing_* flags", async () => {
    await GET(
      getReq(
        "?q=jazz&limit=5&offset=10&friend_id=3&sort=year:asc" +
          "&missing_library_identifier=1&missing_local_cover_art_url=1&missing_audio=1",
      ),
    );
    expect(mockSearchAlbums).toHaveBeenCalledWith({
      q: "jazz",
      limit: 5,
      offset: 10,
      friendId: "3",
      sort: "year:asc",
      missingLibraryIdentifier: true,
      missingLocalCoverArtUrl: true,
      missingAudio: true,
    });
  });

  it("treats missing_* values other than '1' as undefined", async () => {
    await GET(getReq("?missing_audio=0&missing_library_identifier=true"));
    const arg = mockSearchAlbums.mock.calls[0][0];
    expect(arg.missingAudio).toBeUndefined();
    expect(arg.missingLibraryIdentifier).toBeUndefined();
  });

  it("takes the defaults for an empty limit or offset", async () => {
    const res = await GET(getReq("?limit=&offset="));
    expect(res.status).toBe(200);
    expect(mockSearchAlbums).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, offset: 0 }),
    );
  });

  it("accepts zero and parseInt-style numbers for limit and offset", async () => {
    await GET(getReq("?limit=0&offset=15abc"));
    expect(mockSearchAlbums).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 0, offset: 15 }),
    );
  });

  it.each(["?limit=abc", "?limit=-1", "?offset=abc", "?offset=-5", "?limit=10&offset=x"])(
    "returns 400 instead of reaching SQL for %s",
    async (query) => {
      const res = await GET(getReq(query));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("limit and offset must be non-negative integers");
      expect(mockSearchAlbums).not.toHaveBeenCalled();
      expect(mockResolveGenreFilter).not.toHaveBeenCalled();
    },
  );

  it("returns the service response body", async () => {
    const page = {
      ...EMPTY_PAGE,
      hits: [{ release_id: "r1", friend_id: 1, title: "T", artist: "A" }],
      estimatedTotalHits: 1,
    };
    mockSearchAlbums.mockResolvedValueOnce(page);
    const res = await GET(getReq());
    // The search hits carry their structured artist credits (#708).
    expect(await res.json()).toEqual({
      ...page,
      hits: [
        {
          ...page.hits[0],
          artists: [
            {
              id: 4,
              name: "A",
              slug: "a",
              is_placeholder: false,
              role: "primary",
              position: 0,
              credited_as: "A",
            },
          ],
        },
      ],
    });
  });

  it("serialises Date columns and 500s on a row that breaks the contract", async () => {
    const row = { release_id: "r1", friend_id: 1, title: "T", artist: "A" };
    mockSearchAlbums.mockResolvedValueOnce({
      ...EMPTY_PAGE,
      hits: [{ ...row, date_added: new Date("2024-03-04T05:06:07Z") }],
    });
    const ok = await (await GET(getReq())).json();
    expect(ok.hits[0].date_added).toBe("2024-03-04T05:06:07.000Z");

    mockSearchAlbums.mockResolvedValueOnce({ ...EMPTY_PAGE, hits: [{ release_id: "r1" }] });
    expect((await GET(getReq())).status).toBe(500);
  });

  it("returns 500 with a message when the service throws", async () => {
    mockSearchAlbums.mockRejectedValueOnce(new Error("boom"));
    const res = await GET(getReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to search/i);
    expect(body.message).toBe("boom");
  });
});

// ─── PATCH ────────────────────────────────────────────────────────────────────

describe("PATCH /api/albums — validation", () => {
  it("returns 400 when release_id is missing", async () => {
    const res = await PATCH(patchReq({ friend_id: 1, album_rating: 5 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });

  it("returns 400 when friend_id is missing", async () => {
    const res = await PATCH(patchReq({ release_id: "r1", album_rating: 5 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when no updatable fields are provided", async () => {
    const res = await PATCH(patchReq({ release_id: "r1", friend_id: 1 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no fields/i);
  });

  it("returns 400 when library_identifier exceeds 50 characters", async () => {
    const res = await PATCH(
      patchReq({ release_id: "r1", friend_id: 1, library_identifier: "x".repeat(51) }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/50 characters/i);
  });

  it("returns 400 for a body that is not JSON", async () => {
    const res = await PATCH(
      new NextRequest("http://localhost/api/albums", { method: "PATCH", body: "not json" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON body");
    expect(mockUpdateAlbumFields).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty release_id", { release_id: "", friend_id: 1, album_rating: 5 }],
    ["a non-numeric friend_id", { release_id: "r1", friend_id: "abc", album_rating: 5 }],
    ["a zero friend_id", { release_id: "r1", friend_id: 0, album_rating: 5 }],
    ["a body that is not an object", "r1"],
  ])("returns 400 for %s", async (_label, body) => {
    const res = await PATCH(patchReq(body));
    expect(res.status).toBe(400);
    expect(mockUpdateAlbumFields).not.toHaveBeenCalled();
  });

  it.each([
    ["album_rating", { album_rating: "5" }],
    ["album_notes", { album_notes: 5 }],
    ["purchase_price", { purchase_price: "12" }],
    ["condition", { condition: 1 }],
    ["library_identifier", { library_identifier: 7 }],
  ])("returns 400 naming %s when it has the wrong type", async (field, extra) => {
    const res = await PATCH(patchReq({ release_id: "r1", friend_id: 1, ...extra }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(new RegExp(`^${field} must be`));
    expect(body.details).toBeDefined();
    expect(mockUpdateAlbumFields).not.toHaveBeenCalled();
  });

  it("accepts a numeric-string friend_id and passes the number on", async () => {
    const res = await PATCH(patchReq({ release_id: "r1", friend_id: "3", album_rating: 4 }));
    expect(res.status).toBe(200);
    expect(mockUpdateAlbumFields).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ release_id: "r1", friend_id: 3, album_rating: 4 }),
    );
  });

  it("allows a null library_identifier (clearing the field)", async () => {
    const res = await PATCH(patchReq({ release_id: "r1", friend_id: 1, library_identifier: null }));
    expect(res.status).toBe(200);
    expect(mockUpdateAlbumFields).toHaveBeenCalled();
  });
});

describe("PATCH /api/albums — behavior", () => {
  it("returns 404 when the album is not found", async () => {
    mockUpdateAlbumFields.mockResolvedValueOnce(null);
    const res = await PATCH(patchReq({ release_id: "r1", friend_id: 1, album_rating: 4 }));
    expect(res.status).toBe(404);
  });

  it("returns tracksUpdated count when library_identifier changes", async () => {
    mockGetTracks.mockResolvedValueOnce([{ track_id: "t1" }, { track_id: "t2" }]);
    const res = await PATCH(
      patchReq({ release_id: "r1", friend_id: 1, library_identifier: "LIB-1" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.tracksUpdated).toBe(2);
  });

  it("does not fetch tracks when library_identifier is not part of the update", async () => {
    const res = await PATCH(patchReq({ release_id: "r1", friend_id: 1, album_rating: 5 }));
    expect(res.status).toBe(200);
    expect((await res.json()).tracksUpdated).toBe(0);
    expect(mockGetTracks).not.toHaveBeenCalled();
  });

  it("swallows track-fetch errors and still returns 200", async () => {
    mockGetTracks.mockRejectedValueOnce(new Error("tracks boom"));
    const res = await PATCH(
      patchReq({ release_id: "r1", friend_id: 1, library_identifier: "LIB-1" }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).tracksUpdated).toBe(0);
  });

  it("returns 409 on a duplicate library-identifier constraint violation", async () => {
    mockWithDbTransaction.mockRejectedValueOnce(
      new Error("duplicate key value violates idx_albums_unique_friend_library_identifier"),
    );
    const res = await PATCH(
      patchReq({ release_id: "r1", friend_id: 1, library_identifier: "LIB-1" }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/duplicate library identifier/i);
  });

  it("returns 500 on a generic error", async () => {
    mockWithDbTransaction.mockRejectedValueOnce(new Error("db exploded"));
    const res = await PATCH(patchReq({ release_id: "r1", friend_id: 1, album_rating: 3 }));
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe("db exploded");
  });
});

// ─── GET — genre filter (#375) ──────────────────────────────────────────────

describe("GET /api/albums — genre filter", () => {
  it("resolves every repeated genre and passes the filter to the search", async () => {
    const filter = { ids: ["id-latin"], keys: ["latin"] };
    mockResolveGenreFilter.mockResolvedValue({ filter, added: [] });
    const res = await GET(getReq("?genre=latin&genre=salsa"));
    expect(res.status).toBe(200);
    expect(mockResolveGenreFilter).toHaveBeenCalledWith(["latin", "salsa"], {
      includeSimilar: false,
      similarLimit: undefined,
      excludeSimilarIds: [],
    });
    expect(mockSearchAlbums).toHaveBeenCalledWith(expect.objectContaining({ genreFilter: filter }));
  });

  it("rejects an unknown genre with 400 and names it", async () => {
    mockResolveGenreFilter.mockResolvedValue({ unknown: ["nope"] });
    const res = await GET(getReq("?genre=nope"));
    expect(res.status).toBe(400);
    expect((await res.json()).unknown).toEqual(["nope"]);
    expect(mockSearchAlbums).not.toHaveBeenCalled();
  });
});

// ─── GET — include_similar (#485) ───────────────────────────────────────────

describe("GET /api/albums — include_similar", () => {
  const PORRO_ID = "11111111-1111-4111-8111-111111111111";

  it("passes include_similar, similar_limit and similar_exclude through to resolveGenreFilter", async () => {
    mockResolveGenreFilter.mockResolvedValue({
      filter: { ids: ["id-cumbia"], keys: ["cumbia"] },
      added: [],
    });
    await GET(
      getReq(`?genre=cumbia&include_similar=1&similar_limit=3&similar_exclude=${PORRO_ID}`),
    );

    expect(mockResolveGenreFilter).toHaveBeenCalledWith(["cumbia"], {
      includeSimilar: true,
      similarLimit: 3,
      excludeSimilarIds: [PORRO_ID],
    });
  });

  it("is off by default", async () => {
    mockResolveGenreFilter.mockResolvedValue({
      filter: { ids: ["id-cumbia"], keys: ["cumbia"] },
      added: [],
    });
    await GET(getReq("?genre=cumbia"));

    expect(mockResolveGenreFilter).toHaveBeenCalledWith(["cumbia"], {
      includeSimilar: false,
      similarLimit: undefined,
      excludeSimilarIds: [],
    });
  });

  it("names the added genres in the response", async () => {
    mockResolveGenreFilter.mockResolvedValue({
      filter: { ids: ["id-cumbia", PORRO_ID], keys: ["cumbia", "porro"] },
      added: [{ id: PORRO_ID, name: "Porro", slug: "porro" }],
    });
    mockSearchAlbums.mockResolvedValueOnce(EMPTY_PAGE);
    const res = await GET(getReq("?genre=cumbia&include_similar=1"));
    const body = await res.json();
    expect(body.added_genres).toEqual([{ id: PORRO_ID, name: "Porro", slug: "porro" }]);
  });

  it("omits added_genres when widening added nothing", async () => {
    mockResolveGenreFilter.mockResolvedValue({
      filter: { ids: ["id-cumbia"], keys: ["cumbia"] },
      added: [],
    });
    const res = await GET(getReq("?genre=cumbia&include_similar=1"));
    const body = await res.json();
    expect(body.added_genres).toBeUndefined();
  });
});

describe("PATCH album taxonomy replacements", () => {
  it("accepts empty and reset replacements, scopes the write, and refreshes similarity", async () => {
    const res = await PATCH(
      patchReq({
        release_id: "same-release",
        friend_id: 7,
        genre_override_ids: [],
        style_override_ids: null,
      }),
    );
    expect(res.status).toBe(200);
    expect(mockUpdateAlbumFields).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        release_id: "same-release",
        friend_id: 7,
        genre_override_ids: [],
        style_override_ids: null,
      }),
    );
    const { triggerGenreSimilarityRefresh } =
      await import("@/server/services/genreSimilarityService");
    expect(triggerGenreSimilarityRefresh).toHaveBeenCalledOnce();
    expect(mockGetTracks).toHaveBeenCalledWith("same-release", 7);
    const { syncIdentityEmbeddings } = await import("@/server/services/trackEmbeddingSyncService");
    expect(syncIdentityEmbeddings).toHaveBeenCalledWith([]);
  });
  it("rejects malformed overrides before any write", async () => {
    const res = await PATCH(
      patchReq({ release_id: "r1", friend_id: 7, style_override_ids: ["not-a-uuid"] }),
    );
    expect(res.status).toBe(400);
    expect(mockUpdateAlbumFields).not.toHaveBeenCalled();
  });
  it("cannot attach overrides to a missing friend-scoped album", async () => {
    mockUpdateAlbumFields.mockResolvedValueOnce(null);
    const res = await PATCH(patchReq({ release_id: "r1", friend_id: 8, genre_override_ids: null }));
    expect(res.status).toBe(404);
  });
});

// ─── GET — artist filter (#709) ─────────────────────────────────────────────

describe("GET /api/albums — artist filter", () => {
  const meridian = { id: 9, name: "Meridian Brothers", slug: "meridian-brothers" };

  it("resolves every repeated artist, filters by their ids and names them", async () => {
    mockResolveArtistFilter.mockResolvedValue({ ids: [9, 4], artists: [meridian] });
    const res = await GET(getReq("?artist=meridian-brothers&artist=4"));
    expect(res.status).toBe(200);
    expect(mockResolveArtistFilter).toHaveBeenCalledWith(["meridian-brothers", "4"]);
    expect(mockSearchAlbums).toHaveBeenCalledWith(expect.objectContaining({ artistIds: [9, 4] }));
    expect((await res.json()).filter_artists).toEqual([meridian]);
  });

  it("leaves filter_artists out without an artist filter", async () => {
    const res = await GET(getReq());
    expect(await res.json()).not.toHaveProperty("filter_artists");
  });

  it("rejects an unknown artist with 400 and names it", async () => {
    mockResolveArtistFilter.mockResolvedValue({ unknown: ["nobody"] });
    const res = await GET(getReq("?artist=nobody"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Unknown artist: nobody", unknown: ["nobody"] });
    expect(mockSearchAlbums).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const requestMock = vi.hoisted(() => vi.fn());
const createMock = vi.hoisted(() => vi.fn((_config: unknown) => ({ request: requestMock })));
const isAxiosErrorMock = vi.hoisted(() => vi.fn(() => false));

vi.mock("axios", () => ({
  default: {
    create: createMock,
    isAxiosError: isAxiosErrorMock,
  },
}));

import { GroovenetClient } from "./client.js";
import type { RecommendationCandidate, SpinCreateInput } from "./types.js";

/** Build a client and make the next `request` resolve with `data`. */
function clientReturning(data: unknown) {
  requestMock.mockResolvedValue({ data });
  return new GroovenetClient({ baseUrl: "https://example.test" });
}

function candidate(overrides: Partial<RecommendationCandidate> = {}): RecommendationCandidate {
  return {
    trackId: "t1",
    friendId: 2,
    simIdentity: 0.75,
    simAudio: 0.25,
    metadata: {
      title: "Blue",
      artist: "Artist",
      album: "Album",
      bpm: 120,
      key: "8A",
      danceability: 0.6,
      moodHappy: 0.1,
      moodSad: 0.2,
      moodRelaxed: 0.3,
      moodAggressive: 0.4,
      tags: [],
      styles: [],
      genres: [],
    },
    ...overrides,
  };
}

beforeEach(() => {
  createMock.mockClear();
  requestMock.mockReset();
  requestMock.mockResolvedValue({ data: {} });
  isAxiosErrorMock.mockReset();
  isAxiosErrorMock.mockReturnValue(false);
});

describe("GroovenetClient constructor", () => {
  it("sets the base URL and JSON content type without an API key", () => {
    new GroovenetClient({ baseUrl: "https://example.test/api" });

    expect(createMock).toHaveBeenCalledWith({
      baseURL: "https://example.test/api",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("adds a bearer header when an API key is given", () => {
    new GroovenetClient({ baseUrl: "https://example.test", apiKey: "secret" });

    expect(createMock).toHaveBeenCalledWith({
      baseURL: "https://example.test",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret",
      },
    });
  });

  it("attaches an https agent that skips TLS verification when insecureTls is set", () => {
    new GroovenetClient({ baseUrl: "https://example.test", insecureTls: true });

    const config = createMock.mock.calls[0]![0] as {
      httpsAgent?: { options: { rejectUnauthorized: boolean } };
    };
    expect(config.httpsAgent).toBeDefined();
    expect(config.httpsAgent?.options.rejectUnauthorized).toBe(false);
  });
});

describe("GroovenetClient error handling", () => {
  it("wraps an axios error with the response `error` field", async () => {
    isAxiosErrorMock.mockReturnValue(true);
    requestMock.mockRejectedValue({ response: { data: { error: "no such track" } }, message: "Request failed" });
    const client = new GroovenetClient({ baseUrl: "https://example.test" });

    await expect(client.listPlaylists()).rejects.toThrow("API Error: no such track");
  });

  it("falls back to the response `message` field", async () => {
    isAxiosErrorMock.mockReturnValue(true);
    requestMock.mockRejectedValue({ response: { data: { message: "bad request" } }, message: "Request failed" });
    const client = new GroovenetClient({ baseUrl: "https://example.test" });

    await expect(client.listPlaylists()).rejects.toThrow("API Error: bad request");
  });

  it("falls back to the axios message when the response has no body", async () => {
    isAxiosErrorMock.mockReturnValue(true);
    requestMock.mockRejectedValue({ message: "Network Error" });
    const client = new GroovenetClient({ baseUrl: "https://example.test" });

    await expect(client.listPlaylists()).rejects.toThrow("API Error: Network Error");
  });

  it("rethrows non-axios errors untouched", async () => {
    const boom = new TypeError("boom");
    requestMock.mockRejectedValue(boom);
    const client = new GroovenetClient({ baseUrl: "https://example.test" });

    await expect(client.listPlaylists()).rejects.toBe(boom);
  });
});

describe("GroovenetClient.searchTracks", () => {
  it("uses the GET search API and maps hits to tracks", async () => {
    const hits = [{ track_id: "t1", title: "Blue", artist: "Artist", album: "Album" }];
    const client = clientReturning({
      hits,
      estimatedTotalHits: 1,
      offset: 0,
      limit: 20,
      processingTimeMs: 4,
    });

    await expect(client.searchTracks({ query: "blue", limit: 20 })).resolves.toEqual({
      tracks: hits,
      estimatedTotalHits: 1,
      offset: 0,
      limit: 20,
      processingTimeMs: 4,
    });

    expect(requestMock).toHaveBeenCalledWith({
      method: "GET",
      url: "/tracks/search",
      data: undefined,
      params: { q: "blue", limit: 20, offset: 0, friend_id: undefined },
    });
  });

  it("defaults the query, limit and offset and forwards the friend filter", async () => {
    const client = clientReturning({
      hits: [],
      estimatedTotalHits: 0,
      offset: 0,
      limit: 10,
      processingTimeMs: 1,
    });

    await client.searchTracks({ filters: { friend_id: 7 } });

    expect(requestMock).toHaveBeenCalledWith({
      method: "GET",
      url: "/tracks/search",
      data: undefined,
      params: { q: "", limit: 10, offset: 0, friend_id: 7 },
    });
  });
});

describe("GroovenetClient track endpoints", () => {
  it("getTrack requests the track by id scoped to a friend", async () => {
    const track = { track_id: "t1" };
    const client = clientReturning(track);

    await expect(client.getTrack("t1", 3)).resolves.toBe(track);
    expect(requestMock).toHaveBeenCalledWith({
      method: "GET",
      url: "/tracks/t1",
      data: undefined,
      params: { friend_id: 3 },
    });
  });

  it("updateTrack merges the updates into the PATCH body", async () => {
    const client = clientReturning({ track_id: "t1" });

    await client.updateTrack("t1", { notes: "hello" }, 4);

    expect(requestMock).toHaveBeenCalledWith({
      method: "PATCH",
      url: "/tracks",
      data: { track_id: "t1", friend_id: 4, notes: "hello" },
      params: undefined,
    });
  });

  it("updateTrack defaults to friend 1", async () => {
    const client = clientReturning({ track_id: "t1" });

    await client.updateTrack("t1", { star_rating: 5 });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { track_id: "t1", friend_id: 1, star_rating: 5 } })
    );
  });

  it("getMissingAppleMusic filters on a null apple_music_url with default paging", async () => {
    const hits = [{ track_id: "t1" }];
    const client = clientReturning({ hits, estimatedTotalHits: 1 });

    await expect(client.getMissingAppleMusic()).resolves.toEqual({ tracks: hits, total: 1 });
    expect(requestMock).toHaveBeenCalledWith({
      method: "GET",
      url: "/tracks/search",
      data: undefined,
      params: { q: "", limit: 50, offset: 0, filter: "apple_music_url IS NULL" },
    });
  });

  it("getMissingAppleMusic converts a page number into an offset", async () => {
    const client = clientReturning({ hits: [], estimatedTotalHits: 0 });

    await client.getMissingAppleMusic(3, 25, "someone");

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ limit: 25, offset: 50 }) })
    );
  });

  it("getMissingAppleMusic clamps a page below 1 to the first page", async () => {
    const client = clientReturning({ hits: [], estimatedTotalHits: 0 });

    await client.getMissingAppleMusic(0, 10);

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ offset: 0 }) })
    );
  });

  it("batchGetTracks omits include_vectors by default", async () => {
    const client = clientReturning([]);
    const refs = [{ track_id: "t1", friend_id: 1 }];

    await client.batchGetTracks(refs);

    expect(requestMock).toHaveBeenCalledWith({
      method: "POST",
      url: "/tracks/batch",
      data: { tracks: refs },
      params: undefined,
    });
  });

  it("batchGetTracks includes include_vectors when requested", async () => {
    const client = clientReturning([]);
    const refs = [{ track_id: "t1", friend_id: 1 }];

    await client.batchGetTracks(refs, { include_vectors: true });

    expect(requestMock).toHaveBeenCalledWith({
      method: "POST",
      url: "/tracks/batch",
      data: { tracks: refs, include_vectors: true },
      params: undefined,
    });
  });

  it("batchGetTracks omits include_vectors when explicitly false", async () => {
    const client = clientReturning([]);

    await client.batchGetTracks([], { include_vectors: false });

    expect(requestMock).toHaveBeenCalledWith(expect.objectContaining({ data: { tracks: [] } }));
  });

  it("listDeletedTracks passes friend and paging params through", async () => {
    const client = clientReturning({ tracks: [], total: 0 });

    await client.listDeletedTracks(2, { limit: 5, offset: 10 });

    expect(requestMock).toHaveBeenCalledWith({
      method: "GET",
      url: "/tracks/deleted",
      data: undefined,
      params: { friend_id: 2, limit: 5, offset: 10 },
    });
  });

  it("listDeletedTracks leaves optional params undefined when omitted", async () => {
    const client = clientReturning({ tracks: [], total: 0 });

    await client.listDeletedTracks();

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({ params: { friend_id: undefined, limit: undefined, offset: undefined } })
    );
  });

  it("restoreTrack posts to the restore endpoint", async () => {
    const payload = { success: true, track_id: "t1", friend_id: 2, track: { track_id: "t1" } };
    const client = clientReturning(payload);

    await expect(client.restoreTrack("t1", 2)).resolves.toBe(payload);
    expect(requestMock).toHaveBeenCalledWith({
      method: "POST",
      url: "/tracks/t1/restore",
      data: undefined,
      params: { friend_id: 2 },
    });
  });
});

describe("GroovenetClient album endpoints", () => {
  it("searchAlbums applies defaults for an empty query", async () => {
    const client = clientReturning({ albums: [], total: 0 });

    await client.searchAlbums();

    expect(requestMock).toHaveBeenCalledWith({
      method: "GET",
      url: "/albums",
      data: undefined,
      params: { q: "", limit: 20, offset: 0, sort: "created_at:desc" },
    });
  });

  it("searchAlbums forwards an explicit query including friend_id", async () => {
    const client = clientReturning({ albums: [], total: 0 });

    await client.searchAlbums({ q: "kind of blue", limit: 5, offset: 10, sort: "title:asc", friend_id: 3 });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { q: "kind of blue", limit: 5, offset: 10, sort: "title:asc", friend_id: 3 },
      })
    );
  });

  it("searchAlbums omits friend_id when it is null", async () => {
    const client = clientReturning({ albums: [], total: 0 });

    await client.searchAlbums({ friend_id: null as unknown as undefined });

    const params = (requestMock.mock.calls[0][0] as { params: Record<string, unknown> }).params;
    expect(params).not.toHaveProperty("friend_id");
  });

  it("getAlbum requests one release", async () => {
    const album = { release_id: "r1" };
    const client = clientReturning(album);

    await expect(client.getAlbum("r1", 1)).resolves.toBe(album);
    expect(requestMock).toHaveBeenCalledWith({
      method: "GET",
      url: "/albums/r1",
      data: undefined,
      params: { friend_id: 1 },
    });
  });

  it("getAlbumPlayableStructure hits the playable-structure route", async () => {
    const client = clientReturning({ release_id: "r1" });

    await client.getAlbumPlayableStructure("r1", 2);

    expect(requestMock).toHaveBeenCalledWith({
      method: "GET",
      url: "/albums/r1/playable-structure",
      data: undefined,
      params: { friend_id: 2 },
    });
  });

  it("updateAlbum merges updates into the PATCH body", async () => {
    const client = clientReturning({ success: true, album: {} });

    await client.updateAlbum("r1", 2, { album_notes: "reissue" });

    expect(requestMock).toHaveBeenCalledWith({
      method: "PATCH",
      url: "/albums",
      data: { release_id: "r1", friend_id: 2, album_notes: "reissue" },
      params: undefined,
    });
  });

  it("downloadAlbum posts to the download route", async () => {
    const result = { queued: 3 };
    const client = clientReturning(result);

    await expect(client.downloadAlbum("r1", 2)).resolves.toBe(result);
    expect(requestMock).toHaveBeenCalledWith({
      method: "POST",
      url: "/albums/r1/download",
      data: undefined,
      params: { friend_id: 2 },
    });
  });
});

describe("GroovenetClient spin endpoints", () => {
  it("listSpins defaults limit and offset", async () => {
    const client = clientReturning({ spins: [], total: 0 });

    await client.listSpins({ friend_id: 1 });

    expect(requestMock).toHaveBeenCalledWith({
      method: "GET",
      url: "/spins",
      data: undefined,
      params: {
        friend_id: 1,
        release_id: undefined,
        track_id: undefined,
        from: undefined,
        to: undefined,
        limit: 50,
        offset: 0,
      },
    });
  });

  it("listSpins forwards every filter it is given", async () => {
    const client = clientReturning({ spins: [], total: 0 });

    await client.listSpins({
      friend_id: 1,
      release_id: "r1",
      track_id: "t1",
      from: "2026-01-01",
      to: "2026-02-01",
      limit: 5,
      offset: 15,
    });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        params: {
          friend_id: 1,
          release_id: "r1",
          track_id: "t1",
          from: "2026-01-01",
          to: "2026-02-01",
          limit: 5,
          offset: 15,
        },
      })
    );
  });

  it("createSpin posts the input as the body", async () => {
    const client = clientReturning({ id: 1 });
    const input: SpinCreateInput = {
      friend_id: 1,
      release_id: "r1",
      played_at: "2026-01-01T00:00:00Z",
      track_refs: [{ track_id: "t1", friend_id: 1 }],
    };

    await client.createSpin(input);

    expect(requestMock).toHaveBeenCalledWith({
      method: "POST",
      url: "/spins",
      data: input,
      params: undefined,
    });
  });

  it("deleteSpin deletes by id scoped to a friend", async () => {
    const client = clientReturning({ success: true });

    await client.deleteSpin(42, 1);

    expect(requestMock).toHaveBeenCalledWith({
      method: "DELETE",
      url: "/spins/42",
      data: undefined,
      params: { friend_id: 1 },
    });
  });

  it("listTopSpinTracks defaults limit and offset", async () => {
    const client = clientReturning({ tracks: [] });

    await client.listTopSpinTracks({ friend_id: 1 });

    expect(requestMock).toHaveBeenCalledWith({
      method: "GET",
      url: "/spins/top-tracks",
      data: undefined,
      params: { friend_id: 1, release_id: undefined, limit: 20, offset: 0 },
    });
  });

  it("listTopSpinTracks honours explicit paging", async () => {
    const client = clientReturning({ tracks: [] });

    await client.listTopSpinTracks({ friend_id: 1, release_id: "r1", limit: 3, offset: 6 });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({ params: { friend_id: 1, release_id: "r1", limit: 3, offset: 6 } })
    );
  });
});

describe("GroovenetClient playlist endpoints", () => {
  it("uses the set endpoint for set lifecycle operations", async () => {
    const client = clientReturning({ id: 4, playlist_id: 9 });
    await client.getLiveSet(9);
    await client.createLiveSet(9);
    await client.updateLiveSet(9, { title: "Late set" });
    await client.deleteLiveSet(9);
    expect(requestMock.mock.calls.map(([request]) => request)).toEqual([
      { method: "GET", url: "/playlists/9/set", data: undefined, params: undefined },
      { method: "POST", url: "/playlists/9/set", data: undefined, params: undefined },
      { method: "PUT", url: "/playlists/9/set", data: { title: "Late set" }, params: undefined },
      { method: "DELETE", url: "/playlists/9/set", data: undefined, params: undefined },
    ]);
  });
  it("listPlaylists returns the raw list", async () => {
    const playlists = [{ id: 1, name: "Set" }];
    const client = clientReturning(playlists);

    await expect(client.listPlaylists()).resolves.toBe(playlists);
    expect(requestMock).toHaveBeenCalledWith({
      method: "GET",
      url: "/playlists",
      data: undefined,
      params: undefined,
    });
  });

  it("getPlaylistTracks normalises track refs and defaults a missing friend to 1", async () => {
    const client = clientReturning({
      playlist_id: 9,
      tracks: [
        { track_id: "t1", friend_id: 4, position: 0 },
        { track_id: "t2", friend_id: null, position: 1 },
        { track_id: "t3" },
      ],
    });

    await expect(client.getPlaylistTracks(9)).resolves.toEqual({
      track_refs: [
        { track_id: "t1", friend_id: 4, position: 0 },
        { track_id: "t2", friend_id: 1, position: 1 },
        { track_id: "t3", friend_id: 1, position: undefined },
      ],
    });
    expect(requestMock).toHaveBeenCalledWith({
      method: "GET",
      url: "/playlists/9/tracks",
      data: undefined,
      params: undefined,
    });
  });

  it("createPlaylist defaults to an empty track list", async () => {
    const client = clientReturning({ id: 1, name: "Set" });

    await client.createPlaylist("Set");

    expect(requestMock).toHaveBeenCalledWith({
      method: "POST",
      url: "/playlists",
      data: { name: "Set", tracks: [] },
      params: undefined,
    });
  });

  it("createPlaylist forwards the given track ids", async () => {
    const client = clientReturning({ id: 1, name: "Set" });

    await client.createPlaylist("Set", ["t1", "t2"]);

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: "Set", tracks: ["t1", "t2"] } })
    );
  });

  it("generatePlaylist returns an array result as-is", async () => {
    const ordered = [{ track_id: "t2" }, { track_id: "t1" }];
    const client = clientReturning({ result: ordered });

    await expect(client.generatePlaylist([])).resolves.toBe(ordered);
    expect(requestMock).toHaveBeenCalledWith({
      method: "POST",
      url: "/playlists/genetic",
      data: { playlist: [] },
      params: undefined,
    });
  });

  it("generatePlaylist flattens a keyed-object result into an array", async () => {
    const client = clientReturning({
      result: { "0": { track_id: "t2" }, "1": { track_id: "t1" } },
    });

    await expect(client.generatePlaylist([])).resolves.toEqual([
      { track_id: "t2" },
      { track_id: "t1" },
    ]);
  });
});

describe("GroovenetClient friends", () => {
  it("getFriends prefers a `results` payload", async () => {
    const results = [{ id: 7, username: "dj" }];
    const client = clientReturning({ results });

    await expect(client.getFriends()).resolves.toBe(results);
    expect(requestMock).toHaveBeenCalledWith({
      method: "GET",
      url: "/friends",
      data: undefined,
      params: undefined,
    });
  });

  it("getFriends synthesises ids from a username list", async () => {
    const client = clientReturning({ friends: ["ann", "bob"] });

    await expect(client.getFriends()).resolves.toEqual([
      { id: 1, username: "ann" },
      { id: 2, username: "bob" },
    ]);
  });

  it("getFriends returns an empty list for an empty payload", async () => {
    const client = clientReturning({});

    await expect(client.getFriends()).resolves.toEqual([]);
  });

  it("addFriend posts the username", async () => {
    const client = clientReturning({});

    await expect(client.addFriend("ann")).resolves.toBeUndefined();
    expect(requestMock).toHaveBeenCalledWith({
      method: "POST",
      url: "/friends",
      data: { username: "ann" },
      params: undefined,
    });
  });
});

describe("GroovenetClient external search helpers", () => {
  it("searchAppleMusic posts the lookup options", async () => {
    const client = clientReturning({ results: [] });
    const opts = { title: "Blue", artist: "Artist", album: "Album", isrc: "US1234567890" };

    await client.searchAppleMusic(opts);

    expect(requestMock).toHaveBeenCalledWith({
      method: "POST",
      url: "/providers/apple-music/search",
      data: opts,
      params: undefined,
    });
  });

  it("searchYoutube posts the lookup options", async () => {
    const client = clientReturning({ results: [] });

    await client.searchYoutube({ title: "Blue", artist: "Artist" });

    expect(requestMock).toHaveBeenCalledWith({
      method: "POST",
      url: "/providers/youtube/music-search",
      data: { title: "Blue", artist: "Artist" },
      params: undefined,
    });
  });
});

describe("GroovenetClient.findSimilarIdentity", () => {
  it("queries identity candidates and maps them to distances", async () => {
    const client = clientReturning({ candidates: [candidate()] });

    await expect(client.findSimilarIdentity("seed", 1)).resolves.toEqual({
      source_track_id: "seed",
      source_friend_id: 1,
      filters: {},
      count: 1,
      tracks: [
        {
          track_id: "t1",
          friend_id: 2,
          title: "Blue",
          artist: "Artist",
          album: "Album",
          distance: 0.25,
          bpm: 120,
          key: "8A",
          danceability: 0.6,
          mood_happy: 0.1,
          mood_sad: 0.2,
          mood_relaxed: 0.3,
          mood_aggressive: 0.4,
        },
      ],
    });

    expect(requestMock).toHaveBeenCalledWith({
      method: "GET",
      url: "/recommendations/candidates",
      data: undefined,
      params: {
        track_id: "seed",
        friend_id: 1,
        mode: "identity",
        limit_identity: 10,
        limit_audio: 0,
      },
    });
  });

  it("treats a null simIdentity as maximum distance", async () => {
    const client = clientReturning({ candidates: [candidate({ simIdentity: null })] });

    const result = await client.findSimilarIdentity("seed", 1);
    expect(result.tracks[0].distance).toBe(1);
  });

  it("forwards limit and ivfflat_probes", async () => {
    const client = clientReturning({ candidates: [] });

    await client.findSimilarIdentity("seed", 1, { limit: 3, ivfflat_probes: 20 });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ limit_identity: 3, ivfflat_probes: 20 }),
      })
    );
  });

  it.each([
    ["era", { era: "1970s" }],
    ["country", { country: "US" }],
    ["tags", { tags: "jazz" }],
  ])("rejects an unsupported %s filter", async (_name, opts) => {
    const client = new GroovenetClient({ baseUrl: "https://example.test" });

    await expect(client.findSimilarIdentity("seed", 1, opts)).rejects.toThrow(
      "Identity search filters are not supported by the current Groovenet API."
    );
    expect(requestMock).not.toHaveBeenCalled();
  });
});

describe("GroovenetClient.getRecommendationCandidates", () => {
  it("sends only the seed when no options are given", async () => {
    const client = clientReturning({ candidates: [] });

    await client.getRecommendationCandidates("seed", 1);

    expect(requestMock).toHaveBeenCalledWith({
      method: "GET",
      url: "/recommendations/candidates",
      data: undefined,
      params: { track_id: "seed", friend_id: 1 },
    });
  });

  it("forwards every optional limit", async () => {
    const client = clientReturning({ candidates: [] });

    await client.getRecommendationCandidates("seed", 1, {
      limit_identity: 5,
      limit_audio: 6,
      ivfflat_probes: 7,
    });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        params: {
          track_id: "seed",
          friend_id: 1,
          limit_identity: 5,
          limit_audio: 6,
          ivfflat_probes: 7,
        },
      })
    );
  });
});

describe("GroovenetClient.findSimilarVibe", () => {
  it("queries audio candidates and maps them to distances", async () => {
    const client = clientReturning({ candidates: [candidate()] });

    await expect(client.findSimilarVibe("seed", 1)).resolves.toEqual({
      source_track_id: "seed",
      source_friend_id: 1,
      count: 1,
      tracks: [
        {
          track_id: "t1",
          friend_id: 2,
          title: "Blue",
          artist: "Artist",
          album: "Album",
          distance: 0.75,
          bpm: 120,
          key: "8A",
          danceability: 0.6,
          mood_happy: 0.1,
          mood_sad: 0.2,
          mood_relaxed: 0.3,
          mood_aggressive: 0.4,
        },
      ],
    });

    expect(requestMock).toHaveBeenCalledWith({
      method: "GET",
      url: "/recommendations/candidates",
      data: undefined,
      params: {
        track_id: "seed",
        friend_id: 1,
        mode: "audio",
        limit_identity: 0,
        limit_audio: 10,
      },
    });
  });

  it("treats a null simAudio as maximum distance", async () => {
    const client = clientReturning({ candidates: [candidate({ simAudio: null })] });

    const result = await client.findSimilarVibe("seed", 1);
    expect(result.tracks[0].distance).toBe(1);
  });

  it("forwards limit and ivfflat_probes", async () => {
    const client = clientReturning({ candidates: [] });

    await client.findSimilarVibe("seed", 1, { limit: 4, ivfflat_probes: 30 });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ limit_audio: 4, ivfflat_probes: 30 }),
      })
    );
  });
});

describe("GroovenetClient fingerprint endpoints", () => {
  it("starts an indexing run", async () => {
    const client = clientReturning({ run_id: "run-1", queued: 12 });

    const run = await client.startFingerprintIndex({ scope: "missing" });

    expect(run.run_id).toBe("run-1");
    expect(requestMock).toHaveBeenCalledWith({
      method: "POST",
      url: "/fingerprints/index",
      data: { scope: "missing" },
      params: undefined,
    });
  });

  it("forwards a narrowed scope", async () => {
    const client = clientReturning({});

    await client.startFingerprintIndex({
      scope: "release",
      release_id: "r9",
      friend_id: 2,
      force: true,
    });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { scope: "release", release_id: "r9", friend_id: 2, force: true },
      })
    );
  });

  it("reads a run's progress", async () => {
    const client = clientReturning({ run_id: "run-1", indexed: 7 });

    const run = await client.getFingerprintIndexRun("run-1");

    expect(run.indexed).toBe(7);
    expect(requestMock).toHaveBeenCalledWith({
      method: "GET",
      url: "/fingerprints/index/run-1",
      data: undefined,
      params: undefined,
    });
  });

  it("escapes a run id", async () => {
    const client = clientReturning({});

    await client.getFingerprintIndexRun("run/../secrets");

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: "/fingerprints/index/run%2F..%2Fsecrets" })
    );
  });
});

describe("GroovenetClient vinyl debug endpoints", () => {
  it("lists detections with defaults", async () => {
    const client = clientReturning({ detections: [], count: 0 });

    await client.listDetections();

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        url: "/detections/recent",
        params: expect.objectContaining({ limit: 30 }),
      })
    );
  });

  it("forwards the matched filter only when set", async () => {
    const client = clientReturning({ detections: [], count: 0 });

    await client.listDetections({ matched: false, source_id: "aswitch" });

    expect(requestMock.mock.calls[0][0].params).toMatchObject({
      matched: false,
      source_id: "aswitch",
    });
  });

  it("omits the matched filter when unset, so both kinds come back", async () => {
    const client = clientReturning({ detections: [], count: 0 });

    await client.listDetections({ source_id: "aswitch" });

    expect(requestMock.mock.calls[0][0].params).not.toHaveProperty("matched");
  });

  it("lists ingests", async () => {
    const client = clientReturning({ ingests: [], count: 0 });

    await client.listIngests({ status: "failed" });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/audio/ingest/recent",
        params: expect.objectContaining({ status: "failed" }),
      })
    );
  });

  it("reads the pipeline stats", async () => {
    const client = clientReturning({ index: { indexed_tracks: 3783 } });

    const stats = await client.getIngestStats({ minutes: 15 });

    expect(stats.index.indexed_tracks).toBe(3783);
    expect(requestMock.mock.calls[0][0].url).toBe("/audio/ingest/stats");
  });

  it("posts a manual aggregation backfill", async () => {
    const client = clientReturning({
      since: "2026-08-01T00:00:00Z",
      created: 2,
      skipped: 1,
      sources: [{ source_id: "living-room-vinyl", created: 2, skipped: 1 }],
    });

    const result = await client.aggregateSpins({ since: "2026-08-01T00:00:00Z" });

    expect(result.created).toBe(2);
    expect(requestMock).toHaveBeenCalledWith({
      method: "POST",
      url: "/spins/aggregate",
      data: { since: "2026-08-01T00:00:00Z" },
      params: undefined,
    });
  });

  it("scopes the backfill to one source", async () => {
    const client = clientReturning({ since: "x", created: 0, skipped: 0, sources: [] });

    await client.aggregateSpins({
      since: "2026-08-01T00:00:00Z",
      source_id: "living-room-vinyl",
    });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { since: "2026-08-01T00:00:00Z", source_id: "living-room-vinyl" },
      })
    );
  });
});

describe("set derivation (#282)", () => {
  const sha = "c".repeat(64);

  it("asks whether a recording is held, treating 404 as an answer", async () => {
    const client = new GroovenetClient({ baseUrl: "https://example.test" });
    requestMock.mockResolvedValueOnce({ status: 200, data: "" });
    expect(await client.hasSetRecording(sha)).toBe(true);

    requestMock.mockResolvedValueOnce({ status: 404, data: "" });
    expect(await client.hasSetRecording(sha)).toBe(false);

    const config = requestMock.mock.calls[0][0];
    expect(config).toMatchObject({ method: "HEAD", url: `/set-recordings/${sha}` });
    expect(config.validateStatus(404)).toBe(true);
    expect(config.validateStatus(500)).toBe(false);
  });

  it("streams an upload with its size, an encoded filename and progress", async () => {
    const client = new GroovenetClient({ baseUrl: "https://example.test" });
    requestMock.mockResolvedValueOnce({ status: 201, data: { sha256: sha } });
    const body = new Uint8Array([1, 2, 3]);
    const progress: number[] = [];

    const stored = await client.uploadSetRecording(sha, body, {
      size: 3,
      filename: "Carlos Díaz.mp3",
      onProgress: (sent) => progress.push(sent),
    });

    expect(stored).toEqual({ sha256: sha });
    const config = requestMock.mock.calls[0][0];
    expect(config).toMatchObject({
      method: "PUT",
      url: `/set-recordings/${sha}`,
      data: body,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": "3",
        "X-Filename": "Carlos%20D%C3%ADaz.mp3",
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      // Redirects would route the body through follow-redirects, which keeps
      // a copy of all of it: the whole recording in memory.
      maxRedirects: 0,
    });
    config.onUploadProgress({ loaded: 2 });
    expect(progress).toEqual([2]);
  });

  it("uploads without a filename or a progress callback", async () => {
    const client = new GroovenetClient({ baseUrl: "https://example.test" });
    requestMock.mockResolvedValueOnce({ status: 200, data: {} });

    await client.uploadSetRecording(sha, new Uint8Array(), { size: 0 });

    const config = requestMock.mock.calls[0][0];
    expect(config.headers).not.toHaveProperty("X-Filename");
    expect(() => config.onUploadProgress({ loaded: 1 })).not.toThrow();
  });

  it("surfaces an upload the server refused", async () => {
    isAxiosErrorMock.mockReturnValue(true);
    requestMock.mockRejectedValue({ response: { data: { error: "hash_mismatch" } }, message: "422" });
    const client = new GroovenetClient({ baseUrl: "https://example.test" });

    await expect(client.uploadSetRecording(sha, new Uint8Array(), { size: 0 })).rejects.toThrow(
      "API Error: hash_mismatch"
    );
  });

  it("starts a derivation", async () => {
    const client = clientReturning({ id: "d1", reused: false });

    await client.createSetDerivation({ recording_sha256: sha, live_set_id: 4, force: true });

    expect(requestMock).toHaveBeenCalledWith({
      method: "POST",
      url: "/set-derivations",
      data: { recording_sha256: sha, live_set_id: 4, force: true },
      params: undefined,
    });
  });

  it("reads a derivation against a playlist", async () => {
    const client = clientReturning({ tracklist: [] });

    await client.getSetDerivation("d1", { playlist_id: 176 });

    expect(requestMock).toHaveBeenCalledWith({
      method: "GET",
      url: "/set-derivations/d1",
      data: undefined,
      params: { playlist_id: 176, live_set_id: undefined },
    });
  });

  it("reads a derivation with no plan", async () => {
    const client = clientReturning({ tracklist: [] });
    await client.getSetDerivation("d1");
    expect(requestMock.mock.calls[0][0].params).toEqual({ playlist_id: undefined, live_set_id: undefined });
  });
});

describe("setPlaylistTracks", () => {
  it("replaces a playlist's tracks with the ordered list", async () => {
    const client = clientReturning({ id: 176 });
    await client.setPlaylistTracks(176, [{ track_id: "1-A1", friend_id: 1 }]);
    expect(requestMock).toHaveBeenCalledWith({
      method: "PATCH",
      url: "/playlists",
      data: { id: 176, tracks: [{ track_id: "1-A1", friend_id: 1 }] },
      params: undefined,
    });
  });
});

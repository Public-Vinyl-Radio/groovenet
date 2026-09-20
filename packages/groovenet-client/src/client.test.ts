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

describe("GroovenetClient playback", () => {
  const unsupported = "Server-side playback is not supported by this Groovenet API.";

  it.each([
    ["play", (c: GroovenetClient) => c.play("song.flac")],
    ["pause", (c: GroovenetClient) => c.pause()],
    ["resume", (c: GroovenetClient) => c.resume()],
    ["stop", (c: GroovenetClient) => c.stop()],
    ["getPlaybackStatus", (c: GroovenetClient) => c.getPlaybackStatus()],
  ])("%s rejects as unsupported", async (_name, call) => {
    const client = new GroovenetClient({ baseUrl: "https://example.test" });

    await expect(call(client)).rejects.toThrow(unsupported);
    expect(requestMock).not.toHaveBeenCalled();
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

import { beforeEach, describe, expect, it, vi } from "vitest";

const httpMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/http", () => ({
  http: httpMock,
}));

import {
  analyzeTrackAsync,
  extractEmbeddedCover,
  fetchAudioVibeEmbeddingPreview,
  fetchIdentityEmbeddingPreview,
  fetchPlaylistCounts,
  fetchSimilarTracks,
  fetchSimilarVibeTracks,
  fetchTrackAudioMetadata,
  fetchTrackById,
  fetchTrackEmbeddingPreview,
  fetchTrackEssentiaData,
  fetchTrackMetadata,
  fetchTrackPlaylists,
  fetchTracksByIds,
  fixTrackDuration,
  saveTrack,
  searchTracks,
  softDeleteTrack,
  uploadTrackAudio,
} from "./tracks";
import type { TrackEditFormProps } from "@/components/track-edit/types";

const GET_NO_STORE = { method: "GET", cache: "no-store" };

/** The URL the most recent http call used. */
function calledUrl(): string {
  return httpMock.mock.calls[0][0] as string;
}

/** Query params of the most recent http call. */
function calledParams(): URLSearchParams {
  return new URLSearchParams(calledUrl().split("?")[1] ?? "");
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    trackId: "t1",
    friendId: 2,
    simIdentity: 0.8,
    simAudio: 0.6,
    metadata: {
      title: "Blue",
      artist: "Artist",
      album: "Album",
      year: "1994",
      genres: ["electronic"],
      styles: ["idm"],
      tags: ["melodic", "warm"],
      bpm: 120,
      key: "8A",
      danceability: 0.5,
      energy: 0.4,
      starRating: 4,
      moodHappy: 0.1,
      moodSad: 0.2,
      moodRelaxed: 0.3,
      moodAggressive: 0.4,
    },
    ...overrides,
  };
}

const IDENTITY_DATA = {
  title: "Blue",
  artist: "Artist",
  album: "Album",
  era: "1990s",
  country: "us",
  labels: ["warp"],
  composers: [],
  genres: ["electronic"],
  styles: ["idm"],
  tags: ["melodic"],
};

const VIBE_DATA = {
  bpm: "120",
  bpmRange: "115-125",
  key: "8A",
  camelot: "8A",
  danceability: "0.5",
  energy: "0.4",
  dominantMood: "relaxed",
  moodProfile: "warm",
  vibeDescriptors: ["hazy"],
};

beforeEach(() => {
  httpMock.mockReset();
  httpMock.mockResolvedValue({});
});

describe("fetchTracksByIds", () => {
  it("returns early for an empty track list", async () => {
    await expect(fetchTracksByIds([])).resolves.toEqual([]);
    expect(httpMock).not.toHaveBeenCalled();
  });

  it("returns early for a nullish track list", async () => {
    await expect(
      fetchTracksByIds(null as unknown as { track_id: string; friend_id: number }[])
    ).resolves.toEqual([]);
    expect(httpMock).not.toHaveBeenCalled();
  });

  it("omits include_vectors by default", async () => {
    httpMock.mockResolvedValue([]);
    const refs = [{ track_id: "t1", friend_id: 1 }];

    await fetchTracksByIds(refs);

    expect(httpMock).toHaveBeenCalledWith("/api/tracks/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tracks: refs }),
    });
  });

  it("includes include_vectors when requested", async () => {
    httpMock.mockResolvedValue([]);
    const refs = [{ track_id: "t1", friend_id: 1 }];

    await fetchTracksByIds(refs, { includeVectors: true });

    expect(httpMock).toHaveBeenCalledWith("/api/tracks/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tracks: refs, include_vectors: true }),
    });
  });

  it("omits include_vectors when explicitly false", async () => {
    httpMock.mockResolvedValue([]);

    await fetchTracksByIds([{ track_id: "t1", friend_id: 1 }], { includeVectors: false });

    expect(JSON.parse(httpMock.mock.calls[0][1].body)).not.toHaveProperty("include_vectors");
  });
});

describe("simple JSON POST/PATCH helpers", () => {
  it("saveTrack PATCHes the edit form payload", async () => {
    const data = { track_id: "t1", friend_id: 1, notes: "hi" } as unknown as TrackEditFormProps;

    await saveTrack(data);

    expect(httpMock).toHaveBeenCalledWith("/api/tracks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  });

  it("analyzeTrackAsync posts to the async analyze route", async () => {
    const args = { track_id: "t1", friend_id: 1, youtube_url: "https://y.test/x" };

    await analyzeTrackAsync(args);

    expect(httpMock).toHaveBeenCalledWith("/api/tracks/analyze-async", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
  });

  it("fixTrackDuration posts to the fix-duration route", async () => {
    const args = { track_id: "t1", friend_id: 1, local_audio_url: "/audio/t1.flac" };

    await fixTrackDuration(args);

    expect(httpMock).toHaveBeenCalledWith("/api/tracks/fix-duration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
  });

  it("fetchTrackMetadata posts to the OpenAI provider route", async () => {
    const args = { prompt: "describe", friend_id: 1 };

    await fetchTrackMetadata(args);

    expect(httpMock).toHaveBeenCalledWith("/api/providers/openai/track-metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
  });
});

describe("uploadTrackAudio", () => {
  it("sends multipart form data without a JSON content type", async () => {
    const file = new File(["audio"], "song.flac", { type: "audio/flac" });

    await uploadTrackAudio({ file, track_id: "t1" });

    const [url, init] = httpMock.mock.calls[0];
    expect(url).toBe("/api/tracks/upload");
    expect(init.method).toBe("POST");
    // The browser must set the multipart boundary itself.
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("includes the file and track id in the form data", async () => {
    const file = new File(["audio"], "song.flac", { type: "audio/flac" });

    await uploadTrackAudio({ file, track_id: "t1" });

    const body = httpMock.mock.calls[0][1].body as FormData;
    expect(body.get("track_id")).toBe("t1");
    expect((body.get("file") as File).name).toBe("song.flac");
  });
});

describe("single-track GET helpers", () => {
  it("fetchTrackById builds a friend-scoped URL", async () => {
    await fetchTrackById({ track_id: "t1", friend_id: 3 });

    expect(httpMock).toHaveBeenCalledWith("/api/tracks/t1?friend_id=3", GET_NO_STORE);
  });

  it("fetchTrackById encodes a track id containing a slash", async () => {
    await fetchTrackById({ track_id: "a/b?c", friend_id: 1 });

    expect(calledUrl()).toBe("/api/tracks/a%2Fb%3Fc?friend_id=1");
  });

  it("softDeleteTrack issues a DELETE", async () => {
    await softDeleteTrack({ track_id: "t1", friend_id: 2 });

    expect(httpMock).toHaveBeenCalledWith("/api/tracks/t1?friend_id=2", {
      method: "DELETE",
    });
  });

  it("softDeleteTrack encodes the track id", async () => {
    await softDeleteTrack({ track_id: "a b", friend_id: 1 });

    expect(calledUrl()).toBe("/api/tracks/a%20b?friend_id=1");
  });

  it("fetchTrackAudioMetadata hits the audio-metadata route", async () => {
    await fetchTrackAudioMetadata("t1", 2);

    expect(httpMock).toHaveBeenCalledWith(
      "/api/tracks/t1/audio-metadata?friend_id=2",
      GET_NO_STORE
    );
  });

  it("fetchTrackEssentiaData hits the essentia route", async () => {
    await fetchTrackEssentiaData("t1", 2);

    expect(httpMock).toHaveBeenCalledWith("/api/tracks/t1/essentia?friend_id=2", GET_NO_STORE);
  });

  it("fetchTrackEmbeddingPreview hits the embedding-preview route", async () => {
    await fetchTrackEmbeddingPreview("t1", 2);

    expect(httpMock).toHaveBeenCalledWith(
      "/api/tracks/t1/embedding-preview?friend_id=2",
      GET_NO_STORE
    );
  });

  it.each([
    ["fetchTrackAudioMetadata", () => fetchTrackAudioMetadata("a/b", 1)],
    ["fetchTrackEssentiaData", () => fetchTrackEssentiaData("a/b", 1)],
    ["fetchTrackEmbeddingPreview", () => fetchTrackEmbeddingPreview("a/b", 1)],
  ])("%s encodes the track id", async (_name, call) => {
    await call();

    expect(calledUrl().startsWith("/api/tracks/a%2Fb/")).toBe(true);
  });
});

describe("fetchTrackPlaylists", () => {
  it("returns the playlists array", async () => {
    const playlists = [{ playlist_id: 1, playlist_name: "Set", position: 0 }];
    httpMock.mockResolvedValue({ playlists });

    await expect(fetchTrackPlaylists("t1", 2)).resolves.toBe(playlists);
    expect(httpMock).toHaveBeenCalledWith(
      "/api/tracks/t1/playlists?friend_id=2",
      GET_NO_STORE
    );
  });

  it.each([
    ["a missing key", {}],
    ["a null value", { playlists: null }],
    ["a non-array value", { playlists: "nope" }],
  ])("returns an empty array for %s", async (_name, payload) => {
    httpMock.mockResolvedValue(payload);

    await expect(fetchTrackPlaylists("t1", 2)).resolves.toEqual([]);
  });
});

describe("extractEmbeddedCover", () => {
  it("POSTs and returns the extracted art url", async () => {
    httpMock.mockResolvedValue({ audio_file_album_art_url: "https://art.test/a.jpg" });

    await expect(extractEmbeddedCover("t1", 2)).resolves.toBe("https://art.test/a.jpg");
    expect(httpMock).toHaveBeenCalledWith("/api/tracks/t1/audio-metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friend_id: 2 }),
    });
  });

  it.each([
    ["a missing url", {}],
    ["a null url", { audio_file_album_art_url: null }],
    ["an empty url", { audio_file_album_art_url: "" }],
  ])("returns an empty string for %s", async (_name, payload) => {
    httpMock.mockResolvedValue(payload);

    await expect(extractEmbeddedCover("t1", 2)).resolves.toBe("");
  });
});

describe("fetchIdentityEmbeddingPreview", () => {
  it("reshapes the API response into identityText and identityData", async () => {
    httpMock.mockResolvedValue({ type: "identity", text: "Track: Blue", data: IDENTITY_DATA });

    await expect(fetchIdentityEmbeddingPreview("t1", 2)).resolves.toEqual({
      identityText: "Track: Blue",
      identityData: IDENTITY_DATA,
    });
  });

  it("requests the identity preview type", async () => {
    httpMock.mockResolvedValue({ type: "identity", text: "x", data: IDENTITY_DATA });

    await fetchIdentityEmbeddingPreview("t1", 2);

    expect(calledUrl()).toBe(
      "/api/tracks/t1/embedding-preview?friend_id=2&type=identity"
    );
  });

  it("rejects an audio_vibe payload", async () => {
    httpMock.mockResolvedValue({ type: "audio_vibe", text: "x", data: VIBE_DATA });

    await expect(fetchIdentityEmbeddingPreview("t1", 2)).rejects.toThrow();
  });

  it("rejects a payload missing required identity fields", async () => {
    httpMock.mockResolvedValue({
      type: "identity",
      text: "x",
      data: { ...IDENTITY_DATA, era: undefined },
    });

    await expect(fetchIdentityEmbeddingPreview("t1", 2)).rejects.toThrow();
  });
});

describe("fetchAudioVibeEmbeddingPreview", () => {
  it("reshapes the API response into vibeText and vibeData", async () => {
    httpMock.mockResolvedValue({ type: "audio_vibe", text: "BPM: 120", data: VIBE_DATA });

    await expect(fetchAudioVibeEmbeddingPreview("t1", 2)).resolves.toEqual({
      vibeText: "BPM: 120",
      vibeData: VIBE_DATA,
    });
  });

  it("requests the audio_vibe preview type", async () => {
    httpMock.mockResolvedValue({ type: "audio_vibe", text: "x", data: VIBE_DATA });

    await fetchAudioVibeEmbeddingPreview("t1", 2);

    expect(calledUrl()).toBe(
      "/api/tracks/t1/embedding-preview?friend_id=2&type=audio_vibe"
    );
  });

  it("rejects an identity payload", async () => {
    httpMock.mockResolvedValue({ type: "identity", text: "x", data: IDENTITY_DATA });

    await expect(fetchAudioVibeEmbeddingPreview("t1", 2)).rejects.toThrow();
  });

  it("keeps the optional vibe fields when present", async () => {
    const data = { ...VIBE_DATA, acoustic: "low", partyMood: "high" };
    httpMock.mockResolvedValue({ type: "audio_vibe", text: "x", data });

    const result = await fetchAudioVibeEmbeddingPreview("t1", 2);

    expect(result.vibeData.acoustic).toBe("low");
    expect(result.vibeData.partyMood).toBe("high");
  });
});

describe("fetchSimilarVibeTracks", () => {
  it("queries audio mode and maps candidates to tracks", async () => {
    httpMock.mockResolvedValue({ candidates: [candidate()] });

    const result = await fetchSimilarVibeTracks({ track_id: "seed", friend_id: 1 });

    expect(calledParams().get("mode")).toBe("audio");
    expect(result.source_track_id).toBe("seed");
    expect(result.source_friend_id).toBe(1);
    expect(result.count).toBe(1);
    expect(result.tracks[0]).toMatchObject({
      track_id: "t1",
      friend_id: 2,
      title: "Blue",
      distance: 1 - 0.6,
      local_tags: "melodic, warm",
      identity_text: "",
    });
  });

  it("drops candidates with no audio similarity", async () => {
    httpMock.mockResolvedValue({
      candidates: [candidate({ simAudio: null }), candidate({ trackId: "t2" })],
    });

    const result = await fetchSimilarVibeTracks({ track_id: "seed", friend_id: 1 });

    expect(result.tracks.map((t) => t.track_id)).toEqual(["t2"]);
  });

  it("sorts by descending audio similarity", async () => {
    httpMock.mockResolvedValue({
      candidates: [
        candidate({ trackId: "low", simAudio: 0.1 }),
        candidate({ trackId: "high", simAudio: 0.9 }),
        candidate({ trackId: "mid", simAudio: 0.5 }),
      ],
    });

    const result = await fetchSimilarVibeTracks({ track_id: "seed", friend_id: 1 });

    expect(result.tracks.map((t) => t.track_id)).toEqual(["high", "mid", "low"]);
  });

  it("omits limit_audio and ivfflat_probes when not given", async () => {
    httpMock.mockResolvedValue({ candidates: [] });

    await fetchSimilarVibeTracks({ track_id: "seed", friend_id: 1 });

    const params = calledParams();
    expect(params.has("limit_audio")).toBe(false);
    expect(params.has("ivfflat_probes")).toBe(false);
  });

  it("forwards limit and ivfflat_probes", async () => {
    httpMock.mockResolvedValue({ candidates: [] });

    await fetchSimilarVibeTracks({
      track_id: "seed",
      friend_id: 1,
      limit: 5,
      ivfflat_probes: 20,
    });

    const params = calledParams();
    expect(params.get("limit_audio")).toBe("5");
    expect(params.get("ivfflat_probes")).toBe("20");
  });

  it("coerces a string friend_id to a number", async () => {
    httpMock.mockResolvedValue({ candidates: [] });

    const result = await fetchSimilarVibeTracks({
      track_id: "seed",
      friend_id: "7" as unknown as number,
    });

    expect(calledParams().get("friend_id")).toBe("7");
    expect(result.source_friend_id).toBe(7);
  });
});

describe("fetchSimilarTracks", () => {
  it("queries identity mode and maps candidates to tracks", async () => {
    httpMock.mockResolvedValue({ candidates: [candidate()] });

    const result = await fetchSimilarTracks({ track_id: "seed", friend_id: 1 });

    expect(calledParams().get("mode")).toBe("identity");
    expect(result.count).toBe(1);
    expect(result.tracks[0]).toMatchObject({
      track_id: "t1",
      distance: 1 - 0.8,
      local_tags: "melodic, warm",
    });
  });

  it("drops candidates with no identity similarity", async () => {
    httpMock.mockResolvedValue({
      candidates: [candidate({ simIdentity: null }), candidate({ trackId: "t2" })],
    });

    const result = await fetchSimilarTracks({ track_id: "seed", friend_id: 1 });

    expect(result.tracks.map((t) => t.track_id)).toEqual(["t2"]);
  });

  it("sorts by descending identity similarity", async () => {
    httpMock.mockResolvedValue({
      candidates: [
        candidate({ trackId: "low", simIdentity: 0.2 }),
        candidate({ trackId: "high", simIdentity: 0.95 }),
      ],
    });

    const result = await fetchSimilarTracks({ track_id: "seed", friend_id: 1 });

    expect(result.tracks.map((t) => t.track_id)).toEqual(["high", "low"]);
  });

  it("forwards limit as limit_identity and ivfflat_probes", async () => {
    httpMock.mockResolvedValue({ candidates: [] });

    await fetchSimilarTracks({
      track_id: "seed",
      friend_id: 1,
      limit: 3,
      ivfflat_probes: 15,
    });

    const params = calledParams();
    expect(params.get("limit_identity")).toBe("3");
    expect(params.get("ivfflat_probes")).toBe("15");
  });

  describe("era filter", () => {
    it("keeps only tracks whose year matches", async () => {
      httpMock.mockResolvedValue({
        candidates: [
          candidate({ trackId: "keep" }),
          candidate({
            trackId: "drop",
            metadata: { ...candidate().metadata, year: "2010" },
          }),
        ],
      });

      const result = await fetchSimilarTracks({
        track_id: "seed",
        friend_id: 1,
        era: "199",
      });

      expect(result.tracks.map((t) => t.track_id)).toEqual(["keep"]);
      expect(result.count).toBe(1);
    });

    it("matches case-insensitively and ignores surrounding space", async () => {
      httpMock.mockResolvedValue({
        candidates: [
          candidate({ metadata: { ...candidate().metadata, year: "1994 REMASTER" } }),
        ],
      });

      const result = await fetchSimilarTracks({
        track_id: "seed",
        friend_id: 1,
        era: "  remaster  ",
      });

      expect(result.tracks).toHaveLength(1);
    });

    it("drops a track with no year when an era is required", async () => {
      httpMock.mockResolvedValue({
        candidates: [candidate({ metadata: { ...candidate().metadata, year: null } })],
      });

      const result = await fetchSimilarTracks({
        track_id: "seed",
        friend_id: 1,
        era: "1994",
      });

      expect(result.tracks).toEqual([]);
    });
  });

  describe("tags filter", () => {
    it("requires every listed tag", async () => {
      httpMock.mockResolvedValue({
        candidates: [
          candidate({ trackId: "both" }),
          candidate({
            trackId: "one",
            metadata: { ...candidate().metadata, tags: ["melodic"] },
          }),
        ],
      });

      const result = await fetchSimilarTracks({
        track_id: "seed",
        friend_id: 1,
        tags: "melodic,warm",
      });

      expect(result.tracks.map((t) => t.track_id)).toEqual(["both"]);
    });

    it("ignores casing and whitespace in the filter", async () => {
      httpMock.mockResolvedValue({ candidates: [candidate()] });

      const result = await fetchSimilarTracks({
        track_id: "seed",
        friend_id: 1,
        tags: "  MELODIC ,  Warm  ",
      });

      expect(result.tracks).toHaveLength(1);
    });

    it("does not filter when the tag list is empty after trimming", async () => {
      httpMock.mockResolvedValue({ candidates: [candidate()] });

      const result = await fetchSimilarTracks({
        track_id: "seed",
        friend_id: 1,
        tags: " , , ",
      });

      expect(result.tracks).toHaveLength(1);
    });
  });

  it("reports the filters it applied", async () => {
    httpMock.mockResolvedValue({ candidates: [] });

    const result = await fetchSimilarTracks({
      track_id: "seed",
      friend_id: 1,
      era: "1990s",
      country: "us",
      tags: "melodic, warm",
    });

    expect(result.filters).toEqual({
      era: "1990s",
      country: "us",
      tags: ["melodic", "warm"],
    });
  });

  it("leaves filters undefined when none were given", async () => {
    httpMock.mockResolvedValue({ candidates: [] });

    const result = await fetchSimilarTracks({ track_id: "seed", friend_id: 1 });

    expect(result.filters).toEqual({
      era: undefined,
      country: undefined,
      tags: undefined,
    });
  });
});

describe("searchTracks", () => {
  it("omits the query string entirely when nothing is set", async () => {
    await searchTracks({});

    expect(httpMock).toHaveBeenCalledWith("/api/tracks/search", GET_NO_STORE);
  });

  it("forwards every supported parameter", async () => {
    await searchTracks({ q: "blue", limit: 20, offset: 40, filter: "bpm > 100" });

    const params = calledParams();
    expect(params.get("q")).toBe("blue");
    expect(params.get("limit")).toBe("20");
    expect(params.get("offset")).toBe("40");
    expect(params.get("filter")).toBe("bpm > 100");
  });

  it("includes a zero offset but omits an empty query", async () => {
    await searchTracks({ q: "", offset: 0 });

    const params = calledParams();
    expect(params.has("q")).toBe(false);
    expect(params.get("offset")).toBe("0");
  });

  it("includes a zero limit", async () => {
    await searchTracks({ limit: 0 });

    expect(calledParams().get("limit")).toBe("0");
  });
});

describe("fetchPlaylistCounts", () => {
  it("returns an empty map for an empty ref list", async () => {
    await expect(fetchPlaylistCounts([])).resolves.toEqual({});
    expect(httpMock).not.toHaveBeenCalled();
  });

  it("returns an empty map for a nullish ref list", async () => {
    await expect(
      fetchPlaylistCounts(null as unknown as { track_id: string; friend_id: number }[])
    ).resolves.toEqual({});
    expect(httpMock).not.toHaveBeenCalled();
  });

  it("posts the refs under track_refs", async () => {
    const refs = [{ track_id: "t1", friend_id: 1 }];

    await fetchPlaylistCounts(refs);

    expect(httpMock).toHaveBeenCalledWith("/api/tracks/playlist_counts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ track_refs: refs }),
    });
  });
});

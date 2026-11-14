import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Album, Playlist, Track } from "@groovenet/client";
import {
  collectEmbeddingEvalSnapshot,
  collectLyrics,
  evalAlbum,
  evalTrack,
  exportEmbeddingEvalSnapshot,
  type EvalExportClient,
} from "./embeddingEvalExport.js";

const track = (id: string) =>
  ({
    track_id: id,
    friend_id: 6,
    release_id: "a",
    title: id,
    artist: "Artist",
    album: "Album",
    year: "1974",
    notes: "Useful context",
    local_tags: "cumbia",
    audio_file_genre: ["Música tropical"],
    local_audio_url: "/private/audio.mp3",
  }) as Track;
const album = {
  release_id: "a",
  friend_id: 6,
  country: "Peru",
  label: "Label",
  genres: ["Latin"],
  styles: ["Cumbia"],
} as Album;
const playlist = {
  id: 1,
  name: "Set",
  tracks: [
    { track_id: "t1", friend_id: 6, position: 1 },
    { track_id: "other", friend_id: 7, position: 2 },
    { track_id: "missing", friend_id: 6, position: 3 },
  ],
} as Playlist;

function client(): EvalExportClient {
  return {
    searchTracks: vi.fn(async ({ offset }) => ({
      tracks: offset === 0 ? [track("t1"), track("t2")] : [],
      estimatedTotalHits: 2,
      offset,
      limit: 250,
      processingTimeMs: 1,
    })),
    searchAlbums: vi.fn(async ({ offset }) => ({
      hits: offset === 0 ? [album] : [],
      estimatedTotalHits: 1,
      offset,
      limit: 250,
      query: "",
      sort: "created_at:desc",
    })),
    listPlaylists: vi.fn(async () => [playlist]),
    getTrackLyrics: vi.fn(async (id: string) =>
      id === "t1" ? { text: "la la la", source: "embedded" as const, updated_at: "x" } : null,
    ),
  };
}

describe("offline embedding evaluation export", () => {
  it("exports only required metadata and matching playlist references", async () => {
    const api = client();
    const result = await collectEmbeddingEvalSnapshot(api, 6);
    expect(api.searchTracks).toHaveBeenCalledWith({
      query: "",
      limit: 250,
      offset: 0,
      filters: { friend_id: 6 },
    });
    expect(api.searchAlbums).toHaveBeenCalledWith({ friend_id: 6, limit: 250, offset: 0 });
    expect(result).toMatchObject({
      schema_version: 1,
      friend_id: 6,
      albums: [{ country: "Peru", label: "Label" }],
      playlists: [{ tracks: [{ track_id: "t1", friend_id: 6, position: 1 }] }],
    });
    expect(result.tracks[0]).toMatchObject({
      notes: "Useful context",
      local_tags: "cumbia",
      audio_file_genre: ["Música tropical"],
    });
    expect(JSON.stringify(result)).not.toContain("private/audio.mp3");
  });

  it("leaves lyrics out unless asked", async () => {
    const api = client();
    const result = await collectEmbeddingEvalSnapshot(api, 6);
    expect(result.lyrics_included).toBe(false);
    expect(result.tracks[0]).not.toHaveProperty("lyrics");
    expect(api.getTrackLyrics).not.toHaveBeenCalled();
  });

  it("adds each track's lyrics, or null, when asked", async () => {
    const api = client();
    const result = await collectEmbeddingEvalSnapshot(api, 6, { lyrics: true });
    expect(result.lyrics_included).toBe(true);
    expect(result.tracks.map((t) => ("lyrics" in t ? t.lyrics : undefined))).toEqual([
      "la la la",
      null,
    ]);
    expect(api.getTrackLyrics).toHaveBeenCalledWith("t1", 6);
    expect(api.getTrackLyrics).toHaveBeenCalledWith("t2", 6);
  });

  it("treats blank lyrics as none and fails when no track has any", async () => {
    const blank = client();
    blank.getTrackLyrics = vi.fn(async () => ({
      text: "  ",
      source: "user" as const,
      updated_at: "x",
    }));
    await expect(collectLyrics(blank, 6, ["t1", "t2"])).rejects.toThrow("lyrics endpoint");
    await expect(collectLyrics(blank, 6, [])).resolves.toEqual(new Map());
    await expect(collectLyrics(blank, 6, ["t1"], 0)).rejects.toThrow("positive integer");
  });

  it("reads lyrics with bounded concurrency", async () => {
    let inFlight = 0,
      peak = 0;
    const api = client();
    api.getTrackLyrics = vi.fn(async () => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return { text: "x", source: "embedded" as const, updated_at: "x" };
    });
    const ids = Array.from({ length: 10 }, (_, i) => `t${i}`);
    expect((await collectLyrics(api, 6, ids, 3)).size).toBe(10);
    expect(peak).toBe(3);
  });

  it("preserves missing optional fields as null", () => {
    expect(
      evalTrack({
        track_id: "x",
        friend_id: 6,
        title: "",
        artist: "",
        album: "",
        year: "",
      } as Track),
    ).toMatchObject({
      release_id: null,
      composer: null,
      genres: null,
      styles: null,
      local_tags: null,
      notes: null,
    });
    expect(evalAlbum({ release_id: "a", friend_id: 6 } as Album)).toMatchObject({
      country: null,
      label: null,
      genres: null,
      styles: null,
    });
  });

  it("refuses to overwrite an existing file and restricts permissions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "eval-export-"));
    const file = join(dir, "snapshot.json");
    try {
      expect(await exportEmbeddingEvalSnapshot(client(), 6, file)).toEqual({
        tracks: 2,
        albums: 1,
        playlists: 1,
      });
      expect(JSON.parse(await readFile(file, "utf8")).tracks).toHaveLength(2);
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      const withLyrics = join(dir, "lyrics.json");
      expect(await exportEmbeddingEvalSnapshot(client(), 6, withLyrics, { lyrics: true })).toEqual({
        tracks: 2,
        albums: 1,
        playlists: 1,
        with_lyrics: 1,
      });
      expect((await stat(withLyrics)).mode & 0o777).toBe(0o600);
      await expect(exportEmbeddingEvalSnapshot(client(), 6, file)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects malformed responses, duplicate pages and cross-friend data", async () => {
    await expect(collectEmbeddingEvalSnapshot(client(), 0)).rejects.toThrow("positive integer");
    const malformed = client();
    malformed.searchTracks = vi.fn(async () => ({ estimatedTotalHits: 1 }) as never);
    await expect(collectEmbeddingEvalSnapshot(malformed, 6)).rejects.toThrow(
      "Unexpected track search response",
    );
    const wrongFriend = client();
    wrongFriend.searchTracks = vi.fn(
      async () => ({ tracks: [{ ...track("t1"), friend_id: 7 }], estimatedTotalHits: 1 }) as never,
    );
    await expect(collectEmbeddingEvalSnapshot(wrongFriend, 6)).rejects.toThrow(
      "another friend's track",
    );
    const duplicate = client();
    duplicate.searchTracks = vi.fn(
      async () => ({ tracks: [track("t1"), track("t1")], estimatedTotalHits: 2 }) as never,
    );
    await expect(collectEmbeddingEvalSnapshot(duplicate, 6)).rejects.toThrow("Duplicate tracks");
  });

  it("rejects incomplete or cross-friend album pages and malformed playlists", async () => {
    const api = client();
    api.searchAlbums = vi.fn(async () => ({ hits: undefined, estimatedTotalHits: 1 }) as never);
    await expect(collectEmbeddingEvalSnapshot(api, 6)).rejects.toThrow(
      "Unexpected album search response",
    );
    api.searchAlbums = vi.fn(async () => ({ hits: [], estimatedTotalHits: 1 }) as never);
    await expect(collectEmbeddingEvalSnapshot(api, 6)).rejects.toThrow(
      "Album search returned an incomplete page",
    );
    api.searchAlbums = vi.fn(
      async () => ({ hits: [{ ...album, friend_id: 7 }], estimatedTotalHits: 1 }) as never,
    );
    await expect(collectEmbeddingEvalSnapshot(api, 6)).rejects.toThrow("another friend's album");
    api.searchAlbums = vi.fn(
      async () => ({ hits: [album, album], estimatedTotalHits: 2 }) as never,
    );
    await expect(collectEmbeddingEvalSnapshot(api, 6)).rejects.toThrow("Duplicate albums");
    api.searchAlbums = vi.fn(
      async ({ offset }) => ({ hits: offset === 0 ? [album] : [], estimatedTotalHits: 2 }) as never,
    );
    await expect(collectEmbeddingEvalSnapshot(api, 6)).rejects.toThrow(
      "Album search returned an incomplete page",
    );
    api.searchAlbums = vi.fn(
      async () => ({ hits: [album, album], estimatedTotalHits: 1 }) as never,
    );
    await expect(collectEmbeddingEvalSnapshot(api, 6)).rejects.toThrow("Album count changed");
    api.searchAlbums = client().searchAlbums;
    api.listPlaylists = vi.fn(async () => [{ id: 1, name: "Broken" }] as never);
    await expect(collectEmbeddingEvalSnapshot(api, 6)).rejects.toThrow("no track list");
    api.listPlaylists = vi.fn(async () => ({}) as never);
    await expect(collectEmbeddingEvalSnapshot(api, 6)).rejects.toThrow(
      "Unexpected playlist response",
    );
  });

  it("paginates and fails rather than saving partial data", async () => {
    const api = client();
    api.searchTracks = vi.fn(async ({ offset }) => ({
      tracks: offset === 0 ? [track("t1")] : [track("t2")],
      estimatedTotalHits: 2,
      offset,
      limit: 250,
      processingTimeMs: 0,
    }));
    expect((await collectEmbeddingEvalSnapshot(api, 6)).tracks).toHaveLength(2);
    expect(api.searchTracks).toHaveBeenCalledTimes(2);
    api.searchTracks = vi.fn(async ({ offset }) => ({
      tracks: offset === 0 ? [track("t1")] : [],
      estimatedTotalHits: 2,
      offset,
      limit: 250,
      processingTimeMs: 0,
    }));
    await expect(collectEmbeddingEvalSnapshot(api, 6)).rejects.toThrow("incomplete page");
    api.searchTracks = vi.fn(async () => ({
      tracks: [track("t1"), track("t2")],
      estimatedTotalHits: 1,
      offset: 0,
      limit: 250,
      processingTimeMs: 0,
    }));
    await expect(collectEmbeddingEvalSnapshot(api, 6)).rejects.toThrow("Track count changed");
  });
});

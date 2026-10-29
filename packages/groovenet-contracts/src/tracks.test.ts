import { describe, expect, it } from "vitest";
import {
  trackAudioMetadataSchema,
  trackDeleteResponseSchema,
  trackEssentiaSchema,
  trackExtractEmbeddedCoverResponseSchema,
  trackGenreSchema,
  trackJsonSchemas,
  trackPlaylistCountsRequestSchema,
  trackPlaylistCountsResponseSchema,
  trackPlaylistsResponseSchema,
  trackSchema,
  trackSearchModeSchema,
  trackSearchQuerySchema,
  trackSearchResponseSchema,
} from "./tracks.js";

const genre = {
  id: "5b2d6f3a-7c1e-4d0a-9f2e-3a1b2c3d4e5f",
  name: "Cumbia",
  slug: "cumbia",
  parent_id: null,
  parent_name: null,
};
const track = { track_id: "t1", friend_id: 1, title: "A", artist: "B", album: "C" };

describe("track contracts", () => {
  it("keeps unknown database columns and accepts every nullable variant", () => {
    const parsed = trackSchema.parse({
      ...track,
      bpm: "124.5",
      key: null,
      year: 1974,
      danceability: "0.8",
      track_genres: [genre],
      descriptors: ["dusty"],
      deleted_at: null,
      extra_column: 7,
    });
    expect(parsed).toMatchObject({ extra_column: 7, bpm: "124.5", year: 1974 });
    expect(trackSchema.parse({ ...track, bpm: 120, year: "1974", position: "A1" }).bpm).toBe(120);
  });

  it("requires the identifying fields and valid genre links", () => {
    expect(trackSchema.safeParse({ ...track, friend_id: undefined }).success).toBe(false);
    expect(
      trackSchema.safeParse({ ...track, track_genres: [{ ...genre, id: "nope" }] }).success,
    ).toBe(false);
    expect(
      trackGenreSchema.parse({ ...genre, parent_id: genre.id, parent_name: "Latin" }).parent_name,
    ).toBe("Latin");
  });

  it("validates search modes, queries and results", () => {
    for (const mode of ["lexical", "semantic", "hybrid"])
      expect(trackSearchModeSchema.parse(mode)).toBe(mode);
    expect(trackSearchModeSchema.safeParse("fuzzy").success).toBe(false);
    expect(
      trackSearchQuerySchema.parse({ q: "x", mode: "hybrid", genre: ["a"], star_rating: 3 }).mode,
    ).toBe("hybrid");
    expect(trackSearchQuerySchema.safeParse({ star_rating: 6 }).success).toBe(false);
    expect(
      trackSearchQuerySchema.safeParse({ genre: Array.from({ length: 21 }, (_, i) => `g${i}`) })
        .success,
    ).toBe(false);

    const meta = { estimatedTotalHits: 1, offset: 0, limit: 20, processingTimeMs: 3 };
    expect(trackSearchResponseSchema.parse({ ...meta, hits: [track] }).hits).toHaveLength(1);
    const widened = trackSearchResponseSchema.parse({
      ...meta,
      hits: [],
      mode: "hybrid",
      degraded: true,
      added_genres: [{ id: genre.id, name: genre.name, slug: genre.slug }],
    });
    expect(widened.degraded).toBe(true);
    expect(
      trackSearchResponseSchema.safeParse({ ...meta, hits: [{ title: "no ids" }] }).success,
    ).toBe(false);
  });

  it("validates playlist counts, memberships and per-track payloads", () => {
    expect(
      trackPlaylistCountsRequestSchema.parse({ track_refs: [{ track_id: "t", friend_id: 1 }] })
        .track_refs,
    ).toHaveLength(1);
    expect(
      trackPlaylistCountsRequestSchema.safeParse({ track_refs: [{ track_id: "", friend_id: 1 }] })
        .success,
    ).toBe(false);
    expect(trackPlaylistCountsResponseSchema.parse({ "t:1": 2 })).toEqual({ "t:1": 2 });
    expect(trackPlaylistsResponseSchema.parse({})).toEqual({});
    expect(
      trackPlaylistsResponseSchema.parse({ playlists: [{ id: 1, name: "n", position: 0 }] })
        .playlists,
    ).toHaveLength(1);
    expect(
      trackDeleteResponseSchema.parse({ success: true, track_id: "t", friend_id: 1 }).success,
    ).toBe(true);
    expect(
      trackEssentiaSchema.parse({ track_id: "t", friend_id: 1, file_path: "/a", data: { bpm: 1 } })
        .data,
    ).toEqual({ bpm: 1 });
    expect(
      trackExtractEmbeddedCoverResponseSchema.parse({
        success: true,
        audio_file_album_art_url: "/u",
        message: "m",
        extra: 1,
      }),
    ).toMatchObject({ extra: 1 });
  });

  it("validates audio metadata with and without an embedded cover", () => {
    const base = {
      track_id: "t",
      friend_id: 1,
      local_audio_url: "/a.flac",
      has_embedded_cover: false,
      probe: {},
    };
    expect(
      trackAudioMetadataSchema.parse({ ...base, embedded_cover: null }).embedded_cover,
    ).toBeNull();
    const withCover = trackAudioMetadataSchema.parse({
      ...base,
      has_embedded_cover: true,
      embedded_cover: {
        index: 1,
        codec_name: "mjpeg",
        width: 500,
        height: 500,
        pix_fmt: "yuvj444p",
        disposition: 1,
      },
    });
    expect(withCover.embedded_cover).toMatchObject({ width: 500, disposition: 1 });
  });

  it("publishes JSON Schema components", () => {
    expect(trackJsonSchemas.TrackSearchMode).toMatchObject({
      enum: ["lexical", "semantic", "hybrid"],
    });
    expect(trackJsonSchemas.Track).toMatchObject({ type: "object", additionalProperties: {} });
    expect(trackJsonSchemas.Track.required).toEqual([
      "track_id",
      "friend_id",
      "title",
      "artist",
      "album",
    ]);
  });
});

import {
  audioMetadataBackfillRequestSchema,
  audioMetadataBackfillRunSchema,
  embeddedTagsBackfillRequestSchema,
  embeddedTagsBackfillRunSchema,
  trackAudioFileFieldsSchema,
} from "./tracks.js";
import { describe, expect, it } from "vitest";
import {
  trackAnalyzeAsyncRequestSchema,
  trackAnalyzeAsyncResponseSchema,
  trackAudioMetadataSchema,
  trackDeleteResponseSchema,
  trackEmbeddingPreviewSchema,
  trackEmbeddingPreviewTypeSchema,
  trackEssentiaSchema,
  trackExtractEmbeddedCoverRequestSchema,
  trackExtractEmbeddedCoverResponseSchema,
  trackFixDurationRequestSchema,
  trackFixDurationResponseSchema,
  trackGenreFacetsResponseSchema,
  trackGenreSchema,
  trackJsonSchemas,
  trackPlaylistCountsRequestSchema,
  trackPlaylistCountsResponseSchema,
  trackPlaylistsResponseSchema,
  trackPreferredDownloaderSchema,
  trackRestoreResponseSchema,
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

  it("validates the extract-cover body", () => {
    expect(trackExtractEmbeddedCoverRequestSchema.parse({ friend_id: 2 })).toEqual({
      friend_id: 2,
    });
    expect(trackExtractEmbeddedCoverRequestSchema.safeParse({ friend_id: 2.5 }).success).toBe(
      false,
    );
    expect(trackExtractEmbeddedCoverRequestSchema.safeParse({}).success).toBe(false);
    expect(trackExtractEmbeddedCoverRequestSchema.safeParse({ friend_id: "2" }).success).toBe(
      false,
    );
  });

  it("restores a track with its full entity", () => {
    const restored = trackRestoreResponseSchema.parse({
      success: true,
      track_id: "t1",
      friend_id: 1,
      track: { ...track, deleted_at: null, extra: 1 },
    });
    expect(restored.track).toMatchObject({ extra: 1, deleted_at: null });
    expect(
      trackRestoreResponseSchema.safeParse({ success: true, track_id: "t1", friend_id: 1 }).success,
    ).toBe(false);
  });

  it("lists every embedding preview type and discriminates the preview by it", () => {
    expect(trackEmbeddingPreviewTypeSchema.options).toEqual(["identity", "audio_vibe", "context"]);
    const identity = {
      title: "A",
      artist: "B",
      album: "C",
      era: "1970s",
      country: "Colombia",
      labels: [],
      composers: [],
      genres: ["Cumbia"],
      styles: [],
      tags: [],
    };
    const vibe = {
      bpm: "120",
      bpmRange: "mid",
      key: "A minor",
      camelot: "8A",
      danceability: "high",
      energy: "high",
      dominantMood: "happy",
      moodProfile: "happy",
      vibeDescriptors: ["warm"],
      acoustic: "low",
    };
    expect(
      trackEmbeddingPreviewSchema.parse({ type: "identity", text: "t", data: identity }).type,
    ).toBe("identity");
    expect(
      trackEmbeddingPreviewSchema.parse({ type: "context", text: "t", data: identity }).type,
    ).toBe("context");
    expect(
      trackEmbeddingPreviewSchema.parse({ type: "audio_vibe", text: "t", data: vibe }).type,
    ).toBe("audio_vibe");
    expect(
      trackEmbeddingPreviewSchema.safeParse({ type: "audio_vibe", text: "t", data: identity })
        .success,
    ).toBe(false);
    expect(
      trackEmbeddingPreviewSchema.safeParse({ type: "other", text: "t", data: {} }).success,
    ).toBe(false);
  });

  it("validates analyze-async requests and responses", () => {
    expect(trackPreferredDownloaderSchema.options).toEqual(["freyr", "spotdl", "yt-dlp", "scdl"]);
    const parsed = trackAnalyzeAsyncRequestSchema.parse({
      track_id: "t1",
      friend_id: 1,
      apple_music_url: null,
      preferred_downloader: "yt-dlp",
      title: "A",
      artist: "B",
      extra: true,
    });
    expect(parsed).toMatchObject({ apple_music_url: null, preferred_downloader: "yt-dlp" });
    expect(parsed).not.toHaveProperty("extra");
    expect(
      trackAnalyzeAsyncRequestSchema.safeParse({
        track_id: "t1",
        friend_id: 1,
        preferred_downloader: "curl",
      }).success,
    ).toBe(false);
    expect(trackAnalyzeAsyncRequestSchema.safeParse({ track_id: "", friend_id: 1 }).success).toBe(
      false,
    );
    expect(
      trackAnalyzeAsyncResponseSchema.safeParse({ success: true, jobId: "j", message: "m" })
        .success,
    ).toBe(true);
    expect(trackAnalyzeAsyncResponseSchema.safeParse({ success: true, jobId: "j" }).success).toBe(
      false,
    );
  });

  it("validates fix-duration requests and responses", () => {
    expect(
      trackFixDurationRequestSchema.parse({ track_id: "t", friend_id: 1, local_audio_url: null }),
    ).toMatchObject({ local_audio_url: null });
    expect(trackFixDurationRequestSchema.safeParse({ track_id: "t" }).success).toBe(false);
    expect(trackFixDurationResponseSchema.parse({ success: true, jobId: "j" }).jobId).toBe("j");
  });

  it("validates genre facets", () => {
    const id = "5b2d6f3a-7c1e-4d0a-9f2e-3a1b2c3d4e5f";
    expect(
      trackGenreFacetsResponseSchema.parse({ genres: [{ id, track_count: 3 }] }).genres,
    ).toHaveLength(1);
    expect(
      trackGenreFacetsResponseSchema.safeParse({ genres: [{ id, track_count: 1.5 }] }).success,
    ).toBe(false);
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

  it("publishes the new components with their enums and input shapes", () => {
    expect(trackJsonSchemas.TrackEmbeddingPreviewType).toMatchObject({
      enum: ["identity", "audio_vibe", "context"],
    });
    expect(trackJsonSchemas.TrackAnalyzeAsyncRequest).toMatchObject({
      properties: { preferred_downloader: { enum: ["freyr", "spotdl", "yt-dlp", "scdl"] } },
      required: ["track_id", "friend_id"],
    });
    expect(trackJsonSchemas.TrackAnalyzeAsyncRequest).not.toHaveProperty(
      "additionalProperties",
      false,
    );
    expect(trackJsonSchemas.TrackGenreFacetsResponse).toMatchObject({
      properties: {
        genres: { items: { properties: { id: { type: "string", format: "uuid" } } } },
      },
    });
    for (const name of [
      "TrackRestoreResponse",
      "TrackExtractEmbeddedCoverRequest",
      "TrackEmbeddingPreview",
      "TrackAnalyzeAsyncResponse",
      "TrackFixDurationRequest",
      "TrackFixDurationResponse",
    ] as const) {
      expect(trackJsonSchemas[name], name).toBeDefined();
    }
  });
});

it("validates persisted audio fields, including pg bigint strings", () => {
  expect(
    trackAudioFileFieldsSchema.parse({
      audio_source: "upload",
      audio_size_bytes: "123456",
      audio_codec: "flac",
      audio_lossless: true,
    }),
  ).toMatchObject({ audio_source: "upload", audio_size_bytes: "123456" });
  expect(trackAudioFileFieldsSchema.safeParse({ audio_source: "spotify" }).success).toBe(false);
  expect(trackAudioFileFieldsSchema.safeParse({ audio_sample_rate: -1 }).success).toBe(false);
});

describe("audio metadata backfill contracts (#1049)", () => {
  it("accepts an empty request and rejects a non-integer friend", () => {
    expect(audioMetadataBackfillRequestSchema.parse({})).toEqual({});
    expect(audioMetadataBackfillRequestSchema.parse({ friend_id: 2, force: true })).toEqual({
      friend_id: 2,
      force: true,
    });
    expect(audioMetadataBackfillRequestSchema.safeParse({ friend_id: 1.5 }).success).toBe(false);
  });

  it("describes a run and publishes both shapes", () => {
    const run = {
      run_id: "r1",
      total: 3,
      probed: 1,
      skipped: 1,
      missing_files: 1,
      probe_failures: 0,
      sources: { apple_music: 1, youtube: 0, soundcloud: 0, upload: 0, unknown: 0 },
      weak_youtube_hints: 0,
      errors: [],
      started_at: 1,
      updated_at: 2,
      complete: true,
    };
    expect(audioMetadataBackfillRunSchema.parse(run)).toEqual(run);
    expect(trackJsonSchemas).toHaveProperty("AudioMetadataBackfillRequest");
    expect(trackJsonSchemas).toHaveProperty("AudioMetadataBackfillRun");
  });
});

describe("embedded tags contracts (#673)", () => {
  it("accepts an empty request and rejects a non-integer friend", () => {
    expect(embeddedTagsBackfillRequestSchema.parse({})).toEqual({});
    expect(embeddedTagsBackfillRequestSchema.safeParse({ friend_id: 1.5 }).success).toBe(false);
  });

  it("describes a run and publishes both shapes", () => {
    const run = {
      run_id: "r1",
      total: 3,
      read: 2,
      skipped: 1,
      missing_files: 0,
      read_failures: 0,
      with_composer: 2,
      with_genre: 2,
      with_lyrics: 0,
      errors: [],
      started_at: 1,
      updated_at: 2,
      complete: true,
    };
    expect(embeddedTagsBackfillRunSchema.parse(run)).toEqual(run);
    expect(trackJsonSchemas).toHaveProperty("EmbeddedTagsBackfillRequest");
    expect(trackJsonSchemas).toHaveProperty("EmbeddedTagsBackfillRun");
  });

  it("carries the file's genre on a track, apart from local_tags, and never lyrics", () => {
    const track = trackSchema.parse({
      track_id: "t",
      friend_id: 1,
      title: "T",
      artist: "A",
      album: null,
      audio_file_genre: ["Música tropical"],
    });
    expect(track.audio_file_genre).toEqual(["Música tropical"]);
    expect(trackJsonSchemas.Track).not.toHaveProperty("properties.lyrics");
  });
});

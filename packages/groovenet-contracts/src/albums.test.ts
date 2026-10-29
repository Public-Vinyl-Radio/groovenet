import { describe, expect, it } from "vitest";
import {
  albumArtMatchStatusSchema,
  albumArtSourceSchema,
  albumArtworkStateSchema,
  albumDeleteResponseSchema,
  albumDetailSchema,
  albumJsonSchemas,
  albumPlayableStructureSchema,
  albumSchema,
  albumSearchQuerySchema,
  albumSearchResponseSchema,
  albumTaxonomyOverridesSchema,
} from "./albums.js";

const album = { release_id: "123", friend_id: 1, title: "T", artist: "A" };
const uuid = "5b2d6f3a-7c1e-4d0a-9f2e-3a1b2c3d4e5f";

describe("album contracts", () => {
  it("accepts minimal and fully populated albums, keeping extra columns", () => {
    expect(albumSchema.parse(album)).toEqual(album);
    const full = albumSchema.parse({
      ...album,
      year: 1974,
      genres: null,
      styles: ["Cumbia"],
      effective_genres: ["Latin"],
      genre_override_ids: [uuid],
      style_override_ids: null,
      track_count: 8,
      album_art_source: "apple_music",
      art_match_status: "mismatch",
      art_match_distance: 14,
      purchase_price: 12.5,
      extra_column: true,
    });
    expect(full).toMatchObject({ extra_column: true, album_art_source: "apple_music" });
    expect(albumSchema.safeParse({ ...album, genre_override_ids: ["not-a-uuid"] }).success).toBe(
      false,
    );
    expect(albumSchema.safeParse({ ...album, album_art_source: "other" }).success).toBe(false);
  });

  it("documents taxonomy override semantics: omitted, null and empty", () => {
    expect(albumTaxonomyOverridesSchema.parse({})).toEqual({});
    expect(
      albumTaxonomyOverridesSchema.parse({ genre_override_ids: null }).genre_override_ids,
    ).toBeNull();
    expect(
      albumTaxonomyOverridesSchema.parse({ style_override_ids: [] }).style_override_ids,
    ).toEqual([]);
    expect(
      albumTaxonomyOverridesSchema.safeParse({ genre_override_ids: Array(101).fill(uuid) }).success,
    ).toBe(false);
  });

  it("validates search query, results and detail", () => {
    expect(
      albumSearchQuerySchema.parse({ q: "jazz", missing_audio: true, genre: ["latin"] })
        .missing_audio,
    ).toBe(true);
    expect(albumSearchQuerySchema.safeParse({ offset: -1 }).success).toBe(false);
    const response = {
      hits: [album],
      estimatedTotalHits: 1,
      offset: 0,
      limit: 20,
      query: "",
      sort: "created_at:desc",
    };
    expect(albumSearchResponseSchema.parse(response).hits).toHaveLength(1);
    expect(
      albumSearchResponseSchema.parse({
        ...response,
        added_genres: [{ id: uuid, name: "Latin", slug: "latin" }],
      }).added_genres,
    ).toHaveLength(1);
    expect(
      albumDetailSchema.parse({
        album,
        tracks: [{ track_id: "t", friend_id: 1, title: "x", artist: "a", album: "T" }],
      }).tracks,
    ).toHaveLength(1);
    expect(albumDeleteResponseSchema.parse({ success: true }).success).toBe(true);
  });

  it("validates artwork state across provenance variants", () => {
    const state = {
      release_id: "1",
      friend_id: 1,
      current_url: null,
      source: null,
      discogs_art_url: null,
      apple_music_art_url: null,
      art_match_status: null,
      art_match_distance: null,
      has_local_audio: false,
    };
    expect(albumArtworkStateSchema.parse(state).source).toBeNull();
    expect(
      albumArtworkStateSchema.parse({
        ...state,
        source: "upload",
        art_match_status: "no_candidate",
        art_match_distance: 3,
      }).source,
    ).toBe("upload");
    for (const v of ["discogs", "apple_music", "upload"])
      expect(albumArtSourceSchema.parse(v)).toBe(v);
    for (const v of ["matched", "mismatch", "no_reference", "no_candidate"])
      expect(albumArtMatchStatusSchema.parse(v)).toBe(v);
    expect(albumArtMatchStatusSchema.safeParse("maybe").success).toBe(false);
  });

  it("validates the playable structure with numeric and null positions", () => {
    const parsed = albumPlayableStructureSchema.parse({
      album,
      sides: [
        {
          side_key: "A",
          side_label: "Side A",
          ordinal: 1,
          track_count: 2,
          tracks: [
            {
              track_id: "1",
              friend_id: 1,
              position: "A1",
              title: "x",
              artist: "a",
              duration_seconds: 200,
            },
            { track_id: "2", friend_id: 1, position: null, title: "y", artist: "a" },
          ],
        },
      ],
    });
    expect(parsed.sides[0]?.tracks[0]).toMatchObject({ duration_seconds: 200 });
    expect(
      albumPlayableStructureSchema.safeParse({ album, sides: [{ side_key: "A" }] }).success,
    ).toBe(false);
  });

  it("publishes JSON Schema components", () => {
    expect(albumJsonSchemas.AlbumArtSource).toMatchObject({
      enum: ["discogs", "apple_music", "upload"],
    });
    expect(albumJsonSchemas.Album.required).toEqual(["release_id", "friend_id", "title", "artist"]);
  });
});

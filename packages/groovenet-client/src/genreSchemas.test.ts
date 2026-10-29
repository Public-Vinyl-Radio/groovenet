import { describe, expect, it } from "vitest";
import {
  trackEntitySchema,
  albumEntitySchema,
  genreSchema,
  genreTreeResponseSchema,
  genreCreateInputSchema,
  genreUpdateInputSchema,
  genreAliasInputSchema,
  genreMergeInputSchema,
  genreAliasResponseSchema,
  genreMergeResponseSchema,
  genreSimilarResponseSchema,
  genreSimilaritySignalsSchema,
} from "./schemas.js";

const id = "6df3a956-f05c-4ef2-a218-0813d0ca7c47";
const genre = { id, name: "Latin", slug: "latin", parent_id: null, source: "discogs" };
describe("genre wire schemas", () => {
  it("accepts ranked related genres, unscored fallback genres, and empty results", () => {
    const ref = { id, name: "Cumbia", slug: "cumbia", track_count: 12 };
    for (const related of [
      [],
      [ref],
      [{ ...ref, score: 1.42, signals: { taxonomy: "sibling", npmi: 0.42, shared_albums: 7 } }],
    ]) {
      const response = { genre: ref, related };
      expect(genreSimilarResponseSchema.parse(response)).toEqual(response);
    }
    for (const taxonomy of ["sibling", "parent", "child"]) {
      expect(genreSimilaritySignalsSchema.parse({ taxonomy })).toEqual({ taxonomy });
    }
    for (const signals of [
      { taxonomy: "cousin" },
      { npmi: 1.1 },
      { npmi: -1.1 },
      { shared_albums: -1 },
      { shared_albums: 1.5 },
    ]) {
      expect(genreSimilaritySignalsSchema.safeParse(signals).success).toBe(false);
    }
    expect(
      genreSimilarResponseSchema.safeParse({ genre: { ...ref, track_count: -1 }, related: [] })
        .success,
    ).toBe(false);
  });

  it("accepts nested taxonomy nodes and mutation responses", () => {
    expect(genreSchema.parse(genre)).toEqual(genre);
    const child = {
      ...genre,
      parent_id: id,
      source: "custom",
      track_count: 0,
      album_count: 0,
      children: [],
    };
    expect(
      genreTreeResponseSchema.parse({
        genres: [{ ...genre, track_count: 0, album_count: 0, children: [child] }],
      }).genres[0].children,
    ).toEqual([child]);
    expect(genreAliasResponseSchema.parse({ success: true })).toEqual({ success: true });
    expect(
      genreMergeResponseSchema.parse({ success: true, merged_genre_id: id, survivor_genre_id: id }),
    ).toMatchObject({ success: true });
  });
  it("validates a create request with a required existing-parent ID", () => {
    expect(genreCreateInputSchema.parse({ name: " Dub ", parent_id: id }).name).toBe("Dub");
    expect(genreCreateInputSchema.safeParse({ name: "Dub", parent_id: null }).success).toBe(false);
  });
  it("permits rename, re-parent or root move, and rejects empty changes", () => {
    for (const input of [{ name: "Dub" }, { parent_id: id }, { parent_id: null }])
      expect(genreUpdateInputSchema.safeParse(input).success).toBe(true);
    for (const input of [{}, { name: " " }, { parent_id: "invalid" }])
      expect(genreUpdateInputSchema.safeParse(input).success).toBe(false);
  });
  it("requires nonempty aliases and UUID merge targets", () => {
    expect(genreAliasInputSchema.parse({ alias: " Post‑punk " }).alias).toBe("Post‑punk");
    expect(genreAliasInputSchema.safeParse({ alias: " " }).success).toBe(false);
    expect(genreMergeInputSchema.parse({ target_id: id }).target_id).toBe(id);
    expect(genreMergeInputSchema.safeParse({ target_id: "invalid" }).success).toBe(false);
  });
  it("accepts a track carrying its taxonomy genres and descriptors", () => {
    const trackGenre = { id, name: "Cumbia", slug: "cumbia", parent_id: id, parent_name: "Latin" };
    const track = {
      track_id: "t1",
      friend_id: 1,
      title: "T",
      artist: "A",
      album: "B",
      track_genres: [trackGenre],
      descriptors: ["uplifting"],
    };
    expect(trackEntitySchema.parse(track)).toMatchObject({
      track_genres: [trackGenre],
      descriptors: ["uplifting"],
    });
    expect(
      trackEntitySchema.safeParse({ ...track, track_genres: [{ ...trackGenre, id: "x" }] }).success,
    ).toBe(false);
  });
  it("accepts nullable album metadata from the database", () => {
    expect(
      albumEntitySchema.parse({
        release_id: "r1",
        friend_id: 1,
        title: "Album",
        artist: "Artist",
        track_count: 1,
        year: null,
        genres: null,
        styles: null,
        album_thumbnail: null,
        date_added: null,
        date_changed: null,
      }),
    ).toMatchObject({ date_added: null, date_changed: null });
  });
});

it("preserves album source, effective values and distinct empty/reset override states", () => {
  const album = {
    release_id: "r",
    friend_id: 7,
    title: "Album",
    artist: "Artist",
    track_count: 1,
    genres: ["Latin"],
    styles: ["Cumbia"],
    effective_genres: [],
    effective_styles: ["Fusion"],
    genre_override_ids: [],
    style_override_ids: [id],
  };
  expect(albumEntitySchema.parse(album)).toEqual(album);
  expect(
    albumEntitySchema.parse({ ...album, genre_override_ids: null }).genre_override_ids,
  ).toBeNull();
  expect(
    albumEntitySchema.safeParse({ ...album, style_override_ids: ["missing-uuid"] }).success,
  ).toBe(false);
});

it("keeps effective album taxonomy separate from track taxonomy in track reads", () => {
  const track = {
    track_id: "t",
    friend_id: 7,
    title: "Song",
    artist: "Artist",
    album: "Album",
    album_genres: [],
    album_styles: ["Fusion"],
    track_genres: [],
  };
  expect(trackEntitySchema.parse(track)).toEqual(track);
});

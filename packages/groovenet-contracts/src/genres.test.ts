import { describe, expect, it } from "vitest";
import {
  genreAliasBodySchema, genreAliasResponseSchema, genreCreateBodySchema,
  genreJsonSchemas, genreMergeBodySchema, genreMergeResponseSchema,
  genreMutationResponseSchema, genrePageQuerySchema, genrePageResponseSchema,
  genreSimilarQuerySchema, genreSimilarResponseSchema, genreSourceSchema,
  genreTreeResponseSchema, genreUpdateBodySchema,
} from "./genres.js";

const id = "6df3a956-f05c-4ef2-a218-0813d0ca7c47";
const childId = "8c1d7f3e-2b6a-4d59-9f0e-3a7b5c2d1e40";
const genre = { id, name: "Latin", slug: "latin", parent_id: null, source: "discogs" };
const ref = { id, name: "Latin", slug: "latin", track_count: 3 };
const tree = { ...genre, track_count: 3, album_count: 1, children: [] };

describe("genre contracts", () => {
  it("parses recursive trees with optional aliases and rejects invalid descendants", () => {
    const response = { genres: [{ ...tree, children: [{ ...tree, id: childId, parent_id: id, aliases: ["cumbia"], children: [tree] }] }] };
    expect(genreTreeResponseSchema.parse(response)).toEqual(response);
    expect(genreTreeResponseSchema.safeParse({ genres: [{ ...tree, children: [{ ...tree, track_count: -1 }] }] }).success).toBe(false);
    expect(genreTreeResponseSchema.safeParse({ genres: [{ ...tree, id: "invalid" }] }).success).toBe(false);
    expect(genreSourceSchema.options).toEqual(["discogs", "custom"]);
    expect(genreMutationResponseSchema.safeParse({ ...genre, source: "ai" }).success).toBe(false);
  });

  it("preserves trimmed names, parent requirements and unknown-key stripping", () => {
    expect(genreCreateBodySchema.parse({ name: " Dub ", parent_id: id, extra: true })).toEqual({ name: "Dub", parent_id: id });
    expect(genreCreateBodySchema.safeParse({ name: "Dub" }).success).toBe(false);
    expect(genreCreateBodySchema.safeParse({ name: " ", parent_id: id }).success).toBe(false);
    expect(genreCreateBodySchema.safeParse({ name: "Dub", parent_id: null }).success).toBe(false);
    expect(genreAliasBodySchema.parse({ alias: " Dub " })).toEqual({ alias: "Dub" });
    expect(genreAliasBodySchema.safeParse({ alias: " " }).success).toBe(false);
    expect(genreMergeBodySchema.parse({ target_id: id })).toEqual({ target_id: id });
    expect(genreMergeBodySchema.safeParse({ target_id: "invalid" }).success).toBe(false);
  });

  it("requires an update field while allowing a null parent", () => {
    expect(genreUpdateBodySchema.parse({ name: " Dub " })).toEqual({ name: "Dub" });
    expect(genreUpdateBodySchema.parse({ parent_id: null })).toEqual({ parent_id: null });
    expect(genreUpdateBodySchema.parse({ name: "Dub", parent_id: id })).toEqual({ name: "Dub", parent_id: id });
    expect(genreUpdateBodySchema.safeParse({}).success).toBe(false);
    expect(genreUpdateBodySchema.safeParse({ extra: true }).success).toBe(false);
    expect(genreUpdateBodySchema.safeParse({ name: " " }).success).toBe(false);
  });

  it("validates mutation response ids and literal success values", () => {
    expect(genreMutationResponseSchema.parse(genre)).toEqual(genre);
    expect(genreAliasResponseSchema.parse({ success: true })).toEqual({ success: true });
    expect(genreAliasResponseSchema.safeParse({ success: false }).success).toBe(false);
    expect(genreMergeResponseSchema.parse({ success: true, merged_genre_id: id, survivor_genre_id: childId }).success).toBe(true);
    expect(genreMergeResponseSchema.safeParse({ success: true, merged_genre_id: id }).success).toBe(false);
  });

  it("accepts scored and fallback related genres with bounded similarity signals", () => {
    const response = { genre: ref, related: [ref, { ...ref, score: 1.42, signals: { taxonomy: "sibling", npmi: 0.42, shared_albums: 7 } }] };
    expect(genreSimilarResponseSchema.parse(response)).toEqual(response);
    for (const signals of [{ npmi: 1.1 }, { npmi: -1.1 }, { shared_albums: -1 }, { taxonomy: "cousin" }]) {
      expect(genreSimilarResponseSchema.safeParse({ genre: ref, related: [{ ...ref, signals }] }).success).toBe(false);
    }
  });

  it("validates page counts and retains additional database columns on top entities", () => {
    const page = {
      genre: { ...genre, aliases: [] }, ancestors: [], children: [ref], related: [ref],
      counts: { tracks: 3, albums: 1, tracks_total: 3, albums_total: 1 },
      top_tracks: [{ track_id: "t1", friend_id: 1, title: "Song", artist: "Artist", album: "Album", play_count: 2, extra_column: "kept" }],
      top_albums: [{ release_id: "r1", friend_id: 1, title: "Album", artist: "Artist", play_count: 3, extra_column: "kept" }],
    };
    expect(genrePageResponseSchema.parse(page)).toEqual(page);
    expect(genrePageResponseSchema.safeParse({ ...page, counts: { ...page.counts, tracks: -1 } }).success).toBe(false);
  });

  it("describes wire query values without coercion or defaults", () => {
    expect(genrePageQuerySchema.parse({})).toEqual({});
    expect(genrePageQuerySchema.parse({ friend_id: 3 })).toEqual({ friend_id: 3 });
    expect(genrePageQuerySchema.safeParse({ friend_id: "3" }).success).toBe(false);
    expect(genreSimilarQuerySchema.parse({})).toEqual({});
    expect(genreSimilarQuerySchema.parse({ limit: 3 })).toEqual({ limit: 3 });
    for (const limit of [0, -1, 1.5, "3"]) expect(genreSimilarQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it("publishes recursive component references and permissive input schemas", () => {
    expect(genreJsonSchemas.GenreTreeNode).toMatchObject({ properties: { children: { items: { $ref: "#/components/schemas/GenreTreeNode" } } } });
    expect(genreJsonSchemas.GenreTreeResponse).toMatchObject({ properties: { genres: { items: { $ref: "#/components/schemas/GenreTreeNode" } } } });
    for (const schema of Object.values(genreJsonSchemas)) expect(schema).not.toHaveProperty("$id");
    for (const name of ["GenreCreateInput", "GenreUpdateInput", "GenreAliasInput", "GenreMergeInput"]) {
      expect(genreJsonSchemas[name]).not.toHaveProperty("additionalProperties", false);
    }
  });
});

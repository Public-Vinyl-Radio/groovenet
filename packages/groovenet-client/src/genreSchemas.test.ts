import { describe, expect, it } from "vitest";
import { trackEntitySchema, albumEntitySchema, genreSchema, genreTreeResponseSchema, genreCreateInputSchema, genreUpdateInputSchema, genreAliasInputSchema, genreMergeInputSchema, genreAliasResponseSchema, genreMergeResponseSchema } from "./schemas.js";

const id = "6df3a956-f05c-4ef2-a218-0813d0ca7c47";
const genre = { id, name: "Latin", slug: "latin", parent_id: null, source: "discogs" };
describe("genre wire schemas", () => {
  it("accepts nested taxonomy nodes and mutation responses", () => {
    expect(genreSchema.parse(genre)).toEqual(genre);
    const child = { ...genre, parent_id: id, source: "custom", track_count: 0, album_count: 0, children: [] };
    expect(genreTreeResponseSchema.parse({ genres: [{ ...genre, track_count: 0, album_count: 0, children: [child] }] }).genres[0].children).toEqual([child]);
    expect(genreAliasResponseSchema.parse({ success: true })).toEqual({ success: true });
    expect(genreMergeResponseSchema.parse({ success: true, merged_genre_id: id, survivor_genre_id: id })).toMatchObject({ success: true });
  });
  it("validates a create request with a required existing-parent ID", () => {
    expect(genreCreateInputSchema.parse({ name: " Dub ", parent_id: id }).name).toBe("Dub");
    expect(genreCreateInputSchema.safeParse({ name: "Dub", parent_id: null }).success).toBe(false);
  });
  it("permits rename, re-parent or root move, and rejects empty changes", () => {
    for (const input of [{ name: "Dub" }, { parent_id: id }, { parent_id: null }]) expect(genreUpdateInputSchema.safeParse(input).success).toBe(true);
    for (const input of [{}, { name: " " }, { parent_id: "invalid" }]) expect(genreUpdateInputSchema.safeParse(input).success).toBe(false);
  });
  it("requires nonempty aliases and UUID merge targets", () => {
    expect(genreAliasInputSchema.parse({ alias: " Post‑punk " }).alias).toBe("Post‑punk");
    expect(genreAliasInputSchema.safeParse({ alias: " " }).success).toBe(false);
    expect(genreMergeInputSchema.parse({ target_id: id }).target_id).toBe(id);
    expect(genreMergeInputSchema.safeParse({ target_id: "invalid" }).success).toBe(false);
  });
  it("accepts a track carrying its taxonomy genres and descriptors", () => {
    const trackGenre = { id, name: "Cumbia", slug: "cumbia", parent_id: id, parent_name: "Latin" };
    const track = { track_id: "t1", friend_id: 1, title: "T", artist: "A", album: "B", track_genres: [trackGenre], descriptors: ["uplifting"] };
    expect(trackEntitySchema.parse(track)).toMatchObject({ track_genres: [trackGenre], descriptors: ["uplifting"] });
    expect(trackEntitySchema.safeParse({ ...track, track_genres: [{ ...trackGenre, id: "x" }] }).success).toBe(false);
  });
  it("accepts nullable album metadata from the database", () => {
    expect(albumEntitySchema.parse({
      release_id: "r1", friend_id: 1, title: "Album", artist: "Artist", track_count: 1,
      year: null, genres: null, styles: null, album_thumbnail: null,
      date_added: null, date_changed: null,
    })).toMatchObject({ date_added: null, date_changed: null });
  });
});

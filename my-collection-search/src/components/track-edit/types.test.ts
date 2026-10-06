import { describe, expect, it } from "vitest";
import { genreChanges, toTrackEditFormState } from "./types";
import type { TrackGenre } from "@/types/track";

const genre = (id: string): TrackGenre => ({ id, name: id, slug: id, parent_id: null, parent_name: null });

describe("genreChanges", () => {
  it("sends nothing when the selection is unchanged, so a save never wipes genres", () => {
    expect(genreChanges([genre("a")], [genre("a")])).toEqual({});
    expect(genreChanges(undefined, [])).toEqual({});
  });

  it("sends the full id list when the selection changed, including clearing it", () => {
    expect(genreChanges([genre("a")], [genre("a"), genre("b")])).toEqual({ genres: ["a", "b"] });
    expect(genreChanges([genre("a")], [])).toEqual({ genres: [] });
    expect(genreChanges(undefined, [genre("b")])).toEqual({ genres: ["b"] });
  });
});

describe("toTrackEditFormState", () => {
  it("starts from the track's genres, or none", () => {
    expect(toTrackEditFormState({ track_id: "t", friend_id: 1, track_genres: [genre("a")] }).track_genres).toEqual([
      genre("a"),
    ]);
    expect(toTrackEditFormState(null).track_genres).toEqual([]);
  });
});

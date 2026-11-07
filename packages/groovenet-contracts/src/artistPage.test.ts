import { expect, it } from "vitest";
import { artistJsonSchemas, artistPageQuerySchema, artistPageResponseSchema } from "./artists.js";

const empty = {
  artist: {
    id: 1,
    name: "Los Mirlos",
    sort_name: "Mirlos, Los",
    slug: "los-mirlos",
    discogs_artist_id: null,
    is_placeholder: false,
  },
  aliases: [],
  counts: { albums: 0, appears_on: 0, tracks: 0, spins: 0, year_min: null, year_max: null },
  albums: [],
  top_tracks: [],
  top_tracks_by: "albums",
  genres: [],
  collaborators: [],
};

it("validates an artist with nothing in the collection", () => {
  expect(artistPageResponseSchema.parse(empty)).toEqual(empty);
  expect(artistPageQuerySchema.parse({ friend_id: 3 })).toEqual({ friend_id: 3 });
  expect(artistPageQuerySchema.parse({})).toEqual({});
});

it("rejects unknown ordering labels and negative counts", () => {
  expect(artistPageResponseSchema.safeParse({ ...empty, top_tracks_by: "plays" }).success).toBe(
    false,
  );
  expect(
    artistPageResponseSchema.safeParse({ ...empty, counts: { ...empty.counts, spins: -1 } })
      .success,
  ).toBe(false);
});

it("exports a JSON schema for OpenAPI", () => {
  expect(artistJsonSchemas.ArtistPageResponse).toHaveProperty("properties");
});

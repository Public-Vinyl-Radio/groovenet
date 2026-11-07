import { expect, it } from "vitest";
import { albumSchema, albumSearchQuerySchema, albumSearchResponseSchema } from "./albums.js";
import { artistCreditRefSchema, artistFilterRefSchema } from "./artistCredits.js";
import { artistJsonSchemas, artistListQuerySchema, artistListResponseSchema } from "./artists.js";
import { trackSchema, trackSearchQuerySchema, trackSearchResponseSchema } from "./tracks.js";

const credit = {
  id: 4,
  name: "Los Mirlos",
  slug: "los-mirlos",
  is_placeholder: false,
  role: "primary",
  position: 0,
  credited_as: "Los Mirlos",
} as const;

it("validates a credit and rejects an unknown role", () => {
  expect(artistCreditRefSchema.parse(credit)).toEqual(credit);
  expect(artistCreditRefSchema.safeParse({ ...credit, role: "producer" }).success).toBe(false);
  expect(artistCreditRefSchema.safeParse({ ...credit, position: -1 }).success).toBe(false);
});

it("carries credits on tracks and albums, and leaves them optional", () => {
  const track = {
    track_id: "t1",
    friend_id: 6,
    title: "Sonido amazonico",
    artist: "Los Mirlos",
    album: null,
  };
  expect(trackSchema.parse({ ...track, artists: [credit] }).artists).toEqual([credit]);
  expect(trackSchema.parse(track).artists).toBeUndefined();
  const album = {
    release_id: "26715224",
    friend_id: 6,
    title: "The Roots Of Chicha",
    artist: "Various",
  };
  expect(albumSchema.parse({ ...album, artists: [credit] }).artists).toEqual([credit]);
  expect(albumSchema.safeParse({ ...album, artists: [{ ...credit, slug: 1 }] }).success).toBe(
    false,
  );
});

it("validates the artist list", () => {
  expect(artistListQuerySchema.parse({ q: "mirlos", limit: 10 })).toEqual({
    q: "mirlos",
    limit: 10,
  });
  expect(artistListQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  const list = {
    items: [
      {
        id: 4,
        name: "Los Mirlos",
        sort_name: "Mirlos, Los",
        slug: "los-mirlos",
        discogs_artist_id: "123",
        is_placeholder: false,
        album_count: 1,
        track_count: 3,
      },
    ],
    total: 1,
    limit: 50,
    offset: 0,
    query: "mirlos",
  };
  expect(artistListResponseSchema.parse(list)).toEqual(list);
  expect(artistJsonSchemas.ArtistListResponse).toHaveProperty("properties");
});

it("lists by index letter, and refuses anything but A to Z or #", () => {
  expect(artistListQuerySchema.parse({ letter: "M" })).toEqual({ letter: "M" });
  expect(artistListQuerySchema.parse({ letter: "#" })).toEqual({ letter: "#" });
  for (const letter of ["m", "MM", "", "1"]) {
    expect(artistListQuerySchema.safeParse({ letter }).success).toBe(false);
  }
});

it("filters track and album search by artist and echoes the artists back (#709)", () => {
  const ref = { id: 9, name: "Meridian Brothers", slug: "meridian-brothers" };
  expect(artistFilterRefSchema.parse(ref)).toEqual(ref);
  expect(trackSearchQuerySchema.parse({ artist: ["meridian-brothers"] }).artist).toEqual([
    "meridian-brothers",
  ]);
  expect(albumSearchQuerySchema.parse({ artist: ["9"] }).artist).toEqual(["9"]);
  expect(trackSearchQuerySchema.safeParse({ artist: Array(21).fill("a") }).success).toBe(false);
  const meta = { estimatedTotalHits: 0, offset: 0, limit: 20, processingTimeMs: 1, hits: [] };
  expect(
    trackSearchResponseSchema.parse({ ...meta, filter_artists: [ref] }).filter_artists,
  ).toEqual([ref]);
  expect(trackSearchResponseSchema.parse(meta).filter_artists).toBeUndefined();
  const albums = { hits: [], estimatedTotalHits: 0, offset: 0, limit: 20, query: "", sort: "" };
  expect(
    albumSearchResponseSchema.parse({ ...albums, filter_artists: [ref] }).filter_artists,
  ).toEqual([ref]);
  expect(
    albumSearchResponseSchema.safeParse({ ...albums, filter_artists: [{ ...ref, id: "9" }] })
      .success,
  ).toBe(false);
});

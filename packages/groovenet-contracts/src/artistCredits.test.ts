import { expect, it } from "vitest";
import { albumSchema } from "./albums.js";
import { artistCreditRefSchema } from "./artistCredits.js";
import { artistJsonSchemas, artistListQuerySchema, artistListResponseSchema } from "./artists.js";
import { trackSchema } from "./tracks.js";

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

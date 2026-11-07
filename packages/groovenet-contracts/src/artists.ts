import { z } from "zod";
import { albumSchema } from "./albums.js";
import { genrePageRefSchema } from "./genres.js";
import { trackSchema } from "./tracks.js";

const count = z.number().int().nonnegative();

export const artistPageQuerySchema = z.object({ friend_id: z.number().int().optional() });

/** An artist credited alongside the page's artist on the same album or track. */
export const artistCollaboratorSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
  shared_credits: count.meta({ description: "Albums and tracks both artists are credited on" }),
});

/**
 * `GET /api/artists/{slug}` (#707): the artist, and what the chosen collection
 * holds by them. Albums and tracks are whole entities so the page can hydrate
 * its stores without a second request.
 */
export const artistPageResponseSchema = z.object({
  artist: z.object({
    id: z.number().int(),
    name: z.string(),
    sort_name: z.string(),
    slug: z.string(),
    discogs_artist_id: z.string().nullable(),
    is_placeholder: z.boolean().meta({
      description: "Placeholders such as Various have no page; clients go to the album search",
    }),
  }),
  aliases: z
    .array(z.string())
    .meta({ description: "Other spellings the artist is credited under" }),
  counts: z.object({
    albums: count.meta({ description: "Albums credited to the artist on the album itself" }),
    appears_on: count.meta({ description: "Albums credited only on some of their tracks" }),
    tracks: count,
    spins: count.meta({ description: "Vinyl and digital plays of the artist's tracks" }),
    year_min: z.number().int().nullable(),
    year_max: z.number().int().nullable(),
  }),
  albums: z
    .array(
      albumSchema.extend({
        play_count: count,
        appears_on_tracks: count.meta({
          description: "Zero when the album itself is credited; else the artist's tracks on it",
        }),
        appears_on_positions: z
          .array(z.string())
          .meta({ description: "Side and position of those tracks, e.g. A2" }),
      }),
    )
    .meta({ description: "Credited albums first, then those the artist only appears on" }),
  top_tracks: z.array(trackSchema.extend({ play_count: count })),
  top_tracks_by: z.enum(["spins", "albums"]).meta({
    description: "`albums` when nothing has been played: the tracks follow album order",
  }),
  genres: z.array(genrePageRefSchema),
  collaborators: z.array(artistCollaboratorSchema),
});
export type ArtistPageQuery = z.infer<typeof artistPageQuerySchema>;
export type ArtistCollaborator = z.infer<typeof artistCollaboratorSchema>;
export type ArtistPageResponse = z.infer<typeof artistPageResponseSchema>;

export const artistJsonSchemas = {
  ArtistPageResponse: z.toJSONSchema(artistPageResponseSchema, {
    io: "input",
    // Entities are shared components; keep them inline rather than local refs.
    unrepresentable: "any",
  }),
};

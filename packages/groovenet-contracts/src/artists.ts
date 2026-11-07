import { z } from "zod";
import { albumSchema } from "./albums.js";
import { genrePageRefSchema } from "./genres.js";
import { trackSchema } from "./tracks.js";

const count = z.number().int().nonnegative();

/** `POST /api/artists/reconcile` (#705). */
export const artistReconcileRequestSchema = z
  .object({
    /** Report what would be linked, and the review queue, without writing. */
    dry_run: z.boolean().optional(),
    /** Only this friend's albums and tracks; omitted for everyone. */
    friend_id: z.number().int().min(1).nullable().optional(),
  })
  .strict();

/** One credit string that is string-only and contains a separator, so a person decides. */
export const artistReviewItemSchema = z.object({
  credited_as: z.string(),
  albums: count,
  tracks: count,
});

const linkCountsSchema = z.object({
  /** Rows with no artist credits before this run. */
  pending: count,
  /** Rows this run credited; 0 on a dry run. */
  linked: count,
  failed: count,
});

export const artistReconcileResponseSchema = z.object({
  dry_run: z.boolean(),
  friend_id: z.number().int().nullable(),
  /** Album artist strings in scope, before any linking. */
  baseline: z.object({
    albums: count,
    distinct_strings: count,
    /** Normalised names spelled more than one way. */
    spelling_groups: count,
    /** Strings ending in a Discogs-inverted `Name, The`; mid-string ones go to review. */
    inversions: count,
    various: count,
    unknown_artist: count,
  }),
  albums: linkCountsSchema,
  tracks: linkCountsSchema,
  /** Credits the pending rows get, by where they came from. */
  credits: z.object({ discogs: count, legacy: count }),
  /** How each pending credit resolves: an existing artist, or a new one. */
  artists: z.object({
    matched_by_discogs_id: count,
    matched_by_name: count,
    created: count,
  }),
  /** Every string-only credit with a separator in scope, written or pending. */
  review_queue: z.array(artistReviewItemSchema),
  errors: z.array(
    z.object({ kind: z.enum(["album", "track"]), id: z.string(), message: z.string() }),
  ),
});

export type ArtistReconcileRequest = z.infer<typeof artistReconcileRequestSchema>;
export type ArtistReviewItem = z.infer<typeof artistReviewItemSchema>;
export type ArtistReconcileResponse = z.infer<typeof artistReconcileResponseSchema>;

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
  ArtistReconcileRequest: z.toJSONSchema(artistReconcileRequestSchema),
  ArtistReconcileResponse: z.toJSONSchema(artistReconcileResponseSchema),
  ArtistPageResponse: z.toJSONSchema(artistPageResponseSchema, {
    io: "input",
    // Entities are shared components; keep them inline rather than local refs.
    unrepresentable: "any",
  }),
} as const;

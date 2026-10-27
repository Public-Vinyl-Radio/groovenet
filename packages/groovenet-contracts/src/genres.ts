import { z } from "zod";
import { trackSchema } from "./tracks.js";
import { albumSchema } from "./albums.js";

export const genreSourceSchema = z.enum(["discogs", "custom"]);
/** Taxonomy counts are direct links; page counts include subgenres. */
export const genreTreeNodeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  parent_id: z.string().uuid().nullable(),
  source: genreSourceSchema,
  track_count: z.number().int().nonnegative(),
  album_count: z.number().int().nonnegative(),
  aliases: z.array(z.string()).optional().meta({
    description: "Normalised alias keys that resolve to this genre, for matching raw Discogs spellings",
  }),
  get children(): z.ZodArray<typeof genreTreeNodeSchema> {
    return z.array(genreTreeNodeSchema);
  },
});

export const genreTreeResponseSchema = z.object({ genres: z.array(genreTreeNodeSchema) });

/** A genre as the genre page links to it (#376), with its track count, subgenres included. */
export const genrePageRefSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  track_count: z.number().int().nonnegative().meta({ description: "Tracks the genre filter returns, subgenres included" }),
});
export type GenrePageRef = z.infer<typeof genrePageRefSchema>;

/** What produced a similar-genre score (#377): a taxonomy relation, co-occurrence, or both. */
export const genreSimilaritySignalsSchema = z.object({
  taxonomy: z.enum(["sibling", "parent", "child"]).optional(),
  npmi: z.number().min(-1).max(1).optional().meta({ description: "Normalised PMI of the two genres’ album co-occurrence" }),
  shared_albums: z.number().int().nonnegative().optional().meta({ description: "Distinct albums tagged with both genres" }),
});
export type GenreSimilaritySignals = z.infer<typeof genreSimilaritySignalsSchema>;

/** A related genre (#377): stored similarity when it exists, else the sibling stand-in it falls back to. */
export const genreRelatedRefSchema = genrePageRefSchema.extend({
  score: z.number().optional().meta({ description: "Absent for a sibling-fallback entry, which has no stored score" }),
  signals: genreSimilaritySignalsSchema.optional(),
});
export type GenreRelatedRef = z.infer<typeof genreRelatedRefSchema>;

export const genrePageQuerySchema = z.object({ friend_id: z.number().int().optional() });

/** `GET /api/genres/{id}`: one genre's place in the taxonomy and in the collection (#376). */
export const genrePageResponseSchema = z.object({
  genre: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    parent_id: z.string().uuid().nullable(),
    source: genreSourceSchema,
    aliases: z.array(z.string()),
  }),
  /** Root first, ending with the genre's parent. */
  ancestors: z.array(z.object({ id: z.string().uuid(), name: z.string(), slug: z.string() })).meta({ description: "Root first, ending with the parent" }),
  children: z.array(genrePageRefSchema),
  /** From the genre_similarity table (#377), falling back to taxonomy siblings when it has no rows yet. */
  related: z.array(genreRelatedRefSchema).meta({ description: "From the genre_similarity table, falling back to taxonomy siblings when it has no rows yet" }),
  counts: z.object({
    tracks: z.number().int().nonnegative().meta({ description: "Tracks linked to this genre itself" }),
    albums: z.number().int().nonnegative().meta({ description: "Albums whose Discogs genres or styles name this genre" }),
    tracks_total: z.number().int().nonnegative().meta({ description: "Tracks the genre filter returns" }),
    albums_total: z.number().int().nonnegative().meta({ description: "Albums the genre filter returns" }),
  }),
  stats: z.object({
    bpm_min: z.number().positive().nullable(),
    bpm_max: z.number().positive().nullable(),
    added_this_year: z.number().int().nonnegative().meta({ description: "Matching tracks with collection date_added in the current UTC calendar year; never import/created_at time" }),
    year: z.number().int(),
    playable_tracks: z.number().int().nonnegative().meta({ description: "Matching live tracks with a nonblank local_audio_url" }),
    bpm_histogram: z.array(z.object({
      min: z.number().nonnegative(),
      max: z.number().positive(),
      count: z.number().int().nonnegative(),
    })).meta({ description: "10 BPM bins [min, max), over all matching live tracks with finite positive BPM; empty bins omitted" }),
  }),
  top_tracks: z.array(trackSchema.extend({ play_count: z.number().int().nonnegative() })).meta({ description: "Most played first, then most recently added" }),
  top_albums: z.array(albumSchema.extend({ play_count: z.number().int().nonnegative() })).meta({ description: "Most played first, then most recently added" }),
});
export type GenrePageResponse = z.infer<typeof genrePageResponseSchema>;

/** `GET /api/genres/{id}/similar` (#377): the same ranking `related` reads on the genre page, standalone. */
export const genreSimilarQuerySchema = z.object({
  limit: z.number().int().positive().optional(),
});

export const genreSimilarResponseSchema = z.object({
  genre: genrePageRefSchema,
  related: z.array(genreRelatedRefSchema),
});
export type GenreSimilarResponse = z.infer<typeof genreSimilarResponseSchema>;

export const genreParamsSchema = z.object({ id: z.string().uuid() });
export const genreCreateBodySchema = z.object({
  name: z.string().trim().min(1),
  parent_id: z.string().uuid(),
});
export const genreUpdateBodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  parent_id: z.string().uuid().nullable().optional(),
}).refine((value) => value.name !== undefined || value.parent_id !== undefined, {
  message: "name or parent_id is required",
}).meta({ description: "At least one of name or parent_id is required; null parent_id moves the genre to the root" });
export const genreAliasBodySchema = z.object({ alias: z.string().trim().min(1) });
export const genreMergeBodySchema = z.object({ target_id: z.string().uuid() });
export const genreMutationResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  parent_id: z.string().uuid().nullable(),
  source: genreSourceSchema,
});

export const genreAliasResponseSchema = z.object({ success: z.literal(true) });
export const genreMergeResponseSchema = z.object({
  success: z.literal(true),
  merged_genre_id: z.string().uuid(),
  survivor_genre_id: z.string().uuid(),
});

export type GenreSource = z.infer<typeof genreSourceSchema>;
export type Genre = z.infer<typeof genreMutationResponseSchema>;
export type GenreTreeNode = z.infer<typeof genreTreeNodeSchema>;
export type GenreTreeResponse = z.infer<typeof genreTreeResponseSchema>;
export type GenrePageQuery = z.infer<typeof genrePageQuerySchema>;
export type GenreSimilarQuery = z.infer<typeof genreSimilarQuerySchema>;
export type GenreCreateInput = z.infer<typeof genreCreateBodySchema>;
export type GenreUpdateInput = z.infer<typeof genreUpdateBodySchema>;
export type GenreAliasInput = z.infer<typeof genreAliasBodySchema>;
export type GenreMergeInput = z.infer<typeof genreMergeBodySchema>;
export type GenreAliasResponse = z.infer<typeof genreAliasResponseSchema>;
export type GenreMergeResponse = z.infer<typeof genreMergeResponseSchema>;

const registry = z.registry<{ id: string }>();
registry.add(genreSourceSchema, { id: "GenreSource" });
registry.add(genreMutationResponseSchema, { id: "Genre" });
registry.add(genreTreeNodeSchema, { id: "GenreTreeNode" });
registry.add(genreTreeResponseSchema, { id: "GenreTreeResponse" });
registry.add(genrePageRefSchema, { id: "GenrePageRef" });
registry.add(genreSimilaritySignalsSchema, { id: "GenreSimilaritySignals" });
registry.add(genreRelatedRefSchema, { id: "GenreRelatedRef" });
registry.add(genrePageResponseSchema, { id: "GenrePageResponse" });
registry.add(genreSimilarResponseSchema, { id: "GenreSimilarResponse" });
registry.add(genreCreateBodySchema, { id: "GenreCreateInput" });
registry.add(genreUpdateBodySchema, { id: "GenreUpdateInput" });
registry.add(genreAliasBodySchema, { id: "GenreAliasInput" });
registry.add(genreMergeBodySchema, { id: "GenreMergeInput" });
registry.add(genreAliasResponseSchema, { id: "GenreAliasResponse" });
registry.add(genreMergeResponseSchema, { id: "GenreMergeResponse" });

// Input mode preserves the routes' acceptance of unknown keys. Registered
// recursive nodes reference the shared OpenAPI component, never a local "$ref".
const jsonSchemas = z.toJSONSchema(registry, {
  io: "input",
  uri: (id) => `#/components/schemas/${id}`,
}).schemas;

// Components resolve against the document; fragment-only $ids are not valid
// JSON Schema identifiers and must not change that resolution base.
export const genreJsonSchemas = Object.fromEntries(
  Object.entries(jsonSchemas).map(([name, schema]) => [
    name,
    Object.fromEntries(Object.entries(schema).filter(([key]) => key !== "$id")),
  ])
);

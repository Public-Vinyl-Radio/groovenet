// Subset of Zod schemas relevant to external consumers.
// Wire shapes and runtime input adapters come from @groovenet/contracts.

import {
  genreQueryParamSchema,
  intFromInputSchema,
  nonNegativeIntFromInputSchema,
  numberFromInputSchema,
  toInt,
} from "@groovenet/contracts/coercion";
export { intFromInputSchema, nonNegativeIntFromInputSchema } from "@groovenet/contracts/coercion";

import { z } from "zod";
import type { GenreTreeNode } from "./types.js";

export {
  playlistGeneticRequestSchema as playlistGeneticBodySchema,
  playlistGeneticResponseSchema,
  playlistTrackInputSchema,
} from "@groovenet/contracts";
export type { PlaylistTrackInput } from "@groovenet/contracts";

import { trackSearchQuerySchema } from "@groovenet/contracts";
export {
  albumPlayableStructureSideSchema,
  albumPlayableStructureTrackSchema,
  albumPlayableStructureSchema as albumPlayableStructureResponseSchema,
  albumSchema as albumEntitySchema,
  trackGenreSchema,
  trackSchema as trackEntitySchema,
  trackSearchModeSchema,
  trackSearchResponseSchema as trackSearchGetResponseSchema,
} from "@groovenet/contracts";

// Preserve the client's existing subset: these app-only fields are stripped.
export const trackSearchGetQuerySchema = trackSearchQuerySchema
  .omit({
    friend_id: true,
    include_similar: true,
    similar_limit: true,
    similar_exclude: true,
  })
  .extend({
    q: trackSearchQuerySchema.shape.q.default(""),
    limit: nonNegativeIntFromInputSchema.optional().default(20),
    offset: nonNegativeIntFromInputSchema.optional().default(0),
    mode: trackSearchQuerySchema.shape.mode.default("lexical"),
    bpm_min: numberFromInputSchema.optional(),
    bpm_max: numberFromInputSchema.optional(),
    key: z.string().trim().min(1).optional(),
    star_rating: z.preprocess(toInt, z.number().int().min(0).max(5)).optional(),
    genre: genreQueryParamSchema,
  });

export {
  jobSchema as jobInfoSchema,
  jobDetailsSchema,
  jobEventSchema,
  jobLogsResponseSchema,
  jobOutcomeResponseSchema,
  jobsClearResponseSchema,
  jobsListResponseSchema,
} from "@groovenet/contracts";

export const localPlaybackControlBodySchema = z.object({
  action: z.enum(["play", "pause", "resume", "stop", "seek", "volume"]),
  filename: z.string().optional(),
  seconds: z.number().optional(),
  volume: z.number().optional(),
});

export const localPlaybackControlResponseSchema = z.object({
  success: z.boolean(),
  status: z.unknown().optional(),
  volume: z.number().optional(),
});

// Spin shapes live in @groovenet/contracts; the bodies and queries below add
// the text coercion this package has always applied to ids and paging.
import {
  refineSpinCreate,
  refineSpinUpdate,
  spinCreateObjectSchema,
  spinListQuerySchema as sharedSpinListQuerySchema,
  spinSessionDetailSchema,
  spinTopTrackSchema,
  spinTopTracksQuerySchema as sharedSpinTopTracksQuerySchema,
  spinUpdateObjectSchema,
} from "@groovenet/contracts";
export {
  spinAlbumSummarySchema,
  spinCreateResponseSchema,
  spinDeleteResponseSchema,
  spinDerivedSchema,
  spinListResponseSchema,
  spinSelectionSchema,
  spinSessionSchema,
  spinTopTracksResponseSchema,
  spinTrackRefSchema,
  spinUpdateResponseSchema,
  trackSpinEventSchema,
} from "@groovenet/contracts";

export const spinListItemSchema = spinSessionDetailSchema;
export const spinTopTrackItemSchema = spinTopTrackSchema;

export const spinCreateBodySchema = spinCreateObjectSchema
  .extend({ friend_id: intFromInputSchema })
  .superRefine(refineSpinCreate);

export const spinListQuerySchema = sharedSpinListQuerySchema
  .extend({
    friend_id: intFromInputSchema,
    limit: nonNegativeIntFromInputSchema.optional().default(50),
    offset: nonNegativeIntFromInputSchema.optional().default(0),
  })
  .refine((query) => !query.cursor || query.offset === 0, {
    message: "cursor cannot be combined with a non-zero offset",
    path: ["cursor"],
  });

export const spinUpdateBodySchema = spinUpdateObjectSchema
  .extend({ friend_id: intFromInputSchema })
  .superRefine(refineSpinUpdate);

export const spinTopTracksQuerySchema = sharedSpinTopTracksQuerySchema.extend({
  friend_id: intFromInputSchema,
  limit: nonNegativeIntFromInputSchema.optional().default(20),
  offset: nonNegativeIntFromInputSchema.optional().default(0),
});

export const genreSourceSchema = z.enum(["discogs", "custom"]);

export const genreTreeNodeSchema: z.ZodType<GenreTreeNode> = z.lazy(() =>
  z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    parent_id: z.string().uuid().nullable(),
    source: genreSourceSchema,
    track_count: z.number().int().nonnegative(),
    album_count: z.number().int().nonnegative(),
    aliases: z.array(z.string()).optional(),
    children: z.array(genreTreeNodeSchema),
  }),
);

export const genreTreeResponseSchema = z.object({ genres: z.array(genreTreeNodeSchema) });

export const genrePageRefSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  track_count: z.number().int().nonnegative(),
});
export const genreSimilaritySignalsSchema = z.object({
  taxonomy: z.enum(["sibling", "parent", "child"]).optional(),
  npmi: z.number().min(-1).max(1).optional(),
  shared_albums: z.number().int().nonnegative().optional(),
});
export const genreRelatedRefSchema = genrePageRefSchema.extend({
  score: z.number().optional(),
  signals: genreSimilaritySignalsSchema.optional(),
});
export const genreSimilarResponseSchema = z.object({
  genre: genrePageRefSchema,
  related: z.array(genreRelatedRefSchema),
});

export const genreSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  parent_id: z.string().uuid().nullable(),
  source: genreSourceSchema,
});
export const genreCreateInputSchema = z.object({
  name: z.string().trim().min(1),
  parent_id: z.string().uuid(),
});
export const genreUpdateInputSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    parent_id: z.string().uuid().nullable().optional(),
  })
  .refine((value) => value.name !== undefined || value.parent_id !== undefined, {
    message: "name or parent_id is required",
  });
export const genreAliasResponseSchema = z.object({ success: z.literal(true) });
export const genreMergeResponseSchema = z.object({
  success: z.literal(true),
  merged_genre_id: z.string().uuid(),
  survivor_genre_id: z.string().uuid(),
});
export const genreAliasInputSchema = z.object({ alias: z.string().trim().min(1) });
export const genreMergeInputSchema = z.object({ target_id: z.string().uuid() });

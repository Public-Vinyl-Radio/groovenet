import { z } from "zod";
import { recommendationScopeSchema } from "./settings.js";

// Recommendation candidates retrieved from the identity and audio-vibe
// embedding indexes (#1020).

export const RECOMMENDATION_MODES = ["combined", "identity", "audio"] as const;
export const recommendationModeSchema = z.enum(RECOMMENDATION_MODES);
export type RecommendationMode = z.infer<typeof recommendationModeSchema>;

/**
 * Where candidates may come from. `scope` omitted means the library's saved
 * setting (default `library`); `library_friend_id` omitted means the seed's
 * library (the first seed's, for a batch).
 */
const scopeParams = {
  scope: recommendationScopeSchema.optional().meta({
    description:
      "`library` keeps candidates to `library_friend_id`'s library; `all` searches every library. Omitted, that library's saved setting applies.",
  }),
  library_friend_id: z.number().int().optional().meta({
    description: "Defaults to the (first) seed track's library.",
  }),
};

/**
 * The wire query. Defaults (200 / 200 / 10, mode `combined`) and text coercion
 * belong to the route; the limits it enforces are 0-1000.
 */
export const recommendationsQuerySchema = z.object({
  track_id: z.string().min(1),
  friend_id: z.number().int(),
  mode: recommendationModeSchema.optional(),
  limit_identity: z.number().int().optional(),
  limit_audio: z.number().int().optional(),
  ivfflat_probes: z.number().int().optional(),
  ...scopeParams,
});
export type RecommendationsQuery = z.infer<typeof recommendationsQuerySchema>;

export const recommendationSeedTrackSchema = z.object({
  track_id: z.string().min(1),
  friend_id: z.number().int(),
});
export type RecommendationSeedTrack = z.infer<typeof recommendationSeedTrackSchema>;

export const recommendationsBatchBodySchema = z.object({
  tracks: z.array(recommendationSeedTrackSchema).min(1).max(100),
  limit_identity: z.number().int().optional().meta({ description: "1-1000. Defaults to 200." }),
  limit_audio: z.number().int().optional().meta({ description: "1-1000. Defaults to 200." }),
  ivfflat_probes: z.number().int().optional().meta({
    description: "pgvector ivfflat probes; higher is more accurate and slower. Defaults to 10.",
  }),
  ...scopeParams,
});
export type RecommendationsBatchBody = z.infer<typeof recommendationsBatchBodySchema>;

export const seedEmbeddingsSchema = z.object({
  identity: z.boolean(),
  audio: z.boolean(),
});
export type SeedEmbeddings = z.infer<typeof seedEmbeddingsSchema>;

export const recommendationCandidateMetadataSchema = z
  .object({
    bpm: z.number().nullable(),
    key: z.string().nullable(),
    keyConfidence: z.number().nullable(),
    tempoConfidence: z.number().nullable(),
    eraBucket: z.string().nullable(),
    tags: z.array(z.string()),
    genreRefs: z.array(z.object({ id: z.string(), parentId: z.string().nullable() })),
    styles: z.array(z.string()),
    energy: z.number().nullable(),
    danceability: z.number().nullable(),
    title: z.string(),
    artist: z.string(),
    album: z.string(),
    year: z.string().nullable(),
    genres: z.array(z.string()),
    starRating: z.number().nullable(),
    albumThumbnail: z.string().nullable(),
    moodHappy: z.number().nullable(),
    moodSad: z.number().nullable(),
    moodRelaxed: z.number().nullable(),
    moodAggressive: z.number().nullable(),
  })
  .passthrough();

export const recommendationCandidateSchema = z.object({
  trackId: z.string(),
  friendId: z.number().int(),
  simIdentity: z.number().nullable(),
  simAudio: z.number().nullable(),
  metadata: recommendationCandidateMetadataSchema,
});
export type RecommendationCandidate = z.infer<typeof recommendationCandidateSchema>;

export const recommendationStatsSchema = z.object({
  identityCount: z.number().int(),
  audioCount: z.number().int(),
  unionCount: z.number().int(),
  timingMs: z.object({
    identityQuery: z.number().int(),
    audioQuery: z.number().int(),
    total: z.number().int(),
  }),
});

export const recommendationsResponseSchema = z.object({
  seedTrackId: z.string(),
  seedFriendId: z.number().int(),
  seedEmbeddings: seedEmbeddingsSchema,
  /** The scope these candidates were drawn from, after applying the saved setting. */
  scope: recommendationScopeSchema,
  /** The library they were limited to; null when every library was searched. */
  libraryFriendId: z.number().int().nullable(),
  candidates: z.array(recommendationCandidateSchema),
  stats: recommendationStatsSchema,
});
export type RecommendationsResponse = z.infer<typeof recommendationsResponseSchema>;

export const recommendationJsonSchemas = {
  RecommendationCandidate: z.toJSONSchema(recommendationCandidateSchema),
  RecommendationsBatchRequest: z.toJSONSchema(recommendationsBatchBodySchema, { io: "input" }),
  RecommendationsResponse: z.toJSONSchema(recommendationsResponseSchema),
} as const;

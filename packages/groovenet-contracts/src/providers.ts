import { z } from "zod";
import { trackGenreSchema } from "./tracks.js";

// External-provider and Discogs operations (#1022). These pass through Apple
// Music, YouTube, OpenAI and Discogs, so the fields the app reads are typed
// strictly and the provider's own extra fields stay open (`passthrough`).

// ─── Discogs release exports ────────────────────────────────────────────────

const discogsArtistRefSchema = z.object({
  name: z.string(),
  id: z.union([z.string(), z.number()]).optional(),
  join: z.string().optional(),
});

/** A track of a Discogs release export, as the app's sync writes it to disk. */
export const processedTrackSchema = z
  .object({
    position: z.string(),
    title: z.string(),
    duration: z.string(),
    artists: z.array(discogsArtistRefSchema),
    duration_seconds: z.number().nullable().optional(),
    apple_music_url: z.string().nullable().optional(),
    youtube_url: z.string().nullable().optional(),
    soundcloud_url: z.string().nullable().optional(),
    local_audio_url: z.string().nullable().optional(),
  })
  .passthrough();

export const discogsVideoSchema = z
  .object({
    uri: z.string().optional(),
    url: z.string().optional(),
    title: z.string().optional(),
    duration: z.union([z.number(), z.string()]).optional(),
    description: z.string().optional(),
  })
  .passthrough();

/**
 * A release export file (`discogs_exports/release_<id>.json`). Declared from a
 * non-passthrough shape so the exported type keeps its keys.
 */
const discogsReleaseShape = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string(),
  artists: z.array(discogsArtistRefSchema).optional(),
  artists_sort: z.string().optional(),
  year: z.number().nullable().optional(),
  styles: z.array(z.string()).optional(),
  genres: z.array(z.string()).optional(),
  uri: z.string().nullable().optional(),
  thumb: z.string().nullable().optional(),
  videos: z.array(discogsVideoSchema).optional(),
  video: z.array(discogsVideoSchema).optional(),
  tracklist: z.array(processedTrackSchema),
  date_added: z.string(),
  date_changed: z.string(),
  labels: z.array(z.object({ name: z.string(), catno: z.string() })).optional(),
  country: z.string().optional(),
  formats: z.unknown().optional(),
});
export const discogsReleaseSchema = discogsReleaseShape.passthrough();
export type DiscogsRelease = z.infer<typeof discogsReleaseShape>;
export type ProcessedTrack = z.infer<typeof processedTrackSchema>;
export type DiscogsVideo = z.infer<typeof discogsVideoSchema>;

// ─── GET /api/providers/discogs/release-lookup ──────────────────────────────

export const discogsLookupQuerySchema = z.object({
  track_id: z.string().min(1),
  username: z.string().optional(),
  friend_id: z.number().int().optional(),
});

// The route returns whatever the export file holds without parsing it, so every
// field is optional here, as it was before the migration.
export const discogsLookupTrackSchema = processedTrackSchema.extend({
  artists: z.array(discogsArtistRefSchema).optional(),
});
export const discogsLookupReleaseSchema = discogsReleaseShape
  .partial()
  .extend({ tracklist: z.array(discogsLookupTrackSchema).optional() })
  .passthrough();
export const discogsLookupResponseSchema = z
  .object({
    releaseId: z.string().optional(),
    filePath: z.string().optional(),
    release: discogsLookupReleaseSchema.nullable().optional(),
    matchedTrack: discogsLookupTrackSchema.nullable().optional(),
  })
  .passthrough();
export type DiscogsLookupQuery = z.infer<typeof discogsLookupQuerySchema>;
export type DiscogsLookupResponse = z.infer<typeof discogsLookupResponseSchema>;
export type DiscogsLookupRelease = z.infer<typeof discogsLookupReleaseSchema>;

// ─── Discogs collection operations ──────────────────────────────────────────

export const discogsDeleteReleasesRequestSchema = z.object({
  username: z.string().min(1),
  releaseIds: z.array(z.string().min(1)),
});
export const discogsDeleteReleasesResponseSchema = z.object({
  message: z.string(),
  deletedFiles: z.array(z.string()).meta({ examples: ["/audio/trk_001.m4a"] }),
  failedDeletes: z.array(z.string()).meta({ examples: ["/audio/trk_404.m4a"] }),
  deletedTrackIds: z.array(z.string()),
  deletedFromDb: z.number().int(),
});
export type DiscogsDeleteReleasesRequest = z.infer<typeof discogsDeleteReleasesRequestSchema>;
export type DiscogsDeleteReleasesResponse = z.infer<typeof discogsDeleteReleasesResponseSchema>;

// Discogs usernames are letters, digits, dots, hyphens and underscores.
export const discogsUsernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._-]+$/, "Invalid Discogs username");

/** Whether a Discogs user exists, and how many releases their collection holds. */
export const discogsUserLookupResponseSchema = z.discriminatedUnion("found", [
  z.object({
    username: z.string(),
    found: z.literal(true),
    release_count: z.number().int().nonnegative(),
  }),
  z.object({ username: z.string(), found: z.literal(false) }),
]);
export type DiscogsUserLookupResponse = z.infer<typeof discogsUserLookupResponseSchema>;

export const manifestVerificationResultSchema = z.object({
  username: z.string(),
  totalReleaseIds: z.number().int(),
  missingFiles: z.array(z.string()),
  validFiles: z.array(z.string()),
});
export const manifestVerificationResponseSchema = z.object({
  message: z.string(),
  results: z.array(manifestVerificationResultSchema),
  summary: z.object({
    totalManifests: z.number().int(),
    totalMissingFiles: z.number().int(),
    totalValidFiles: z.number().int(),
  }),
});
export const manifestCleanupResultSchema = z.object({
  username: z.string(),
  before: z.number().int(),
  after: z.number().int(),
  removed: z.array(z.string()),
});
export const manifestCleanupResponseSchema = z.object({
  message: z.string(),
  results: z.array(manifestCleanupResultSchema),
  summary: z.object({
    totalManifests: z.number().int(),
    totalRemoved: z.number().int(),
    totalKept: z.number().int(),
  }),
});
export type ManifestVerificationResult = z.infer<typeof manifestVerificationResultSchema>;
export type ManifestVerificationResponse = z.infer<typeof manifestVerificationResponseSchema>;
export type ManifestCleanupResponse = z.infer<typeof manifestCleanupResponseSchema>;

// ─── Streaming and generative providers ─────────────────────────────────────

export const providerTrackMetadataRequestSchema = z.object({
  prompt: z.string().min(1),
  friend_id: z.number().int().optional(),
  track_id: z.string().min(1).optional().meta({
    description:
      "The track being enriched. Adds its album's Discogs genres and styles, and the genres its other tracks use, to the prompt.",
  }),
});
export const providerTrackMetadataResponseSchema = z.object({
  genres: z.array(trackGenreSchema).meta({
    description:
      "Up to 3 suggested track genres. Always taxonomy entries: the model chooses from an enum of the taxonomy, and anything else is dropped.",
  }),
  descriptors: z
    .array(z.string())
    .meta({ description: "Up to 3 normalised mood or description words." }),
  notes: z.string(),
});
export type ProviderTrackMetadataRequest = z.infer<typeof providerTrackMetadataRequestSchema>;
export type ProviderTrackMetadataResponse = z.infer<typeof providerTrackMetadataResponseSchema>;

export const providerYouTubeMusicSearchRequestSchema = z.object({
  title: z.string().optional(),
  artist: z.string().optional(),
});
export const youtubeVideoSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  channel: z.string(),
  thumbnail: z.string().optional(),
});
export const providerYouTubeMusicSearchResponseSchema = z.object({
  results: z.array(youtubeVideoSchema),
});
export type YoutubeVideo = z.infer<typeof youtubeVideoSchema>;
export type ProviderYouTubeMusicSearchRequest = z.infer<
  typeof providerYouTubeMusicSearchRequestSchema
>;
export type ProviderYouTubeMusicSearchResponse = z.infer<
  typeof providerYouTubeMusicSearchResponseSchema
>;

export const providerAppleMusicSearchRequestSchema = z.object({
  title: z.string().optional(),
  artist: z.string().optional(),
  album: z.string().optional(),
  isrc: z.string().optional(),
});
// Fields other than `id` are optional: the route maps Apple's attributes
// through without checking that each is present.
export const appleMusicResultSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  artist: z.string().optional(),
  album: z.string().optional(),
  url: z.string().optional(),
  artwork: z.string().optional(),
  duration: z.number().optional().meta({ description: "Milliseconds." }),
  isrc: z.string().optional(),
});
export const providerAppleMusicSearchResponseSchema = z.object({
  results: z.array(appleMusicResultSchema),
});
export type AppleMusicResult = z.infer<typeof appleMusicResultSchema>;
export type ProviderAppleMusicSearchRequest = z.infer<typeof providerAppleMusicSearchRequestSchema>;
export type ProviderAppleMusicSearchResponse = z.infer<
  typeof providerAppleMusicSearchResponseSchema
>;

const registry = z.registry<{ id: string }>();
const schemas = {
  DiscogsRelease: discogsReleaseSchema,
  DiscogsProcessedTrack: processedTrackSchema,
  DiscogsLookupResponse: discogsLookupResponseSchema,
  DiscogsDeleteReleasesRequest: discogsDeleteReleasesRequestSchema,
  DiscogsDeleteReleasesResponse: discogsDeleteReleasesResponseSchema,
  DiscogsUserLookupResponse: discogsUserLookupResponseSchema,
  ManifestVerificationResponse: manifestVerificationResponseSchema,
  ManifestCleanupResponse: manifestCleanupResponseSchema,
  ProviderTrackMetadataRequest: providerTrackMetadataRequestSchema,
  ProviderTrackMetadataResponse: providerTrackMetadataResponseSchema,
  ProviderYouTubeMusicSearchRequest: providerYouTubeMusicSearchRequestSchema,
  ProviderYouTubeMusicSearchResponse: providerYouTubeMusicSearchResponseSchema,
  ProviderAppleMusicSearchRequest: providerAppleMusicSearchRequestSchema,
  ProviderAppleMusicSearchResponse: providerAppleMusicSearchResponseSchema,
};
for (const [id, schema] of Object.entries(schemas)) registry.add(schema, { id });
const jsonSchemas = z.toJSONSchema(registry, {
  io: "input",
  uri: (id) => `#/components/schemas/${id}`,
}).schemas;
export const providerJsonSchemas = Object.fromEntries(
  Object.entries(jsonSchemas).map(([name, schema]) => [
    name,
    Object.fromEntries(Object.entries(schema).filter(([key]) => key !== "$id")),
  ]),
);

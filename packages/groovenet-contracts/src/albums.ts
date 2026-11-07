import { z } from "zod";
import {
  artistCreditsFieldSchema,
  artistFilterQueryShape,
  artistFilterResponseShape,
} from "./artistCredits.js";
import { genreFilterRefSchema, trackSchema } from "./tracks.js";

export const albumArtSourceSchema = z.enum(["discogs", "apple_music", "upload"]);
export const albumArtMatchStatusSchema = z.enum([
  "matched",
  "mismatch",
  "no_reference",
  "no_candidate",
]);

/** Omitted: unchanged; null: reset to Discogs; []: deliberately empty. */
const overrideIdsSchema = z.array(z.string().uuid()).max(100).nullable().optional().meta({
  description:
    "Omitted: unchanged; null: reset to latest Discogs; []: deliberately empty replacement.",
});
export const albumTaxonomyOverridesSchema = z.object({
  genre_override_ids: overrideIdsSchema,
  style_override_ids: overrideIdsSchema,
});

/** The album/release entity. Unknown database columns pass through. */
const albumShape = z.object({
  ...albumTaxonomyOverridesSchema.shape,
  /** Display/search values after the per-friend replacement layer. */
  effective_genres: z.array(z.string()).optional(),
  effective_styles: z.array(z.string()).optional(),
  release_id: z.string(),
  friend_id: z.number().int(),
  username: z.string().optional(),
  title: z.string(),
  artist: z.string(),
  artists: artistCreditsFieldSchema,
  year: z.union([z.string(), z.number()]).nullable().optional(),
  genres: z.array(z.string()).nullable().optional(),
  styles: z.array(z.string()).nullable().optional(),
  album_thumbnail: z.string().nullable().optional(),
  audio_file_album_art_url: z.string().nullable().optional(),
  discogs_url: z.string().nullable().optional(),
  date_added: z.string().nullable().optional(),
  date_changed: z.string().nullable().optional(),
  track_count: z.number().int().optional(),
  album_rating: z.number().nullable().optional(),
  album_notes: z.string().nullable().optional(),
  /** `numeric(10,2)`: the driver returns it as a decimal string such as "19.99". */
  purchase_price: z.union([z.number(), z.string()]).nullable().optional(),
  condition: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  catalog_number: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  format: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  library_identifier: z.string().nullable().optional(),
  // Artwork provenance (#494); the displayed cover is still audio_file_album_art_url || album_thumbnail.
  album_art_source: albumArtSourceSchema.nullable().optional(),
  discogs_art_url: z.string().nullable().optional(),
  apple_music_art_url: z.string().nullable().optional(),
  art_match_status: albumArtMatchStatusSchema.nullable().optional(),
  art_match_distance: z.number().nullable().optional(),
});
export const albumSchema = albumShape.passthrough();

/** Wire shape of `GET /api/albums` query params once coerced from strings. */
export const albumSearchQuerySchema = z.object({
  q: z.string().optional(),
  sort: z.string().optional(),
  friend_id: z.number().int().optional(),
  limit: z.number().int().min(0).optional(),
  offset: z.number().int().min(0).optional(),
  missing_library_identifier: z.boolean().optional(),
  missing_local_cover_art_url: z.boolean().optional(),
  missing_audio: z.boolean().optional(),
  genre: z.array(z.string()).max(20).optional(),
  include_similar: z.boolean().optional(),
  similar_limit: z.number().int().min(0).optional(),
  similar_exclude: z.array(z.string()).max(20).optional(),
  ...artistFilterQueryShape,
});

export const albumSearchResponseSchema = z.object({
  hits: z.array(albumSchema),
  estimatedTotalHits: z.number().int(),
  offset: z.number().int(),
  limit: z.number().int(),
  query: z.string(),
  sort: z.string(),
  added_genres: z.array(genreFilterRefSchema).optional().meta({
    description:
      "Genres include_similar added beyond the plain genre filter (#485); omitted when it added nothing.",
  }),
  ...artistFilterResponseShape,
});

export const albumDetailSchema = z.object({
  album: albumSchema,
  tracks: z.array(trackSchema),
});

export const albumDeleteResponseSchema = z.object({ success: z.boolean() });

export const albumArtworkStateSchema = z.object({
  release_id: z.string(),
  friend_id: z.number().int(),
  current_url: z.string().nullable(),
  source: albumArtSourceSchema.nullable(),
  discogs_art_url: z.string().nullable(),
  apple_music_art_url: z.string().nullable(),
  art_match_status: albumArtMatchStatusSchema.nullable(),
  art_match_distance: z.number().int().nullable(),
  has_local_audio: z.boolean(),
});

export const albumPlayableStructureTrackSchema = z
  .object({
    track_id: z.string(),
    friend_id: z.number().int(),
    position: z.union([z.string(), z.number()]).nullable().optional(),
    title: z.string(),
    artist: z.string(),
  })
  .passthrough();

export const albumPlayableStructureSideSchema = z.object({
  side_key: z.string(),
  side_label: z.string(),
  ordinal: z.number().int(),
  track_count: z.number().int(),
  tracks: z.array(albumPlayableStructureTrackSchema),
});

export const albumPlayableStructureSchema = z.object({
  album: albumSchema,
  sides: z.array(albumPlayableStructureSideSchema),
});

export const albumAppleMusicArtPreviewSchema = z.object({
  url: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  track_id: z.string(),
});

export const albumArtMatchResultSchema = z.object({
  release_id: z.string(),
  friend_id: z.number().int(),
  status: albumArtMatchStatusSchema,
  distance: z.number().int().nullable(),
  applied: z.boolean(),
  apple_music_art_url: z.string().nullable(),
});

/** Optional body: omitted or `null` queues every library. */
export const albumArtworkBackfillBodySchema = z.object({
  friend_id: z.number().int().positive().nullable().optional(),
});

export const albumArtworkBackfillResponseSchema = z.object({
  queued: z.number().int(),
  queuedAlbums: z.number().int(),
  tracksImpacted: z.number().int(),
  jobIds: z.array(z.string()),
  errors: z.array(
    z.object({
      track_id: z.string(),
      friend_id: z.number().int(),
      release_id: z.string().nullable().optional(),
      error: z.string(),
    }),
  ),
});

/** Wire shape of `GET /api/albums/artwork/review` query params once coerced. */
export const albumArtworkReviewQuerySchema = z.object({
  friend_id: z.number().int().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export const albumArtworkReviewItemSchema = z.object({
  release_id: z.string(),
  friend_id: z.number().int(),
  title: z.string(),
  artist: z.string(),
  current_url: z.string().nullable(),
  discogs_art_url: z.string().nullable(),
  apple_music_art_url: z.string().nullable(),
  art_match_status: albumArtMatchStatusSchema,
  art_match_distance: z.number().int().nullable(),
});

export const albumArtworkReviewResponseSchema = z.object({
  albums: z.array(albumArtworkReviewItemSchema),
});

export const albumDiscogsRawResponseSchema = z.object({
  friend_id: z.number().int(),
  release_id: z.string(),
  username: z.string(),
  file_path: z.string(),
  /** The release payload exactly as Discogs returned it. */
  data: z.record(z.string(), z.unknown()),
});

export const albumDownloadResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  jobIds: z.array(z.string()),
  tracksQueued: z.number().int(),
});

/** `POST /api/albums/create`: the stored album and its tracks. */
export const albumCreateResponseSchema = z.object({
  album: albumSchema,
  tracks: z.array(trackSchema),
});

/** `POST /api/albums/upsert`; tracks are whatever columns the repository returns. */
export const albumUpsertResponseSchema = z.object({
  album: albumSchema,
  tracks: z.array(z.object({}).passthrough()),
  deletedTracks: z.number().int(),
});

/** `PATCH /api/albums`: identity plus any of the editable fields. */
export const albumUpdateObjectSchema = z.object({
  release_id: z.string().min(1),
  friend_id: z.number().int().positive(),
  ...albumTaxonomyOverridesSchema.shape,
  album_rating: z.number().optional(),
  album_notes: z.string().optional(),
  purchase_price: z.number().optional(),
  condition: z.string().optional(),
  library_identifier: z.string().max(50).nullable().optional(),
});

/** At least one editable field must be present. */
export const requireAlbumUpdateField = [
  (value: Omit<z.infer<typeof albumUpdateObjectSchema>, "release_id" | "friend_id">) =>
    value.album_rating !== undefined ||
    value.album_notes !== undefined ||
    value.purchase_price !== undefined ||
    value.condition !== undefined ||
    value.library_identifier !== undefined ||
    value.genre_override_ids !== undefined ||
    value.style_override_ids !== undefined,
  { message: "No fields to update" },
] as const;
export const albumUpdateSchema = albumUpdateObjectSchema.refine(...requireAlbumUpdateField);

export const albumUpdateResponseSchema = z.object({
  success: z.boolean(),
  album: albumSchema,
  tracksUpdated: z.number().int().optional(),
});

export type AlbumArtSource = z.infer<typeof albumArtSourceSchema>;
export type AlbumArtMatchStatus = z.infer<typeof albumArtMatchStatusSchema>;
export type AlbumTaxonomyOverrides = z.infer<typeof albumTaxonomyOverridesSchema>;
/** Declared fields only; the schema itself passes unknown columns through. */
export type AlbumEntity = z.infer<typeof albumShape>;
export type AlbumSearchQuery = z.infer<typeof albumSearchQuerySchema>;
export type AlbumSearchResponse = z.infer<typeof albumSearchResponseSchema>;
export type AlbumDetail = z.infer<typeof albumDetailSchema>;
export type AlbumDeleteResponse = z.infer<typeof albumDeleteResponseSchema>;
export type AlbumArtworkState = z.infer<typeof albumArtworkStateSchema>;
export type AlbumPlayableStructureTrack = z.infer<typeof albumPlayableStructureTrackSchema>;
export type AlbumPlayableStructureSide = z.infer<typeof albumPlayableStructureSideSchema>;
export type AlbumPlayableStructure = z.infer<typeof albumPlayableStructureSchema>;

export type AlbumAppleMusicArtPreview = z.infer<typeof albumAppleMusicArtPreviewSchema>;
export type AlbumArtMatchResult = z.infer<typeof albumArtMatchResultSchema>;
export type AlbumArtworkBackfillBody = z.infer<typeof albumArtworkBackfillBodySchema>;
export type AlbumArtworkBackfillResponse = z.infer<typeof albumArtworkBackfillResponseSchema>;
export type AlbumArtworkReviewQuery = z.infer<typeof albumArtworkReviewQuerySchema>;
export type AlbumArtworkReviewItem = z.infer<typeof albumArtworkReviewItemSchema>;
export type AlbumArtworkReviewResponse = z.infer<typeof albumArtworkReviewResponseSchema>;
export type AlbumDiscogsRawResponse = z.infer<typeof albumDiscogsRawResponseSchema>;
export type AlbumDownloadResult = z.infer<typeof albumDownloadResultSchema>;
export type AlbumCreateResponse = z.infer<typeof albumCreateResponseSchema>;
export type AlbumUpsertResponse = z.infer<typeof albumUpsertResponseSchema>;
/** Body of `PATCH /api/albums`. */
export type AlbumUpdateBody = z.infer<typeof albumUpdateSchema>;
/** The editable half of `AlbumUpdateBody`, for callers that pass the ids separately. */
export type AlbumUpdate = Omit<AlbumUpdateBody, "release_id" | "friend_id">;
export type AlbumUpdateResponse = z.infer<typeof albumUpdateResponseSchema>;

export const albumJsonSchemas = {
  AlbumArtSource: z.toJSONSchema(albumArtSourceSchema),
  AlbumArtMatchStatus: z.toJSONSchema(albumArtMatchStatusSchema),
  Album: z.toJSONSchema(albumSchema),
  AlbumSearchResponse: z.toJSONSchema(albumSearchResponseSchema),
  AlbumDetail: z.toJSONSchema(albumDetailSchema),
  AlbumDeleteResponse: z.toJSONSchema(albumDeleteResponseSchema),
  AlbumArtworkState: z.toJSONSchema(albumArtworkStateSchema),
  AlbumPlayableStructure: z.toJSONSchema(albumPlayableStructureSchema),
  AlbumAppleMusicArtPreview: z.toJSONSchema(albumAppleMusicArtPreviewSchema),
  AlbumArtMatchResult: z.toJSONSchema(albumArtMatchResultSchema),
  AlbumArtworkBackfillRequest: z.toJSONSchema(albumArtworkBackfillBodySchema, { io: "input" }),
  AlbumArtworkBackfillResponse: z.toJSONSchema(albumArtworkBackfillResponseSchema),
  AlbumArtworkReviewResponse: z.toJSONSchema(albumArtworkReviewResponseSchema),
  AlbumDiscogsRawResponse: z.toJSONSchema(albumDiscogsRawResponseSchema),
  AlbumDownloadResult: z.toJSONSchema(albumDownloadResultSchema),
  AlbumCreateResponse: z.toJSONSchema(albumCreateResponseSchema),
  AlbumUpsertResponse: z.toJSONSchema(albumUpsertResponseSchema),
  AlbumUpdateRequest: z.toJSONSchema(albumUpdateSchema, { io: "input" }),
  AlbumUpdateResponse: z.toJSONSchema(albumUpdateResponseSchema),
};

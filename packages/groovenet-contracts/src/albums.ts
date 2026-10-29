import { z } from "zod";
import { genreFilterRefSchema, trackSchema } from "./tracks.js";

export const albumArtSourceSchema = z.enum(["discogs", "apple_music", "upload"]);
export const albumArtMatchStatusSchema = z.enum([
  "matched",
  "mismatch",
  "no_reference",
  "no_candidate",
]);

/** Omitted: unchanged; null: reset to Discogs; []: deliberately empty. */
export const albumTaxonomyOverridesSchema = z.object({
  genre_override_ids: z.array(z.string().uuid()).max(100).nullable().optional(),
  style_override_ids: z.array(z.string().uuid()).max(100).nullable().optional(),
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
  purchase_price: z.number().nullable().optional(),
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
});

export const albumSearchResponseSchema = z.object({
  hits: z.array(albumSchema),
  estimatedTotalHits: z.number().int(),
  offset: z.number().int(),
  limit: z.number().int(),
  query: z.string(),
  sort: z.string(),
  added_genres: z.array(genreFilterRefSchema).optional(),
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

export const albumJsonSchemas = {
  AlbumArtSource: z.toJSONSchema(albumArtSourceSchema),
  AlbumArtMatchStatus: z.toJSONSchema(albumArtMatchStatusSchema),
  Album: z.toJSONSchema(albumSchema),
  AlbumSearchResponse: z.toJSONSchema(albumSearchResponseSchema),
  AlbumDetail: z.toJSONSchema(albumDetailSchema),
  AlbumDeleteResponse: z.toJSONSchema(albumDeleteResponseSchema),
  AlbumArtworkState: z.toJSONSchema(albumArtworkStateSchema),
  AlbumPlayableStructure: z.toJSONSchema(albumPlayableStructureSchema),
};

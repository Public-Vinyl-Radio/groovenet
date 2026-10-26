import { z } from "zod";
import { trackGenreSchema } from "./tracks.js";

// Vinyl spins (#552). A spin session is one sitting with one album; its
// selections say which sides or tracks were played, and its track events are
// the per-track play log that top-tracks counts.
//
// The enums mirror CHECK constraints in the app's
// `migrations/1790900000000_add-playlist-spin-sessions.js` (selection_mode,
// provenance), `1792500000000_add-digital-spin-medium.js` (medium) and `1772300000000_add_spin_logging_tables.js` (selection_type);
// widening one needs a migration too.

export const spinSelectionModeSchema = z.enum(["sides", "tracks", "automatic", "playlist"]);
export const spinProvenanceSchema = z.enum(["manual", "automatic", "playlist"]);
export const spinMediumSchema = z.enum(["vinyl", "digital"]);
export const spinSelectionTypeSchema = z.enum(["side", "track"]);

export const SPIN_SELECTION_MODES = spinSelectionModeSchema.options;
export const SPIN_PROVENANCES = spinProvenanceSchema.options;
export const SPIN_MEDIA = spinMediumSchema.options;
export const SPIN_SELECTION_TYPES = spinSelectionTypeSchema.options;

// Timestamps are ISO strings on the wire; `format` documents that without
// making the response parser stricter than it has been.
const dateTime = () => z.string().meta({ format: "date-time" });

export const spinTrackRefSchema = z.object({
  track_id: z.string().min(1),
  friend_id: z.number().int(),
});

export const spinSessionSchema = z.object({
  id: z.number().int(),
  friend_id: z.number().int(),
  release_id: z.string(),
  medium: spinMediumSchema.meta({ description: "`digital` for plays logged by local and server players" }),
  selection_mode: spinSelectionModeSchema,
  played_at: dateTime(),
  note: z.string().nullable().optional(),
  context_type: z.string().nullable().optional(),
  provenance: spinProvenanceSchema
    .optional()
    .meta({ description: "`automatic` when the listener detected the spin" }),
  source_id: z.string().nullable().optional(),
  confidence: z.number().nullable().optional(),
  playlist_id: z.number().int().nullable().optional(),
  live_set_performance_id: z.number().int().nullable().optional(),
  playlist_played_at: dateTime().nullable().optional(),
  playlist_position: z.number().int().nullable().optional(),
  corrected_at: dateTime()
    .nullable()
    .optional()
    .meta({ description: "When a detected spin was corrected by hand; null otherwise" }),
  created_at: dateTime(),
  updated_at: dateTime(),
});

export const spinSelectionSchema = z.object({
  id: z.number().int().optional(),
  session_id: z.number().int().optional(),
  ordinal: z.number().int(),
  selection_type: spinSelectionTypeSchema,
  side_key: z.string().nullable().optional(),
  track_id: z.string().nullable().optional(),
  friend_id: z.number().int().nullable().optional(),
  position_snapshot: z.string().nullable().optional(),
  created_at: dateTime().optional(),
});

export const trackSpinEventSchema = z.object({
  id: z.number().int().optional(),
  session_id: z.number().int().optional(),
  friend_id: z.number().int(),
  release_id: z.string(),
  track_id: z.string(),
  played_at: dateTime(),
  ordinal: z.number().int(),
  side_key: z.string().nullable().optional(),
  position_snapshot: z.string().nullable().optional(),
  title_snapshot: z.string().optional(),
  artist_snapshot: z.string().optional(),
  album_snapshot: z.string().optional(),
  created_at: dateTime().optional(),
});

export const spinDerivedSchema = z.object({
  is_full_album_spin: z.boolean(),
  selected_side_count: z.number().int(),
  album_side_count: z.number().int(),
  track_count: z.number().int(),
});

export const spinAlbumSummarySchema = z.object({
  title: z.string().nullable(),
  artist: z.string().nullable(),
  thumbnail: z.string().nullable(),
});

/** A session with what was played; `album` is joined in on list and edit responses. */
export const spinSessionDetailSchema = z.object({
  session: spinSessionSchema,
  selections: z.array(spinSelectionSchema),
  track_events: z.array(trackSpinEventSchema),
  derived: spinDerivedSchema,
  album: spinAlbumSummarySchema
    .nullable()
    .optional()
    .meta({ description: "Null when the album is no longer in the collection" }),
});

export const spinCreateResponseSchema = z.object({
  session: spinSessionSchema,
  selections: z.array(spinSelectionSchema),
  expanded_tracks: z.array(trackSpinEventSchema),
  derived: spinDerivedSchema,
});

export const spinUpdateResponseSchema = spinSessionDetailSchema;

export const spinListResponseSchema = z.object({
  items: z.array(spinSessionDetailSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});

export const spinDeleteResponseSchema = z.object({
  success: z.boolean(),
  session: spinSessionSchema,
});

export const spinTopTrackSchema = z.object({
  friend_id: z.number().int(),
  release_id: z.string(),
  track_id: z.string(),
  play_count: z.number().int(),
  last_played_at: dateTime(),
  title_snapshot: z.string(),
  artist_snapshot: z.string(),
  album_snapshot: z.string(),
  side_key: z.string().nullable().optional(),
  position_snapshot: z.string().nullable().optional(),
  album_thumbnail: z.string().nullable().optional(),
  audio_file_album_art_url: z.string().nullable().optional(),
  local_audio_url: z.string().nullable().optional(),
  bpm: z.union([z.number(), z.string()]).nullable().optional(),
  key: z.string().nullable().optional(),
  star_rating: z.number().nullable().optional(),
  styles: z.array(z.string()).optional(),
  library_identifier: z.string().nullable().optional(),
  hasVectors: z.boolean().optional(),
  track_genres: z.array(trackGenreSchema).optional(),
});

export const spinTopTracksResponseSchema = z.object({
  items: z.array(spinTopTrackSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});

// ── Requests ────────────────────────────────────────────────────────────────
// Bodies are exported twice, as record care's are: the plain object
// (`*ObjectSchema`), which the app extends with its text-coercing `friend_id`,
// and the refined wire schema. Zod refuses to `.extend()` an object once it
// carries a refinement, so each refinement is exported too and the app
// reapplies it.

export const spinCreateObjectSchema = z.object({
  friend_id: z.number().int(),
  release_id: z.string().min(1),
  played_at: z.string().min(1).meta({ format: "date-time" }),
  medium: spinMediumSchema.optional().meta({ description: "Defaults to `vinyl`" }),
  note: z.string().nullable().optional(),
  context_type: z.string().nullable().optional(),
  side_keys: z.array(z.string().min(1)).optional(),
  track_refs: z.array(spinTrackRefSchema).optional(),
});

type SpinCreateFields = z.infer<typeof spinCreateObjectSchema>;

/** Exactly one non-empty selection; a single JSON Schema cannot say so. */
export function refineSpinCreate(value: SpinCreateFields, ctx: z.RefinementCtx): void {
  const hasSides = Array.isArray(value.side_keys) && value.side_keys.length > 0;
  const hasTracks = Array.isArray(value.track_refs) && value.track_refs.length > 0;

  if (hasSides === hasTracks) {
    ctx.addIssue({
      code: "custom",
      message: "Provide exactly one of side_keys or track_refs",
    });
  }
}

export const spinCreateSchema = spinCreateObjectSchema.superRefine(refineSpinCreate);

export const spinUpdateObjectSchema = z.object({
  friend_id: z.number().int(),
  played_at: z.string().min(1).optional().meta({ format: "date-time" }),
  note: z.string().nullable().optional(),
  context_type: z.string().nullable().optional(),
  side_keys: z.array(z.string().min(1)).min(1).optional(),
  track_refs: z.array(spinTrackRefSchema).min(1).optional(),
});

type SpinUpdateFields = z.infer<typeof spinUpdateObjectSchema>;

/** At most one selection form, and something to change. */
export function refineSpinUpdate(value: SpinUpdateFields, ctx: z.RefinementCtx): void {
  if (value.side_keys && value.track_refs) {
    ctx.addIssue({
      code: "custom",
      message: "Provide at most one of side_keys or track_refs",
    });
  }
  const changes = [
    value.played_at,
    value.note,
    value.context_type,
    value.side_keys,
    value.track_refs,
  ];
  if (changes.every((change) => change === undefined)) {
    ctx.addIssue({ code: "custom", message: "Nothing to update" });
  }
}

export const spinUpdateSchema = spinUpdateObjectSchema.superRefine(refineSpinUpdate);

export const spinAggregateRequestSchema = z.object({
  since: z.string().min(1).meta({
    format: "date-time",
    description:
      "Both automatic triggers only look back PLAY_AGGREGATION_LOOKBACK_MINUTES (default 60), so this is the manual escape hatch for anything older.",
  }),
  source_id: z
    .string()
    .min(1)
    .optional()
    .meta({ description: "Omit to aggregate every source active since `since`." }),
});

export const spinAggregateSourceResultSchema = z.object({
  source_id: z.string(),
  created: z.number().int(),
  skipped: z.number().int(),
});

export const spinAggregateResultSchema = z.object({
  since: z.string(),
  created: z.number().int(),
  skipped: z.number().int(),
  sources: z.array(spinAggregateSourceResultSchema),
});

// Query strings: these describe the coerced wire values. The app's route
// schemas keep their own text coercion and defaults.
export const spinListQuerySchema = z.object({
  friend_id: z.number().int(),
  release_id: z.string().optional(),
  track_id: z.string().optional(),
  from: z.string().optional().meta({ format: "date-time" }),
  to: z.string().optional().meta({ format: "date-time" }),
  /** Defaults to 50. */
  limit: z.number().int().min(0).optional(),
  offset: z.number().int().min(0).optional(),
});

export const spinTopTracksQuerySchema = z.object({
  friend_id: z.number().int(),
  release_id: z.string().optional(),
  /** Defaults to 20. */
  limit: z.number().int().min(0).optional(),
  offset: z.number().int().min(0).optional(),
});

export type SpinSelectionMode = z.infer<typeof spinSelectionModeSchema>;
export type SpinMedium = z.infer<typeof spinMediumSchema>;
export type SpinProvenance = z.infer<typeof spinProvenanceSchema>;
export type SpinSelectionType = z.infer<typeof spinSelectionTypeSchema>;
export type SpinTrackRef = z.infer<typeof spinTrackRefSchema>;
export type SpinSession = z.infer<typeof spinSessionSchema>;
export type SpinSelection = z.infer<typeof spinSelectionSchema>;
export type TrackSpinEvent = z.infer<typeof trackSpinEventSchema>;
export type SpinDerived = z.infer<typeof spinDerivedSchema>;
export type SpinAlbumSummary = z.infer<typeof spinAlbumSummarySchema>;
export type SpinSessionDetail = z.infer<typeof spinSessionDetailSchema>;
export type SpinCreateResponse = z.infer<typeof spinCreateResponseSchema>;
export type SpinUpdateResponse = z.infer<typeof spinUpdateResponseSchema>;
export type SpinListResponse = z.infer<typeof spinListResponseSchema>;
export type SpinDeleteResponse = z.infer<typeof spinDeleteResponseSchema>;
export type SpinTopTrack = z.infer<typeof spinTopTrackSchema>;
export type SpinTopTracksResponse = z.infer<typeof spinTopTracksResponseSchema>;
export type SpinUpdateInput = z.infer<typeof spinUpdateSchema>;
export type SpinAggregateRequest = z.infer<typeof spinAggregateRequestSchema>;
export type SpinAggregateSourceResult = z.infer<typeof spinAggregateSourceResultSchema>;
export type SpinAggregateResult = z.infer<typeof spinAggregateResultSchema>;
export type SpinListQuery = z.infer<typeof spinListQuerySchema>;
export type SpinTopTracksQuery = z.infer<typeof spinTopTracksQuerySchema>;

type SpinCreateBase = Omit<SpinCreateFields, "side_keys" | "track_refs">;
/**
 * Played sides, or played tracks. The schema's refinement enforces "exactly
 * one"; this type states it for callers.
 */
export type SpinCreateInput =
  | (SpinCreateBase & { side_keys: string[]; track_refs?: never })
  | (SpinCreateBase & { side_keys?: never; track_refs: SpinTrackRef[] });

export const spinJsonSchemas = {
  SpinSelectionMode: z.toJSONSchema(spinSelectionModeSchema),
  SpinProvenance: z.toJSONSchema(spinProvenanceSchema),
  SpinSelectionType: z.toJSONSchema(spinSelectionTypeSchema),
  SpinTrackRef: z.toJSONSchema(spinTrackRefSchema),
  SpinSession: z.toJSONSchema(spinSessionSchema),
  SpinSelection: z.toJSONSchema(spinSelectionSchema),
  TrackSpinEvent: z.toJSONSchema(trackSpinEventSchema),
  SpinDerived: z.toJSONSchema(spinDerivedSchema),
  SpinAlbumSummary: z.toJSONSchema(spinAlbumSummarySchema),
  SpinSessionDetail: z.toJSONSchema(spinSessionDetailSchema),
  SpinCreateResponse: z.toJSONSchema(spinCreateResponseSchema),
  SpinListResponse: z.toJSONSchema(spinListResponseSchema),
  SpinDeleteResponse: z.toJSONSchema(spinDeleteResponseSchema),
  SpinTopTrack: z.toJSONSchema(spinTopTrackSchema),
  SpinTopTracksResponse: z.toJSONSchema(spinTopTracksResponseSchema),
  SpinAggregateSourceResult: z.toJSONSchema(spinAggregateSourceResultSchema),
  SpinAggregateResult: z.toJSONSchema(spinAggregateResultSchema),
  SpinCreateInput: z.toJSONSchema(spinCreateSchema, { io: "input" }),
  SpinUpdateInput: z.toJSONSchema(spinUpdateSchema, { io: "input" }),
  SpinAggregateRequest: z.toJSONSchema(spinAggregateRequestSchema, { io: "input" }),
};

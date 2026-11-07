import { z } from "zod";

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

export const artistJsonSchemas = {
  ArtistReconcileRequest: z.toJSONSchema(artistReconcileRequestSchema),
  ArtistReconcileResponse: z.toJSONSchema(artistReconcileResponseSchema),
} as const;

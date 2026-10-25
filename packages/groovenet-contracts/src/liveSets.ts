import { z } from "zod";

export const liveSetStatusSchema = z.enum(["draft", "performed", "archived"]);
export const liveSetMediaTypeSchema = z.enum(["image", "flyer", "audio", "youtube", "link"]);

export const liveSetCollaboratorSchema = z.object({
  friend_id: z.number().int(),
  username: z.string(),
  role: z.string(),
});

export const liveSetPerformanceSchema = z.object({
  id: z.number().int().optional(),
  performed_at: z.string(),
  venue_name: z.string().nullable(),
  location_city: z.string().nullable(),
  notes: z.string().nullable(),
}).passthrough();

export const liveSetMediaSchema = z.object({
  id: z.number().int().optional(),
  media_type: liveSetMediaTypeSchema,
  url: z.string(),
  filename: z.string().nullable(),
  caption: z.string().nullable(),
  position: z.number().int().optional(),
}).passthrough();

export const liveSetSummarySchema = z.object({
  id: z.number().int(),
  title: z.string().nullable(),
  status: liveSetStatusSchema,
  cover_image_url: z.string().nullable(),
  last_performed_at: z.string().nullable(),
  venue_name: z.string().nullable(),
  location_city: z.string().nullable(),
  collaborators: z.array(liveSetCollaboratorSchema),
  /** First media of each type by position; null when the set has none. */
  flyer_url: z.string().nullable().optional(),
  recording_url: z.string().nullable().optional(),
  post_url: z.string().nullable().optional(),
  youtube_url: z.string().nullable().optional(),
}).passthrough();

export const liveSetSchema = z.object({
  id: z.number().int(),
  playlist_id: z.number().int(),
  title: z.string().nullable(),
  status: liveSetStatusSchema,
  notes: z.string().nullable(),
  location_name: z.string().nullable(),
  location_city: z.string().nullable(),
  cover_image_url: z.string().nullable(),
  collaborators: z.array(liveSetCollaboratorSchema),
  performances: z.array(liveSetPerformanceSchema),
  media: z.array(liveSetMediaSchema),
}).passthrough();

export const liveSetMutationResponseSchema = z.object({
  id: z.number().int(),
  playlist_id: z.number().int(),
});

export const liveSetDeleteResponseSchema = z.object({ success: z.literal(true) });

export const liveSetUpdateSchema = z.object({
  title: z.string().nullable().optional(),
  status: liveSetStatusSchema.optional(),
  notes: z.string().nullable().optional(),
  location_name: z.string().nullable().optional(),
  location_city: z.string().nullable().optional(),
  cover_image_url: z.string().nullable().optional(),
  collaborators: z.array(z.object({ friend_id: z.number().int(), role: z.string().optional() })).optional(),
  performances: z.array(z.object({
    performed_at: z.string(),
    venue_name: z.string().nullable().optional(),
    location_city: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })).optional(),
  media: z.array(z.object({
    media_type: liveSetMediaTypeSchema,
    url: z.string(),
    filename: z.string().nullable().optional(),
    caption: z.string().nullable().optional(),
  })).optional(),
}).passthrough();

export type LiveSetStatus = z.infer<typeof liveSetStatusSchema>;
export type LiveSetMediaType = z.infer<typeof liveSetMediaTypeSchema>;
export type LiveSetCollaborator = z.infer<typeof liveSetCollaboratorSchema>;
export type LiveSetPerformance = z.infer<typeof liveSetPerformanceSchema>;
export type LiveSetMedia = z.infer<typeof liveSetMediaSchema>;
export type LiveSetSummary = z.infer<typeof liveSetSummarySchema>;
export type LiveSet = z.infer<typeof liveSetSchema>;
export type LiveSetMutationResponse = z.infer<typeof liveSetMutationResponseSchema>;
export type LiveSetDeleteResponse = z.infer<typeof liveSetDeleteResponseSchema>;
export type LiveSetUpdate = z.infer<typeof liveSetUpdateSchema>;

export const liveSetJsonSchemas = {
  LiveSetStatus: z.toJSONSchema(liveSetStatusSchema),
  LiveSetMediaType: z.toJSONSchema(liveSetMediaTypeSchema),
  LiveSetCollaborator: z.toJSONSchema(liveSetCollaboratorSchema),
  LiveSetPerformance: z.toJSONSchema(liveSetPerformanceSchema),
  LiveSetMedia: z.toJSONSchema(liveSetMediaSchema),
  LiveSetSummary: z.toJSONSchema(liveSetSummarySchema),
  LiveSet: z.toJSONSchema(liveSetSchema),
  LiveSetMutationResponse: z.toJSONSchema(liveSetMutationResponseSchema),
  LiveSetDeleteResponse: z.toJSONSchema(liveSetDeleteResponseSchema),
  LiveSetUpdate: z.toJSONSchema(liveSetUpdateSchema),
};

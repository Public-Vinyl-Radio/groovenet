import { z } from "zod";
import { recordCareSummarySchema, sleeveTypeSchema } from "./recordCare.js";

export const recordCareQueueQuerySchema = z.object({
  friend_id: z.number().int().positive(),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .meta({
      description: "Spin window YYYY-MM; defaults to the current month in GROOVENET_TIME_ZONE",
    }),
  limit: z
    .number()
    .int()
    .min(0)
    .max(500)
    .optional()
    .meta({ description: "Backlog page size; defaults to 50" }),
  offset: z.number().int().min(0).optional(),
});
export const recordCareProgressQuerySchema = z.object({
  friend_id: z.number().int().positive(),
  stack_size: z.number().int().min(1).max(500).optional().meta({ description: "Defaults to 10" }),
});
export const recordCareQueueItemSchema = z.object({
  copy_id: z.number().int().nullable(),
  release_id: z.string(),
  title: z.string(),
  artist: z.string(),
  thumbnail: z.string().nullable(),
  library_identifier: z
    .string()
    .nullable()
    .meta({ description: "Shelf code the album is filed under (LP-182, S-013); null if none" }),
  inner_sleeve_type: sleeveTypeSchema.nullable(),
  added_at: z.string().nullable().meta({
    format: "date-time",
    description: "GrooveNet import time, matching Home new arrivals",
  }),
});
export const recordCareQueueResponseSchema = z.object({
  spun_recently: z.object({
    month: z.string(),
    window_label: z.string(),
    items: z.array(
      recordCareQueueItemSchema.extend({
        spin_count: z.number().int(),
        last_spin_at: z.string().meta({ format: "date-time" }),
        window_label: z.string(),
      }),
    ),
  }),
  new_arrivals: z.object({
    window_days: z.number().int(),
    items: z.array(recordCareQueueItemSchema),
  }),
  backlog: z.object({
    items: z.array(recordCareQueueItemSchema),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
  }),
});
export const recordCareProgressResponseSchema = z.object({
  cleaned: z.number().int(),
  total: z.number().int(),
  stack_size: z.number().int(),
  stacks_total: z.number().int(),
  stacks_done: z.number().int().meta({
    description:
      "Whole stack equivalents of cleaned copies; includes a final partial stack only when the library is complete",
  }),
  next_stack_no: z
    .number()
    .int()
    .nullable()
    .meta({ description: "stacks_done + 1; null when the library is complete or empty" }),
  pace: z
    .object({
      stacks_per_week: z.number(),
      projected_finish_date: z.string().meta({ format: "date-time" }),
    })
    .nullable()
    .meta({
      description:
        "First cleanings over the preceding 28 days / stack size / 4 weeks. Requires two cleaning days spanning at least 7 days.",
    }),
  this_month: z.object({ records: z.number().int(), sessions: z.number().int() }).nullable().meta({
    description:
      "Distinct copies and live sessions logged this calendar month in the display time zone; backdated care uses the session logged time",
  }),
  by_sleeve_type: recordCareSummarySchema.shape.by_sleeve_type,
});
export type RecordCareQueueQuery = z.infer<typeof recordCareQueueQuerySchema>;
export type RecordCareProgressQuery = z.infer<typeof recordCareProgressQuerySchema>;
export type RecordCareQueueItem = z.infer<typeof recordCareQueueItemSchema>;
export type RecordCareQueueResponse = z.infer<typeof recordCareQueueResponseSchema>;
export type RecordCareProgressResponse = z.infer<typeof recordCareProgressResponseSchema>;
export const recordCareQueueJsonSchemas = {
  RecordCareQueueResponse: z.toJSONSchema(recordCareQueueResponseSchema),
  RecordCareProgressResponse: z.toJSONSchema(recordCareProgressResponseSchema),
};

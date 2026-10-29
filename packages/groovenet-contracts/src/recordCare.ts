import { z } from "zod";

// Physical-copy care (#262). A release can stand for several physical copies;
// cleaning and sleeving belong to one copy. A release with no copy rows has one
// implicit default copy, made real by the first action logged against it.
//
// The sleeve and action enums mirror CHECK constraints in the app's
// `migrations/1790726400000_add-record-copies-and-actions.js`; widening one
// needs a migration too.

export const sleeveTypeSchema = z.enum(["original", "paper", "poly-rice-paper-poly", "poly"]);
export const recordActionTypeSchema = z.enum(["cleaned", "sleeved", "inspected", "repaired"]);
export const cleaningMethodSchema = z.enum([
  "dry-brush",
  "wet-manual",
  "vacuum",
  "ultrasonic",
  "other",
]);
export const recordCareStatusSchema = z.enum(["never_cleaned", "overdue", "needs_sleeve"]);
/** A sleeve, or "unknown" for copies with none logged. */
export const recordSleeveFilterSchema = z.union([sleeveTypeSchema, z.literal("unknown")]);

// Timestamps are ISO strings on the wire; `format` documents that without
// making the response parser stricter than it has been.
const dateTime = () => z.string().meta({ format: "date-time" });

export const SLEEVE_TYPES = sleeveTypeSchema.options;
export const RECORD_ACTION_TYPES = recordActionTypeSchema.options;
export const CLEANING_METHODS = cleaningMethodSchema.options;
export const RECORD_CARE_STATUSES = recordCareStatusSchema.options;

/** One physical copy of a release. */
export const recordCopySchema = z.object({
  id: z.number().int(),
  friend_id: z.number().int(),
  release_id: z.string(),
  is_default: z
    .boolean()
    .meta({ description: "The copy an action logged against the release lands on" }),
  label: z.string().nullable().meta({ example: "DJ copy" }),
  notes: z.string().nullable().meta({ example: "Light hairline on B2, plays through." }),
  inner_sleeve_type: sleeveTypeSchema
    .nullable()
    .meta({ description: "From the latest sleeved action; null when none is logged" }),
  last_cleaned_at: dateTime()
    .nullable()
    .meta({ description: "From the latest cleaned action; null when never cleaned" }),
  deleted_at: dateTime().nullable().meta({ example: null }),
  created_at: dateTime(),
  updated_at: dateTime(),
});

/**
 * A copy as listed: a real one, or — asked about one release with no copy
 * rows — its implicit default copy, with `id`, `created_at` and `updated_at`
 * null. Labelling it with the default-copy update makes it real.
 */
export const recordCopyListItemSchema = recordCopySchema.extend({
  id: z
    .number()
    .int()
    .nullable()
    .meta({ description: "Null for a release's implicit default copy" }),
  created_at: dateTime().nullable(),
  updated_at: dateTime().nullable(),
});

export const recordActionDetailsSchema = z
  .object({ method: cleaningMethodSchema.optional() })
  .strict();

export const recordActionSchema = z.object({
  id: z.number().int(),
  copy_id: z.number().int(),
  friend_id: z.number().int(),
  action_type: recordActionTypeSchema,
  occurred_at: dateTime(),
  notes: z.string().nullable().meta({ example: "Two passes, air dried overnight." }),
  sleeve_type: sleeveTypeSchema.nullable().meta({ description: "Set only on a sleeved action" }),
  details: recordActionDetailsSchema,
  voided_at: dateTime()
    .nullable()
    .meta({ description: "Set once voided; a voided action stays in the history", example: null }),
  created_at: dateTime(),
});

/** One row of the care views; `copy_id` null is an album's implicit default copy. */
export const recordCareItemSchema = z.object({
  friend_id: z.number().int(),
  release_id: z.string(),
  album_title: z.string(),
  album_artist: z.string(),
  album_thumbnail: z.string().nullable(),
  copy_id: z
    .number()
    .int()
    .nullable()
    .meta({ description: "Null for an album with no copy rows: its implicit default copy" }),
  is_default: z.boolean(),
  label: z.string().nullable().meta({ example: null }),
  inner_sleeve_type: sleeveTypeSchema.nullable(),
  last_cleaned_at: dateTime().nullable(),
});

export const recordCopyListResponseSchema = z.object({
  items: z.array(recordCopyListItemSchema),
  // Days since a cleaning before a copy is overdue, so a client can flag one
  // without asking for the whole care summary.
  overdue_days: z.number().int(),
});

export const recordCopyResponseSchema = z.object({ copy: recordCopySchema });

export const recordCopyDeleteResponseSchema = z.object({
  success: z.boolean(),
  copy: recordCopySchema,
});

export const recordActionListResponseSchema = z.object({
  items: z.array(recordActionSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});

export const recordActionMutationResponseSchema = z.object({
  action: recordActionSchema,
  /** The copy with its care state after the change. */
  copy: recordCopySchema,
});

export const recordActionVoidResponseSchema = recordActionMutationResponseSchema.extend({
  success: z.boolean(),
});

export const recordCareResponseSchema = z.object({
  items: z.array(recordCareItemSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
  overdue_days: z.number().int(),
  needs_sleeve_type: sleeveTypeSchema,
});

export const recordCareSummarySchema = z.object({
  total: z.number().int(),
  never_cleaned: z.number().int(),
  overdue: z.number().int(),
  needs_sleeve: z.number().int(),
  by_sleeve_type: z.object({
    original: z.number().int(),
    paper: z.number().int(),
    "poly-rice-paper-poly": z.number().int(),
    poly: z.number().int(),
    unknown: z.number().int(),
  }),
  overdue_days: z.number().int(),
  needs_sleeve_type: sleeveTypeSchema,
});

// ── Requests ────────────────────────────────────────────────────────────────
// Bodies are exported twice: the plain object (`*ObjectSchema`), which the
// app extends with its text-coercing ids, and the refined wire schema. Zod
// refuses to `.extend()` an object once it carries refinements, so each
// refinement is exported too and the app reapplies it.

const copyNoteFields = {
  label: z.string().max(100).nullable().optional(),
  notes: z.string().nullable().optional(),
};

export const recordCopyCreateSchema = z.object({
  friend_id: z.number().int(),
  release_id: z.string().min(1),
  ...copyNoteFields,
});

/** Shared by both copy updates: there must be something to change. */
export const requireLabelOrNotes = [
  (value: { label?: string | null; notes?: string | null }) =>
    value.label !== undefined || value.notes !== undefined,
  { message: "Provide label or notes" },
] as const;

/** The sleeve is not editable here: log a `sleeved` action. */
export const recordCopyUpdateObjectSchema = z.object({
  friend_id: z.number().int(),
  ...copyNoteFields,
});
export const recordCopyUpdateSchema = recordCopyUpdateObjectSchema.refine(...requireLabelOrNotes);

/** Label or annotate a release's default copy, real or still implicit. */
export const recordCopyDefaultUpdateObjectSchema = z.object({
  friend_id: z.number().int(),
  release_id: z.string().min(1),
  ...copyNoteFields,
});
export const recordCopyDefaultUpdateSchema = recordCopyDefaultUpdateObjectSchema.refine(
  ...requireLabelOrNotes,
);

const timestampSchema = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Must be a date-time");

export const recordActionCreateObjectSchema = z.object({
  friend_id: z.number().int(),
  copy_id: z.number().int().optional(),
  release_id: z.string().min(1).optional(),
  action_type: recordActionTypeSchema,
  occurred_at: timestampSchema
    .optional()
    .meta({ format: "date-time", description: "Defaults to now; may be backdated" }),
  notes: z.string().nullable().optional(),
  sleeve_type: sleeveTypeSchema
    .optional()
    .meta({ description: "Required for a sleeved action, and only for one" }),
  details: recordActionDetailsSchema
    .optional()
    .meta({ description: "`method` only for a cleaned action" }),
});

type RecordActionCreateFields = z.infer<typeof recordActionCreateObjectSchema>;

/** Rules a single JSON Schema cannot state; the route description repeats them. */
export function refineRecordActionCreate(
  value: RecordActionCreateFields,
  ctx: z.RefinementCtx,
): void {
  if ((value.copy_id === undefined) === (value.release_id === undefined)) {
    ctx.addIssue({ code: "custom", message: "Provide exactly one of copy_id or release_id" });
  }
  if ((value.action_type === "sleeved") !== (value.sleeve_type !== undefined)) {
    ctx.addIssue({
      code: "custom",
      path: ["sleeve_type"],
      message: "sleeve_type is required for a sleeved action, and only for one",
    });
  }
  if (value.details?.method !== undefined && value.action_type !== "cleaned") {
    ctx.addIssue({
      code: "custom",
      path: ["details", "method"],
      message: "details.method is only for a cleaned action",
    });
  }
}

export const recordActionCreateSchema =
  recordActionCreateObjectSchema.superRefine(refineRecordActionCreate);

// Query strings: these describe the coerced wire values. The app's route
// schemas keep their own text coercion and defaults.
export const recordActionListQuerySchema = z.object({
  friend_id: z.number().int(),
  action_type: recordActionTypeSchema.optional(),
  include_voided: z.boolean().optional(),
  limit: z.number().int().min(0).optional(),
  offset: z.number().int().min(0).optional(),
});

export const recordCareQuerySchema = z.object({
  friend_id: z.number().int(),
  status: recordCareStatusSchema.optional(),
  /** Defaults to the server's RECORD_CLEANING_OVERDUE_DAYS (365). */
  overdue_days: z.number().int().min(1).optional(),
  /** Defaults to poly-rice-paper-poly. */
  needs_sleeve: sleeveTypeSchema.optional(),
  sleeve_type: recordSleeveFilterSchema.optional(),
  limit: z.number().int().min(0).optional(),
  offset: z.number().int().min(0).optional(),
});

export const recordCareSummaryQuerySchema = recordCareQuerySchema.pick({
  friend_id: true,
  overdue_days: true,
  needs_sleeve: true,
});

export type SleeveType = z.infer<typeof sleeveTypeSchema>;
export type RecordActionType = z.infer<typeof recordActionTypeSchema>;
export type CleaningMethod = z.infer<typeof cleaningMethodSchema>;
export type RecordCareStatus = z.infer<typeof recordCareStatusSchema>;
export type RecordSleeveFilter = z.infer<typeof recordSleeveFilterSchema>;
export type RecordCopy = z.infer<typeof recordCopySchema>;
export type RecordCopyListItem = z.infer<typeof recordCopyListItemSchema>;
export type RecordActionDetails = z.infer<typeof recordActionDetailsSchema>;
export type RecordAction = z.infer<typeof recordActionSchema>;
export type RecordCareItem = z.infer<typeof recordCareItemSchema>;
export type RecordCopyListResponse = z.infer<typeof recordCopyListResponseSchema>;
export type RecordCopyResponse = z.infer<typeof recordCopyResponseSchema>;
export type RecordCopyDeleteResponse = z.infer<typeof recordCopyDeleteResponseSchema>;
export type RecordActionListResponse = z.infer<typeof recordActionListResponseSchema>;
export type RecordActionMutationResponse = z.infer<typeof recordActionMutationResponseSchema>;
export type RecordActionVoidResponse = z.infer<typeof recordActionVoidResponseSchema>;
export type RecordCareResponse = z.infer<typeof recordCareResponseSchema>;
export type RecordCareSummary = z.infer<typeof recordCareSummarySchema>;
export type RecordCopyCreate = z.infer<typeof recordCopyCreateSchema>;
export type RecordCopyUpdate = z.infer<typeof recordCopyUpdateSchema>;
export type RecordCopyDefaultUpdate = z.infer<typeof recordCopyDefaultUpdateSchema>;
export type RecordActionListQuery = z.infer<typeof recordActionListQuerySchema>;
export type RecordCareQuery = z.infer<typeof recordCareQuerySchema>;
export type RecordCareSummaryQuery = z.infer<typeof recordCareSummaryQuerySchema>;

type RecordActionCreateBase = Omit<RecordActionCreateFields, "copy_id" | "release_id">;
/**
 * Against a copy, or against a release — which lands on its default copy,
 * created if it has none. The schema's refinement enforces "exactly one";
 * this type states it for callers.
 */
export type RecordActionCreate =
  | (RecordActionCreateBase & { copy_id: number; release_id?: never })
  | (RecordActionCreateBase & { copy_id?: never; release_id: string });

export const recordCareJsonSchemas = {
  SleeveType: z.toJSONSchema(sleeveTypeSchema),
  RecordActionType: z.toJSONSchema(recordActionTypeSchema),
  CleaningMethod: z.toJSONSchema(cleaningMethodSchema),
  RecordCareStatus: z.toJSONSchema(recordCareStatusSchema),
  RecordCopy: z.toJSONSchema(recordCopySchema),
  RecordCopyListItem: z.toJSONSchema(recordCopyListItemSchema),
  RecordAction: z.toJSONSchema(recordActionSchema),
  RecordCareItem: z.toJSONSchema(recordCareItemSchema),
  RecordCopyListResponse: z.toJSONSchema(recordCopyListResponseSchema),
  RecordCopyResponse: z.toJSONSchema(recordCopyResponseSchema),
  RecordCopyDeleteResponse: z.toJSONSchema(recordCopyDeleteResponseSchema),
  RecordActionListResponse: z.toJSONSchema(recordActionListResponseSchema),
  RecordActionMutationResponse: z.toJSONSchema(recordActionMutationResponseSchema),
  RecordActionVoidResponse: z.toJSONSchema(recordActionVoidResponseSchema),
  RecordCareResponse: z.toJSONSchema(recordCareResponseSchema),
  RecordCareSummary: z.toJSONSchema(recordCareSummarySchema),
  RecordCopyCreate: z.toJSONSchema(recordCopyCreateSchema, { io: "input" }),
  RecordCopyUpdate: z.toJSONSchema(recordCopyUpdateSchema, { io: "input" }),
  RecordCopyDefaultUpdate: z.toJSONSchema(recordCopyDefaultUpdateSchema, { io: "input" }),
  RecordActionCreate: z.toJSONSchema(recordActionCreateSchema, { io: "input" }),
};

import { z } from "zod";
import {
  recordActionCreateObjectSchema,
  recordActionDetailsSchema,
  recordActionSchema,
  recordActionTypeSchema,
  recordCareSourceSchema,
  recordCopySchema,
  refineRecordActionCreate,
  sleeveTypeSchema,
  type RecordActionType,
} from "./recordCare.js";

// Care stacks and batch logs (#941). A session groups the actions of one log:
// pulled from the queue it is a numbered "stack", waiting `open` while its
// copies are cleaned; logged as an ad-hoc selection it has no number. Undo
// voids the session's actions and reopens a stack.
//
// The status enum mirrors a CHECK constraint in the app's
// `migrations/1793600000000_add-record-care-sessions.js`.

export const recordCareSessionStatusSchema = z.enum(["open", "logged", "discarded"]);
export const RECORD_CARE_SESSION_STATUSES = recordCareSessionStatusSchema.options;

const dateTime = () => z.string().meta({ format: "date-time" });

/** One copy in a stack; `copy_id` null is the release's implicit default copy. */
export const recordCareStackItemSchema = z.object({
  position: z.number().int(),
  copy_id: z
    .number()
    .int()
    .nullable()
    .meta({ description: "Null for a release's implicit default copy" }),
  release_id: z.string(),
  album_title: z.string().nullable().meta({ description: "Null once the album has left" }),
  album_artist: z.string().nullable(),
  album_thumbnail: z.string().nullable(),
  library_identifier: z.string().nullable().meta({
    description: "Shelf code the album is filed under; null if none or the album has left",
  }),
  inner_sleeve_type: sleeveTypeSchema.nullable(),
  last_cleaned_at: dateTime().nullable(),
});

export const recordCareSessionSchema = z.object({
  id: z.number().int(),
  friend_id: z.number().int(),
  stack_no: z
    .number()
    .int()
    .nullable()
    .meta({ description: "Per-friend stack number; null for an ad-hoc selection" }),
  source: recordCareSourceSchema,
  status: recordCareSessionStatusSchema,
  created_at: dateTime(),
  logged_at: dateTime().nullable(),
  voided_at: dateTime()
    .nullable()
    .meta({ description: "Set when the log was undone; cleared when it is logged again" }),
  items: z.array(recordCareStackItemSchema),
});

export const recordCareStackResponseSchema = z.object({ stack: recordCareSessionSchema });

export const recordCareStackPullResponseSchema = recordCareStackResponseSchema.extend({
  created: z
    .boolean()
    .meta({ description: "False when an open stack already existed and is returned instead" }),
});

export const recordCareStackListResponseSchema = z.object({
  items: z.array(recordCareSessionSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});

export const recordCareStackDiscardResponseSchema = recordCareStackResponseSchema.extend({
  success: z.boolean(),
});

/** A batch log or its undo: the session and every action and copy it touched. */
export const recordCareSessionMutationResponseSchema = z.object({
  session: recordCareSessionSchema,
  actions: z.array(recordActionSchema),
  /** The copies with their care state after the change. */
  copies: z.array(recordCopySchema),
});

export const recordCareSessionVoidResponseSchema = recordCareSessionMutationResponseSchema.extend({
  success: z.boolean(),
});

/**
 * One entry of the care log: a session, or an action logged on its own (the
 * album page, rows from before sessions), shown as a one-copy entry.
 */
export const recordCareLogEntrySchema = z.object({
  kind: z.enum(["session", "action"]),
  session_id: z.number().int().nullable(),
  action_id: z
    .number()
    .int()
    .nullable()
    .meta({ description: "Set only for an action logged on its own" }),
  stack_no: z.number().int().nullable(),
  source: recordCareSourceSchema,
  action_types: z.array(recordActionTypeSchema),
  record_count: z.number().int(),
  method: recordActionDetailsSchema.shape.method.unwrap().nullable(),
  sleeve_type: sleeveTypeSchema.nullable(),
  notes: z.string().nullable(),
  occurred_at: dateTime(),
  voided: z.boolean(),
  thumbnails: z.array(z.string()).meta({ description: "Up to ten covers" }),
});

export const recordCareLogResponseSchema = z.object({
  items: z.array(recordCareLogEntrySchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

// ── Requests ────────────────────────────────────────────────────────────────
// As in recordCare.ts: plain `*ObjectSchema`s for the app to extend, and the
// refinements exported separately.

/** A copy, or a release's default copy (created when the stack is logged). */
export const recordCareCopyRefSchema = z
  .object({
    copy_id: z.number().int().optional(),
    release_id: z.string().min(1).optional(),
  })
  .refine((value) => (value.copy_id === undefined) !== (value.release_id === undefined), {
    message: "Provide exactly one of copy_id or release_id",
  });

const copiesField = z.array(recordCareCopyRefSchema).min(1).max(200);

export const RECORD_CARE_STACK_DEFAULT_SIZE = 10;

export const recordCareStackPullObjectSchema = z.object({
  friend_id: z.number().int(),
  size: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .meta({ description: "Copies to pull from the queue; default 10" }),
  copies: copiesField
    .optional()
    .meta({ description: "An explicit stack, in order, instead of the queue" }),
  source: recordCareSourceSchema.optional().meta({ description: "Defaults to api" }),
});
export const recordCareStackPullSchema = recordCareStackPullObjectSchema;

export const recordCareSessionCreateObjectSchema = z.object({
  friend_id: z.number().int(),
  stack_id: z.number().int().optional().meta({ description: "An open stack to log" }),
  copies: copiesField.optional().meta({ description: "An ad-hoc selection, instead of a stack" }),
  action_types: z.array(recordActionTypeSchema).min(1),
  occurred_at: recordActionCreateObjectSchema.shape.occurred_at,
  notes: z.string().nullable().optional(),
  sleeve_type: sleeveTypeSchema
    .optional()
    .meta({ description: "Required when sleeved is included, and only then" }),
  details: recordActionDetailsSchema
    .optional()
    .meta({ description: "`method` only when cleaned is included" }),
  source: recordCareSourceSchema.optional().meta({ description: "Defaults to api" }),
});

type RecordCareSessionCreateFields = z.infer<typeof recordCareSessionCreateObjectSchema>;
type SessionActionFields = Pick<
  RecordCareSessionCreateFields,
  "occurred_at" | "notes" | "sleeve_type" | "details"
>;

/**
 * The single-action payload a batch writes for one type: the sleeve rides on
 * the sleeved action only, the method on the cleaned one only. The service
 * writes these, and the refinement checks each against the single-action rules.
 */
export function sessionActionFor<T extends SessionActionFields>(
  value: T,
  actionType: RecordActionType,
): SessionActionFields & { action_type: RecordActionType } {
  return {
    action_type: actionType,
    occurred_at: value.occurred_at,
    notes: value.notes,
    sleeve_type: actionType === "sleeved" ? value.sleeve_type : undefined,
    details: actionType === "cleaned" ? value.details : undefined,
  };
}

export function refineRecordCareSessionCreate(
  value: RecordCareSessionCreateFields,
  ctx: z.RefinementCtx,
): void {
  if ((value.stack_id === undefined) === (value.copies === undefined)) {
    ctx.addIssue({ code: "custom", message: "Provide exactly one of stack_id or copies" });
  }
  if (new Set(value.action_types).size !== value.action_types.length) {
    ctx.addIssue({
      code: "custom",
      path: ["action_types"],
      message: "action_types must not repeat",
    });
  }
  if (value.sleeve_type !== undefined && !value.action_types.includes("sleeved")) {
    ctx.addIssue({
      code: "custom",
      path: ["sleeve_type"],
      message: "sleeve_type is only for a log that includes sleeved",
    });
  }
  if (value.details?.method !== undefined && !value.action_types.includes("cleaned")) {
    ctx.addIssue({
      code: "custom",
      path: ["details", "method"],
      message: "details.method is only for a log that includes cleaned",
    });
  }
  // Each type's action must pass the single-action rules. The copy is not
  // part of those payloads, so name one to satisfy the copy rule.
  for (const actionType of new Set(value.action_types)) {
    refineRecordActionCreate(
      { ...sessionActionFor(value, actionType), friend_id: value.friend_id, copy_id: 0 },
      ctx,
    );
  }
}

export const recordCareSessionCreateSchema = recordCareSessionCreateObjectSchema.superRefine(
  refineRecordCareSessionCreate,
);

export const recordCareSessionVoidSchema = z.object({ friend_id: z.number().int() });

export const recordCareStackListQuerySchema = z.object({
  friend_id: z.number().int(),
  status: recordCareSessionStatusSchema.optional(),
  limit: z.number().int().min(0).optional(),
  offset: z.number().int().min(0).optional(),
});

export const recordCareLogQuerySchema = z.object({
  friend_id: z.number().int(),
  limit: z.number().int().min(0).optional(),
  offset: z.number().int().min(0).optional(),
});

export type RecordCareSessionStatus = z.infer<typeof recordCareSessionStatusSchema>;
export type RecordCareStackItem = z.infer<typeof recordCareStackItemSchema>;
export type RecordCareSession = z.infer<typeof recordCareSessionSchema>;
export type RecordCareStackResponse = z.infer<typeof recordCareStackResponseSchema>;
export type RecordCareStackPullResponse = z.infer<typeof recordCareStackPullResponseSchema>;
export type RecordCareStackListResponse = z.infer<typeof recordCareStackListResponseSchema>;
export type RecordCareStackDiscardResponse = z.infer<typeof recordCareStackDiscardResponseSchema>;
export type RecordCareSessionMutationResponse = z.infer<
  typeof recordCareSessionMutationResponseSchema
>;
export type RecordCareSessionVoidResponse = z.infer<typeof recordCareSessionVoidResponseSchema>;
export type RecordCareLogEntry = z.infer<typeof recordCareLogEntrySchema>;
export type RecordCareLogResponse = z.infer<typeof recordCareLogResponseSchema>;
export type RecordCareCopyRef = z.infer<typeof recordCareCopyRefSchema>;
export type RecordCareStackPull = z.infer<typeof recordCareStackPullSchema>;
export type RecordCareSessionCreate = z.infer<typeof recordCareSessionCreateSchema>;
export type RecordCareSessionVoid = z.infer<typeof recordCareSessionVoidSchema>;
export type RecordCareStackListQuery = z.infer<typeof recordCareStackListQuerySchema>;
export type RecordCareLogQuery = z.infer<typeof recordCareLogQuerySchema>;

export const recordCareSessionJsonSchemas = {
  RecordCareSessionStatus: z.toJSONSchema(recordCareSessionStatusSchema),
  RecordCareStackItem: z.toJSONSchema(recordCareStackItemSchema),
  RecordCareSession: z.toJSONSchema(recordCareSessionSchema),
  RecordCareStackResponse: z.toJSONSchema(recordCareStackResponseSchema),
  RecordCareStackPullResponse: z.toJSONSchema(recordCareStackPullResponseSchema),
  RecordCareStackListResponse: z.toJSONSchema(recordCareStackListResponseSchema),
  RecordCareStackDiscardResponse: z.toJSONSchema(recordCareStackDiscardResponseSchema),
  RecordCareSessionMutationResponse: z.toJSONSchema(recordCareSessionMutationResponseSchema),
  RecordCareSessionVoidResponse: z.toJSONSchema(recordCareSessionVoidResponseSchema),
  RecordCareLogEntry: z.toJSONSchema(recordCareLogEntrySchema),
  RecordCareLogResponse: z.toJSONSchema(recordCareLogResponseSchema),
  RecordCareStackPull: z.toJSONSchema(recordCareStackPullSchema, { io: "input" }),
  RecordCareSessionCreate: z.toJSONSchema(recordCareSessionCreateSchema, { io: "input" }),
  RecordCareSessionVoid: z.toJSONSchema(recordCareSessionVoidSchema, { io: "input" }),
};

import { describe, expect, it } from "vitest";
import {
  CLEANING_METHODS,
  RECORD_ACTION_TYPES,
  RECORD_CARE_STATUSES,
  SLEEVE_TYPES,
  recordActionCreateSchema,
  recordActionDetailsSchema,
  recordActionVoidResponseSchema,
  recordCareJsonSchemas,
  recordCareQuerySchema,
  recordCareResponseSchema,
  recordCareSummaryQuerySchema,
  recordCareSummarySchema,
  recordCopyDefaultUpdateSchema,
  recordCopyListResponseSchema,
  recordCopyUpdateSchema,
  recordSleeveFilterSchema,
} from "./recordCare.js";

const copy = {
  id: 7,
  friend_id: 1,
  release_id: "r1",
  is_default: true,
  label: null,
  notes: null,
  inner_sleeve_type: "poly" as const,
  last_cleaned_at: "2026-10-01T00:00:00.000Z",
  deleted_at: null,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
};

const action = {
  id: 3,
  copy_id: 7,
  friend_id: 1,
  action_type: "cleaned" as const,
  occurred_at: "2026-10-01T00:00:00.000Z",
  notes: null,
  sleeve_type: null,
  details: { method: "ultrasonic" as const },
  voided_at: null,
  created_at: "2026-10-01T00:00:00.000Z",
};

describe("record care contracts", () => {
  it("fixes the enum vocabularies the database CHECK constraints mirror", () => {
    expect(SLEEVE_TYPES).toEqual(["original", "paper", "poly-rice-paper-poly", "poly"]);
    expect(RECORD_ACTION_TYPES).toEqual(["cleaned", "sleeved", "inspected", "repaired"]);
    expect(CLEANING_METHODS).toEqual(["dry-brush", "wet-manual", "vacuum", "ultrasonic", "other"]);
    expect(RECORD_CARE_STATUSES).toEqual(["never_cleaned", "overdue", "needs_sleeve"]);
    expect(recordSleeveFilterSchema.parse("unknown")).toBe("unknown");
    expect(recordSleeveFilterSchema.safeParse("vinyl").success).toBe(false);
  });

  it("lists a real copy beside a release's implicit default copy", () => {
    const implicit = {
      ...copy,
      id: null,
      created_at: null,
      updated_at: null,
      inner_sleeve_type: null,
    };
    expect(
      recordCopyListResponseSchema.parse({ items: [copy, implicit], overdue_days: 365 }).items,
    ).toHaveLength(2);
    expect(
      recordCopyListResponseSchema.safeParse({
        items: [{ ...copy, inner_sleeve_type: "box" }],
        overdue_days: 1,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown action details and validates the void response", () => {
    expect(recordActionDetailsSchema.safeParse({ method: "vacuum" }).success).toBe(true);
    expect(recordActionDetailsSchema.safeParse({ brush: "carbon" }).success).toBe(false);
    expect(
      recordActionVoidResponseSchema.parse({ success: true, action, copy }).action.details.method,
    ).toBe("ultrasonic");
  });

  it("requires something to change on a copy update", () => {
    expect(
      recordCopyUpdateSchema.safeParse({ friend_id: 1, label: "Original pressing" }).success,
    ).toBe(true);
    expect(recordCopyUpdateSchema.safeParse({ friend_id: 1, notes: null }).success).toBe(true);
    expect(recordCopyUpdateSchema.safeParse({ friend_id: 1 }).error?.issues[0]?.message).toBe(
      "Provide label or notes",
    );
    expect(
      recordCopyDefaultUpdateSchema.safeParse({ friend_id: 1, release_id: "r1" }).success,
    ).toBe(false);
    expect(
      recordCopyDefaultUpdateSchema.safeParse({
        friend_id: 1,
        release_id: "r1",
        label: "x".repeat(101),
      }).success,
    ).toBe(false);
  });

  it("enforces the action-create rules a JSON Schema cannot state", () => {
    const messages = (body: unknown) =>
      recordActionCreateSchema.safeParse(body).error?.issues.map((issue) => issue.message) ?? [];

    expect(
      messages({
        friend_id: 1,
        copy_id: 7,
        action_type: "cleaned",
        details: { method: "wet-manual" },
      }),
    ).toEqual([]);
    expect(
      messages({ friend_id: 1, release_id: "r1", action_type: "sleeved", sleeve_type: "paper" }),
    ).toEqual([]);
    expect(messages({ friend_id: 1, action_type: "inspected" })).toEqual([
      "Provide exactly one of copy_id or release_id",
    ]);
    expect(
      messages({ friend_id: 1, copy_id: 7, release_id: "r1", action_type: "inspected" }),
    ).toEqual(["Provide exactly one of copy_id or release_id"]);
    expect(messages({ friend_id: 1, copy_id: 7, action_type: "sleeved" })).toEqual([
      "sleeve_type is required for a sleeved action, and only for one",
    ]);
    expect(
      messages({ friend_id: 1, copy_id: 7, action_type: "repaired", sleeve_type: "poly" }),
    ).toEqual(["sleeve_type is required for a sleeved action, and only for one"]);
    expect(
      messages({
        friend_id: 1,
        copy_id: 7,
        action_type: "inspected",
        details: { method: "other" },
      }),
    ).toEqual(["details.method is only for a cleaned action"]);
    expect(
      messages({ friend_id: 1, copy_id: 7, action_type: "cleaned", occurred_at: "yesterday" }),
    ).toEqual(["Must be a date-time"]);
  });

  it("validates care views and their wire queries", () => {
    const item = {
      friend_id: 1,
      release_id: "r1",
      album_title: "Album",
      album_artist: "Artist",
      album_thumbnail: null,
      copy_id: null,
      is_default: true,
      label: null,
      inner_sleeve_type: null,
      last_cleaned_at: null,
    };
    expect(
      recordCareResponseSchema.safeParse({
        items: [item],
        total: 1,
        limit: 50,
        offset: 0,
        overdue_days: 365,
        needs_sleeve_type: "poly-rice-paper-poly",
      }).success,
    ).toBe(true);
    const byType = { original: 1, paper: 2, "poly-rice-paper-poly": 3, poly: 4, unknown: 5 };
    expect(
      recordCareSummarySchema.parse({
        total: 15,
        never_cleaned: 1,
        overdue: 2,
        needs_sleeve: 3,
        by_sleeve_type: byType,
        overdue_days: 365,
        needs_sleeve_type: "poly",
      }).by_sleeve_type.unknown,
    ).toBe(5);
    expect(
      recordCareQuerySchema.safeParse({ friend_id: 1, status: "overdue", sleeve_type: "unknown" })
        .success,
    ).toBe(true);
    expect(recordCareQuerySchema.safeParse({ friend_id: 1, overdue_days: 0 }).success).toBe(false);
    expect(recordCareSummaryQuerySchema.parse({ friend_id: 1, status: "overdue" })).toEqual({
      friend_id: 1,
    });
  });

  it("publishes enums and request bodies for OpenAPI", () => {
    expect(recordCareJsonSchemas.SleeveType.enum).toEqual([...SLEEVE_TYPES]);
    expect(recordCareJsonSchemas.RecordActionType.enum).toEqual([...RECORD_ACTION_TYPES]);
    expect(recordCareJsonSchemas.CleaningMethod.enum).toEqual([...CLEANING_METHODS]);
    expect(recordCareJsonSchemas.RecordCareStatus.enum).toEqual([...RECORD_CARE_STATUSES]);
    expect(recordCareJsonSchemas.RecordActionCreate.required).toEqual(["friend_id", "action_type"]);
    expect(recordCareJsonSchemas.RecordActionCreate.additionalProperties).toBeUndefined();
    expect(recordCareJsonSchemas.RecordCopyUpdate.required).toEqual(["friend_id"]);
  });
});

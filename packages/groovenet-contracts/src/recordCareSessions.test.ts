import { describe, expect, it } from "vitest";
import { RECORD_CARE_SOURCES } from "./recordCare.js";
import {
  RECORD_CARE_SESSION_STATUSES,
  recordCareLogResponseSchema,
  recordCareSessionCreateSchema,
  recordCareSessionJsonSchemas,
  recordCareSessionVoidResponseSchema,
  recordCareStackPullResponseSchema,
  recordCareStackPullSchema,
  sessionActionFor,
} from "./recordCareSessions.js";

const TS = "2026-10-01T00:00:00.000Z";

const session = {
  id: 4,
  friend_id: 1,
  stack_no: 2,
  source: "web" as const,
  status: "open" as const,
  created_at: TS,
  logged_at: null,
  voided_at: null,
  items: [
    {
      position: 0,
      copy_id: null,
      release_id: "r1",
      album_title: "Album",
      album_artist: "Artist",
      album_thumbnail: null,
      inner_sleeve_type: null,
      last_cleaned_at: null,
    },
  ],
};

const messages = (body: unknown) =>
  recordCareSessionCreateSchema.safeParse(body).error?.issues.map((issue) => issue.message) ?? [];

describe("record care session contracts", () => {
  it("fixes the status and source vocabularies the CHECK constraints mirror", () => {
    expect(RECORD_CARE_SESSION_STATUSES).toEqual(["open", "logged", "discarded"]);
    expect(RECORD_CARE_SOURCES).toEqual(["web", "cli", "mcp", "api"]);
    expect(recordCareSessionJsonSchemas.RecordCareSessionStatus.enum).toEqual([
      ...RECORD_CARE_SESSION_STATUSES,
    ]);
  });

  it("parses a pulled stack and validates its pull body", () => {
    expect(
      recordCareStackPullResponseSchema.parse({ stack: session, created: true }).stack.items,
    ).toHaveLength(1);
    expect(recordCareStackPullSchema.safeParse({ friend_id: 1, size: 0 }).success).toBe(false);
    expect(
      recordCareStackPullSchema.safeParse({ friend_id: 1, copies: [{ copy_id: 3 }] }).success,
    ).toBe(true);
    expect(
      recordCareStackPullSchema.safeParse({
        friend_id: 1,
        copies: [{ copy_id: 3, release_id: "r" }],
      }).error?.issues[0]?.message,
    ).toBe("Provide exactly one of copy_id or release_id");
    expect(recordCareStackPullSchema.safeParse({ friend_id: 1, copies: [] }).success).toBe(false);
  });

  it("accepts a multi-type batch with the sleeve and method on their own types", () => {
    expect(
      messages({
        friend_id: 1,
        stack_id: 4,
        action_types: ["cleaned", "sleeved"],
        sleeve_type: "poly-rice-paper-poly",
        details: { method: "ultrasonic" },
        source: "cli",
      }),
    ).toEqual([]);
    expect(
      messages({ friend_id: 1, copies: [{ release_id: "r1" }], action_types: ["inspected"] }),
    ).toEqual([]);
  });

  it("enforces the batch rules", () => {
    expect(messages({ friend_id: 1, action_types: ["cleaned"] })).toEqual([
      "Provide exactly one of stack_id or copies",
    ]);
    expect(
      messages({ friend_id: 1, stack_id: 4, copies: [{ copy_id: 3 }], action_types: ["cleaned"] }),
    ).toEqual(["Provide exactly one of stack_id or copies"]);
    expect(messages({ friend_id: 1, stack_id: 4, action_types: [] }).length).toBeGreaterThan(0);
    expect(messages({ friend_id: 1, stack_id: 4, action_types: ["cleaned", "cleaned"] })).toEqual([
      "action_types must not repeat",
    ]);
    expect(messages({ friend_id: 1, stack_id: 4, action_types: ["cleaned", "sleeved"] })).toEqual([
      "sleeve_type is required for a sleeved action, and only for one",
    ]);
    expect(
      messages({ friend_id: 1, stack_id: 4, action_types: ["cleaned"], sleeve_type: "poly" }),
    ).toEqual(["sleeve_type is only for a log that includes sleeved"]);
    expect(
      messages({
        friend_id: 1,
        stack_id: 4,
        action_types: ["sleeved"],
        sleeve_type: "poly",
        details: { method: "vacuum" },
      }),
    ).toEqual(["details.method is only for a log that includes cleaned"]);
    expect(
      messages({ friend_id: 1, stack_id: 4, action_types: ["cleaned"], occurred_at: "soon" }),
    ).toEqual(["Must be a date-time"]);
  });

  it("splits a batch into each type's single-action payload", () => {
    const batch = {
      occurred_at: TS,
      notes: "Two passes",
      sleeve_type: "poly" as const,
      details: { method: "vacuum" as const },
    };
    expect(sessionActionFor(batch, "cleaned")).toEqual({
      action_type: "cleaned",
      occurred_at: TS,
      notes: "Two passes",
      sleeve_type: undefined,
      details: { method: "vacuum" },
    });
    expect(sessionActionFor(batch, "sleeved")).toMatchObject({
      sleeve_type: "poly",
      details: undefined,
    });
  });

  it("parses an undo and the care log feed", () => {
    expect(
      recordCareSessionVoidResponseSchema.parse({
        success: true,
        session: { ...session, status: "open", voided_at: TS },
        actions: [],
        copies: [],
      }).session.voided_at,
    ).toBe(TS);
    expect(
      recordCareLogResponseSchema.parse({
        items: [
          {
            kind: "session",
            session_id: 4,
            action_id: null,
            stack_no: 2,
            source: "web",
            action_types: ["cleaned", "sleeved"],
            record_count: 10,
            method: "ultrasonic",
            sleeve_type: "poly",
            notes: null,
            occurred_at: TS,
            voided: false,
            thumbnails: ["https://example.test/a.jpg"],
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      }).items[0].record_count,
    ).toBe(10);
  });
});

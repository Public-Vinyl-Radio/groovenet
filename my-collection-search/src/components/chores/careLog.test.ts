import { describe, expect, it } from "vitest";
import {
  buildLogCareBody,
  careLogHeadline,
  careLogWhen,
  careSourceBadge,
  careTypesLabel,
  copyRefFromKey,
  initialLogCareState,
  logCareBodyError,
  logCareFormErrors,
  logCareTitle,
  toggleCareType,
  undoErrorText,
  ANOTHER_STACK_OPEN_MESSAGE,
  type LogCareFormState,
} from "./careLog";

const NOW = new Date("2026-11-01T18:30:00Z");
const TZ = "America/Los_Angeles";

const state = (patch: Partial<LogCareFormState> = {}): LogCareFormState => ({
  ...initialLogCareState("poly-rice-paper-poly", NOW),
  occurredAtInput: "2026-11-01T11:09",
  ...patch,
});

describe("initialLogCareState", () => {
  it("starts on a cleaning, now, with the target sleeve", () => {
    const initial = initialLogCareState("poly", NOW);
    expect(initial.types).toEqual(["cleaned"]);
    expect(initial.sleeveType).toBe("poly");
    expect(initial.method).toBe("");
    expect(initial.occurredAtInput).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

describe("toggleCareType", () => {
  it("adds and removes, keeping the API's order", () => {
    expect(toggleCareType(["sleeved"], "cleaned")).toEqual(["cleaned", "sleeved"]);
    expect(toggleCareType(["cleaned", "sleeved"], "cleaned")).toEqual(["sleeved"]);
  });
});

describe("logCareFormErrors", () => {
  it("passes a valid form", () => {
    expect(logCareFormErrors(state())).toEqual({});
  });

  it("needs a type", () => {
    expect(logCareFormErrors(state({ types: [] })).care).toBe("Choose at least one kind of care.");
  });

  it("needs a date", () => {
    expect(logCareFormErrors(state({ occurredAtInput: "" })).when).toBe("Choose when it happened.");
    expect(logCareFormErrors(state({ occurredAtInput: "not a date" })).when).toBeDefined();
  });

  it("needs a sleeve for a sleeve change only", () => {
    expect(logCareFormErrors(state({ types: ["sleeved"], sleeveType: "" })).sleeve).toBe(
      "Choose the new sleeve.",
    );
    expect(logCareFormErrors(state({ types: ["cleaned"], sleeveType: "" }))).toEqual({});
  });
});

describe("buildLogCareBody", () => {
  it("logs a stack by id", () => {
    expect(buildLogCareBody(state(), { stack_id: 50 })).toEqual({
      stack_id: 50,
      action_types: ["cleaned"],
      occurred_at: new Date("2026-11-01T11:09").toISOString(),
    });
  });

  it("logs a selection by copy, with every type's fields", () => {
    const body = buildLogCareBody(
      state({
        types: ["cleaned", "sleeved"],
        method: "vacuum",
        sleeveType: "poly",
        notes: "  Moved to poly.  ",
      }),
      { copies: [{ copy_id: 3 }, { release_id: "rel-1" }] },
    );
    expect(body).toEqual({
      copies: [{ copy_id: 3 }, { release_id: "rel-1" }],
      action_types: ["cleaned", "sleeved"],
      occurred_at: expect.any(String),
      notes: "Moved to poly.",
      sleeve_type: "poly",
      details: { method: "vacuum" },
    });
  });

  it("drops the sleeve without a sleeve change and the method without a cleaning", () => {
    const body = buildLogCareBody(
      state({ types: ["inspected"], method: "vacuum", sleeveType: "poly", notes: "   " }),
      { stack_id: 50 },
    );
    expect(body).not.toHaveProperty("sleeve_type");
    expect(body).not.toHaveProperty("details");
    expect(body).not.toHaveProperty("notes");
  });
});

describe("logCareBodyError", () => {
  it("passes a body the form built", () => {
    expect(logCareBodyError(buildLogCareBody(state(), { stack_id: 50 }))).toBeNull();
  });

  it("reports what the API's refinement would", () => {
    expect(
      logCareBodyError({ stack_id: 50, action_types: ["sleeved"], occurred_at: NOW.toISOString() }),
    ).toMatch(/sleeve_type/);
    expect(
      logCareBodyError({
        stack_id: 50,
        action_types: ["inspected"],
        details: { method: "vacuum" },
      }),
    ).toMatch(/method/);
    expect(logCareBodyError({ action_types: ["cleaned"] })).toMatch(/stack_id or copies/);
  });
});

describe("wording", () => {
  it("titles the modal", () => {
    expect(logCareTitle(2, 10)).toBe("STACK 2 · 10 RECORDS");
    expect(logCareTitle(null, 1)).toBe("1 RECORD");
  });

  it("reads a selection key back as a copy ref", () => {
    expect(copyRefFromKey("copy:12")).toEqual({ copy_id: 12 });
    expect(copyRefFromKey("release:r-1")).toEqual({ release_id: "r-1" });
  });

  it("joins the types", () => {
    expect(careTypesLabel(["cleaned", "sleeved"])).toBe("CLEANED + SLEEVE CHANGE");
  });

  it("heads an entry, with the stack only for a stack", () => {
    expect(
      careLogHeadline({ stack_no: 1, action_types: ["cleaned", "sleeved"], record_count: 10 }),
    ).toBe("STACK 1 · CLEANED + SLEEVE CHANGE · 10 RECORDS");
    expect(careLogHeadline({ stack_no: null, action_types: ["inspected"], record_count: 1 })).toBe(
      "INSPECTED · 1 RECORD",
    );
  });

  it("badges each source with its own border", () => {
    expect(careSourceBadge("web")).toEqual({ label: "VIA WEB", borderStyle: "dotted" });
    expect(careSourceBadge("cli")).toEqual({ label: "VIA CLI", borderStyle: "solid" });
    expect(careSourceBadge("mcp")).toEqual({ label: "VIA MCP", borderStyle: "dashed" });
    expect(careSourceBadge("api")).toEqual({ label: "VIA API", borderStyle: "double" });
  });

  it("says when, relative to today", () => {
    expect(careLogWhen("2026-11-01T18:09:00Z", TZ, NOW)).toBe("TODAY · 10:09 AM");
    expect(careLogWhen("2026-10-31T16:30:00Z", TZ, NOW)).toBe("YESTERDAY · 9:30 AM");
    expect(careLogWhen("2026-10-17T03:00:00Z", TZ, NOW)).toBe("OCT 16 · 8:00 PM");
    expect(careLogWhen("2025-12-03T04:00:00Z", TZ, NOW)).toBe("DEC 2, 2025 · 8:00 PM");
  });

  it("explains an undo blocked by another stack", () => {
    expect(undoErrorText(new Error(ANOTHER_STACK_OPEN_MESSAGE))).toBe(
      "Another stack is open. Log or clear it, then undo this one.",
    );
    expect(undoErrorText(new Error("boom"))).toBe("Couldn't undo: boom");
    expect(undoErrorText("text")).toBe("Couldn't undo: text");
  });
});

import { describe, expect, it } from "vitest";
import {
  DEFAULT_COPY_KEY,
  buildRecordActionBody,
  copyKey,
  initialRecordActionState,
  recordActionFormError,
} from "./recordActionForm";

const NOW = new Date(2026, 9, 1, 9, 30);

describe("initialRecordActionState", () => {
  it("starts as a cleaning now, on the default copy, with the target sleeve ready", () => {
    expect(initialRecordActionState({}, NOW)).toEqual({
      actionType: "cleaned",
      occurredAtInput: "2026-10-01T09:30",
      notes: "",
      method: "",
      sleeveType: "poly-rice-paper-poly",
      copyKey: DEFAULT_COPY_KEY,
    });
  });

  it("takes an action type and a copy", () => {
    const state = initialRecordActionState({ actionType: "sleeved", copy: { id: 4, is_default: false } }, NOW);
    expect(state.actionType).toBe("sleeved");
    expect(state.copyKey).toBe("4");
  });

  it("defaults to now", () => {
    expect(initialRecordActionState().occurredAtInput).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

describe("copyKey", () => {
  it("keys the default copy, implicit or real, by release", () => {
    expect(copyKey({ id: null, is_default: true })).toBe(DEFAULT_COPY_KEY);
    expect(copyKey({ id: 3, is_default: true })).toBe(DEFAULT_COPY_KEY);
    expect(copyKey({ id: 9, is_default: false })).toBe("9");
  });
});

describe("recordActionFormError", () => {
  it("requires a valid time", () => {
    const state = initialRecordActionState({}, NOW);
    expect(recordActionFormError(state)).toBeNull();
    expect(recordActionFormError({ ...state, occurredAtInput: "" })).toBe("Choose when it happened.");
    expect(recordActionFormError({ ...state, occurredAtInput: "nope" })).toBe(
      "Choose when it happened."
    );
  });
});

describe("buildRecordActionBody", () => {
  const base = initialRecordActionState({}, NOW);
  const occurred_at = new Date(2026, 9, 1, 9, 30).toISOString();

  it("logs against the release for the default copy", () => {
    expect(buildRecordActionBody(base, "rel")).toEqual({
      release_id: "rel",
      action_type: "cleaned",
      occurred_at,
    });
  });

  it("logs a cleaning's method and trimmed note against a real copy", () => {
    expect(
      buildRecordActionBody(
        { ...base, copyKey: "4", method: "ultrasonic", notes: "  two passes " },
        "rel"
      )
    ).toEqual({
      copy_id: 4,
      action_type: "cleaned",
      occurred_at,
      notes: "two passes",
      details: { method: "ultrasonic" },
    });
  });

  it("sends a sleeve only for a sleeve change, and no method", () => {
    expect(
      buildRecordActionBody({ ...base, actionType: "sleeved", method: "vacuum", sleeveType: "poly" }, "rel")
    ).toEqual({ release_id: "rel", action_type: "sleeved", occurred_at, sleeve_type: "poly" });
  });

  it("sends neither for an inspection", () => {
    expect(buildRecordActionBody({ ...base, actionType: "inspected", method: "vacuum" }, "rel")).toEqual(
      { release_id: "rel", action_type: "inspected", occurred_at }
    );
  });
});

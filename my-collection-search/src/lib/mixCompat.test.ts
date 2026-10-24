import { describe, expect, it } from "vitest";
import { camelotOf, describeMix, formatBpmDelta, parseBpm } from "./mixCompat";

describe("describeMix", () => {
  const base = { bpm: 148, key: "A minor" };

  it("calls an identical key the same key", () => {
    expect(describeMix(base, { bpm: 145, key: "A minor" })).toEqual({ bpmDelta: -3, keyRelation: "same" });
  });

  it.each([
    ["E minor", "one step up the wheel"],
    ["D minor", "one step down the wheel"],
    ["C major", "the relative major"],
  ])("calls %s adjacent (%s)", (key) => {
    expect(describeMix(base, { bpm: 150, key }).keyRelation).toBe("adjacent");
  });

  it("wraps round the wheel from 12 to 1", () => {
    expect(describeMix({ key: "E major" }, { key: "B major" }).keyRelation).toBe("adjacent");
  });

  it.each(["F minor", "G major", "D major"])("calls %s a clash", (key) => {
    expect(describeMix(base, { key }).keyRelation).toBe("clash");
  });

  it("makes no claim when either key is unknown or unrecognised", () => {
    expect(describeMix(base, { key: null }).keyRelation).toBeNull();
    expect(describeMix({ key: undefined }, { key: "A minor" }).keyRelation).toBeNull();
    expect(describeMix(base, { key: "H flat" }).keyRelation).toBeNull();
    expect(describeMix(base, { key: "" }).keyRelation).toBeNull();
  });

  it("signs the BPM delta against the current track", () => {
    expect(describeMix(base, { bpm: 150 }).bpmDelta).toBe(2);
    expect(describeMix(base, { bpm: 143 }).bpmDelta).toBe(-5);
    expect(describeMix(base, { bpm: 148 }).bpmDelta).toBe(0);
  });

  it("rounds to whole BPM and never reports negative zero", () => {
    expect(describeMix({ bpm: 120 }, { bpm: 120.4 }).bpmDelta).toBe(0);
    expect(Object.is(describeMix({ bpm: 120 }, { bpm: 119.6 }).bpmDelta, 0)).toBe(true);
    expect(describeMix({ bpm: "120" }, { bpm: "122.6" }).bpmDelta).toBe(3);
  });

  it("has no delta when either tempo is missing or zero", () => {
    expect(describeMix(base, { bpm: null }).bpmDelta).toBeNull();
    expect(describeMix({ bpm: undefined }, { bpm: 120 }).bpmDelta).toBeNull();
    expect(describeMix(base, { bpm: 0 }).bpmDelta).toBeNull();
    expect(describeMix(base, { bpm: "n/a" }).bpmDelta).toBeNull();
  });
});

describe("helpers", () => {
  it("formats deltas with a real minus sign", () => {
    expect(formatBpmDelta(2)).toBe("+2");
    expect(formatBpmDelta(-3)).toBe("−3");
    expect(formatBpmDelta(0)).toBe("0");
  });

  it("parses tempos and Camelot codes", () => {
    expect(parseBpm("128.5")).toBe(128.5);
    expect(parseBpm(-1)).toBeNull();
    expect(camelotOf("a minor")).toBe("8A");
    expect(camelotOf("8a")).toBe("8A");
    expect(camelotOf(undefined)).toBeNull();
  });
});

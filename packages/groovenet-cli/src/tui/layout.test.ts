import { describe, expect, it } from "vitest";
import {
  ART_FULL,
  ART_SIDE,
  FULL_MIN_COLUMNS,
  FULL_MIN_ROWS,
  pickLayout,
  SIDE_MIN_COLUMNS,
  SIDE_MIN_ROWS,
  STRIP_MIN_COLUMNS,
  STRIP_ROWS,
} from "./layout.js";

describe("pickLayout", () => {
  it("picks the design boards' layouts at their sizes", () => {
    expect(pickLayout(120, 40)).toEqual({
      kind: "full",
      columns: 120,
      rows: 40,
      bodyRows: 21,
      boxWidth: 118,
      art: ART_FULL,
    });
    expect(pickLayout(40, 50)).toEqual({
      kind: "side",
      columns: 40,
      rows: 50,
      bodyRows: 25,
      boxWidth: 38,
      art: ART_SIDE,
    });
    expect(pickLayout(120, 5)).toEqual({
      kind: "strip",
      columns: 120,
      rows: 5,
      bodyRows: 0,
      boxWidth: 118,
      art: null,
    });
  });

  it("switches exactly at each breakpoint", () => {
    expect(pickLayout(FULL_MIN_COLUMNS, FULL_MIN_ROWS).kind).toBe("full");
    expect(pickLayout(FULL_MIN_COLUMNS, FULL_MIN_ROWS).bodyRows).toBe(5);
    expect(pickLayout(FULL_MIN_COLUMNS - 1, SIDE_MIN_ROWS).kind).toBe("side");
    expect(pickLayout(SIDE_MIN_COLUMNS, SIDE_MIN_ROWS).bodyRows).toBe(5);
    expect(pickLayout(FULL_MIN_COLUMNS, FULL_MIN_ROWS - 1).kind).toBe("strip");
    expect(pickLayout(SIDE_MIN_COLUMNS - 1, 80).kind).toBe("too-small");
    expect(pickLayout(STRIP_MIN_COLUMNS, STRIP_ROWS).kind).toBe("strip");
    expect(pickLayout(STRIP_MIN_COLUMNS - 1, STRIP_ROWS).kind).toBe("too-small");
    expect(pickLayout(200, STRIP_ROWS - 1).kind).toBe("too-small");
  });

  it("uses the strip for a wide terminal too short for the full window or side pane", () => {
    expect(pickLayout(70, 28).kind).toBe("strip");
    expect(pickLayout(70, 40).kind).toBe("side");
  });

  it("treats a missing or fractional size as what fits", () => {
    expect(pickLayout(Number.NaN, 40)).toMatchObject({
      kind: "too-small",
      columns: 0,
      boxWidth: 0,
      art: null,
    });
    expect(pickLayout(120.9, 40.9)).toMatchObject({ kind: "full", columns: 120, rows: 40 });
    expect(pickLayout(120, Number.NaN)).toMatchObject({ kind: "too-small", rows: 0 });
    expect(pickLayout(-5, -5)).toMatchObject({
      kind: "too-small",
      columns: 0,
      rows: 0,
      bodyRows: 0,
    });
  });
});

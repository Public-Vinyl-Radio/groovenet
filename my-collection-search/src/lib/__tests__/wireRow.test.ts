import { describe, expect, it } from "vitest";
import { toWireRow } from "../wireRow";

describe("toWireRow", () => {
  it("turns Date columns into the ISO strings JSON would produce, leaving the rest", () => {
    const row = { id: 1, at: new Date("2024-03-04T05:06:07Z"), name: null, tags: ["a"] };
    const wire = toWireRow(row);
    expect(wire).toEqual({ id: 1, at: "2024-03-04T05:06:07.000Z", name: null, tags: ["a"] });
    expect(JSON.stringify(wire)).toBe(JSON.stringify(row));
    expect(row.at).toBeInstanceOf(Date);
  });

  it("maps an invalid Date to null, as JSON does", () => {
    const row = { at: new Date("nope") };
    expect(toWireRow(row)).toEqual({ at: null });
    expect(JSON.stringify(toWireRow(row))).toBe(JSON.stringify(row));
  });
});

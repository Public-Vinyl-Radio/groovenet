import { describe, expect, it } from "vitest";
import { boundedIntOption, intOption } from "./options.js";

describe("intOption()", () => {
  it("parses base 10", () => {
    expect(intOption("15")).toBe(15);
  });

  it("ignores the previous value commander passes as a second argument", () => {
    // The bug this exists for: bare parseInt takes that as the radix, so
    // `.option("--limit <n>", …, parseInt, 20)` parsed "15" in base 20 as 25,
    // and a default of 60 put the radix out of range and produced NaN.
    const coerce = intOption as unknown as (v: string, previous: number) => number;
    expect(coerce("15", 20)).toBe(15);
    expect(coerce("15", 60)).toBe(15);
    expect(coerce("500", 1000)).toBe(500);
  });

  it("handles a leading sign and whitespace", () => {
    expect(intOption("-5")).toBe(-5);
    expect(intOption(" 42 ")).toBe(42);
  });

  it("rejects nonsense rather than letting NaN travel", () => {
    // NaN downstream is silent: setTimeout(NaN) fires immediately, turning a
    // poll interval into a busy loop.
    expect(() => intOption("abc")).toThrow(/expected a number/);
    expect(() => intOption("")).toThrow();
  });
});

describe("boundedIntOption()", () => {
  it("accepts a value at the boundary", () => {
    expect(boundedIntOption(1)("1")).toBe(1);
  });

  it("rejects below the boundary", () => {
    expect(() => boundedIntOption(1)("0")).toThrow(/must be 1 or greater/);
  });

  it("defaults to refusing negatives", () => {
    expect(boundedIntOption()("0")).toBe(0);
    expect(() => boundedIntOption()("-1")).toThrow();
  });

  it("still rejects nonsense", () => {
    expect(() => boundedIntOption()("abc")).toThrow(/expected a number/);
  });
});

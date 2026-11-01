import { describe, expect, it } from "vitest";
import {
  booleanFlagSchema,
  genreQueryParamSchema,
  intFromInputSchema,
  nonNegativeIntFromInputSchema,
  numberFromInputSchema,
  positiveIntFromInputSchema,
  toBooleanFlag,
  toInt,
  toNumber,
} from "./coercion.js";

describe("numeric input coercion", () => {
  it.each([
    ["42", 42],
    [" -3 ", -3],
    ["3.9", 3],
    ["3abc", 3],
    ["0x10", 0],
    ["1e3", 1],
    [0, 0],
    [-4, -4],
  ])("preserves integer parsing for %j", (input, expected) => {
    expect(toInt(input)).toBe(expected);
    expect(intFromInputSchema.parse(input)).toBe(expected);
  });

  it.each([
    ["3.9", 3.9],
    [" -2.5 ", -2.5],
    ["1e3", 1000],
    ["0x10", 16],
    ["0", 0],
    [0, 0],
    [-2.5, -2.5],
  ])("accepts wholly numeric input %j", (input, expected) => {
    expect(toNumber(input)).toBe(expected);
    expect(numberFromInputSchema.parse(input)).toBe(expected);
  });

  it.each([
    "",
    " ",
    "abc",
    "Infinity",
    [],
    ["2"],
    {},
    null,
    undefined,
    true,
    false,
    NaN,
    Infinity,
    -Infinity,
  ])("passes invalid input %j through for validation", (input) => {
    expect(toInt(input)).toBe(input);
    expect(intFromInputSchema.safeParse(input).success).toBe(false);
    expect(toNumber(input)).toBe(input);
    expect(numberFromInputSchema.safeParse(input).success).toBe(false);
  });

  it("keeps integer-prefix parsing separate from decimal validation", () => {
    expect(intFromInputSchema.parse("1e999")).toBe(1);
    expect(toNumber("1e999")).toBe("1e999");
    expect(numberFromInputSchema.safeParse("1e999").success).toBe(false);
    expect(numberFromInputSchema.safeParse("3abc").success).toBe(false);
    expect(toNumber("3abc")).toBe("3abc");
    expect(toInt(1.5)).toBe(1.5);
    expect(intFromInputSchema.safeParse(1.5).success).toBe(false);
    expect(intFromInputSchema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(false);
    expect(toInt("9".repeat(400))).toBe("9".repeat(400));
    expect(intFromInputSchema.safeParse("9".repeat(400)).success).toBe(false);
  });

  it("enforces nonnegative and positive integer boundaries", () => {
    expect(nonNegativeIntFromInputSchema.parse("0")).toBe(0);
    expect(nonNegativeIntFromInputSchema.parse("2.9")).toBe(2);
    expect(nonNegativeIntFromInputSchema.safeParse("-1").success).toBe(false);
    expect(positiveIntFromInputSchema.parse("1")).toBe(1);
    expect(positiveIntFromInputSchema.safeParse("0").success).toBe(false);
    expect(positiveIntFromInputSchema.safeParse("-1").success).toBe(false);
  });
});

describe("query flag and repeated genre adapters", () => {
  it.each(["1", "true", "TRUE", "TrUe"])("enables %j", (input) => {
    expect(booleanFlagSchema.parse(input)).toBe(true);
  });

  it.each(["", "0", "false", "yes", " true "])("disables %j", (input) => {
    expect(booleanFlagSchema.parse(input)).toBe(false);
  });

  it("passes non-string flags through for validation", () => {
    expect(booleanFlagSchema.parse(true)).toBe(true);
    expect(booleanFlagSchema.parse(false)).toBe(false);
    for (const input of [undefined, null, 1, [], ["true"], {}]) {
      expect(toBooleanFlag(input)).toBe(input);
      expect(booleanFlagSchema.safeParse(input).success).toBe(false);
    }
  });

  it("accepts a single genre, repeated genres, an empty array or absence", () => {
    expect(genreQueryParamSchema.parse(" cumbia ")).toEqual(["cumbia"]);
    expect(genreQueryParamSchema.parse([" cumbia ", "porro"])).toEqual(["cumbia", "porro"]);
    expect(genreQueryParamSchema.parse([])).toEqual([]);
    expect(genreQueryParamSchema.parse(undefined)).toBeUndefined();
    expect(genreQueryParamSchema.parse(Array(20).fill("a"))).toHaveLength(20);
  });

  it.each(["", " ", [""], [" "], [1], 1, null, {}, Array(21).fill("a")])(
    "rejects invalid genres %j",
    (input) => {
      expect(genreQueryParamSchema.safeParse(input).success).toBe(false);
    },
  );
});

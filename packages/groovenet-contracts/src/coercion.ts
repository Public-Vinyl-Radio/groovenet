import { z } from "zod";

// Runtime input adapters only: never re-export from the OpenAPI-facing entry point.
export const toInt = (value: unknown): unknown => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return value;
};

export const intFromInputSchema = z.preprocess(toInt, z.number().int());

/** A query-string number, decimals allowed; anything not wholly numeric fails. */
export const toNumber = (value: unknown): unknown => {
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return value;
};
export const numberFromInputSchema = z.preprocess(toNumber, z.number());
export const nonNegativeIntFromInputSchema = z.preprocess(toInt, z.number().int().min(0));

/** A query-string flag: `1`/`true` is on, other strings are off; non-strings pass through. */
export const toBooleanFlag = (value: unknown): unknown =>
  typeof value === "string" ? value === "1" || value.toLowerCase() === "true" : value;
export const booleanFlagSchema = z.preprocess(toBooleanFlag, z.boolean());

export const positiveIntFromInputSchema = z.preprocess(toInt, z.number().int().min(1));

/** A repeatable `genre` query parameter: one value, or several. */
export const genreQueryParamSchema = z
  .preprocess(
    (value) => (typeof value === "string" ? [value] : value),
    z.array(z.string().trim().min(1)).max(20),
  )
  .optional();

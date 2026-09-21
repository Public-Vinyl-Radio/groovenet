import { InvalidArgumentError } from "commander";

/**
 * Parse a numeric option.
 *
 * Commander calls a coercion function as `(value, previous)`, so passing bare
 * `parseInt` alongside a default silently turns that default into the **radix**:
 *
 *     .option("--limit <n>", "…", parseInt, 20)   // parseInt("15", 20) === 25
 *     .option("--minutes <n>", "…", parseInt, 60) // radix out of range -> NaN
 *
 * Neither fails loudly. The first quietly returns the wrong number of results,
 * the second yields NaN and whatever that does downstream — `setTimeout(NaN)`
 * fires immediately, so a poll interval becomes a busy loop.
 *
 * This ignores `previous`, parses base 10, and rejects nonsense outright rather
 * than letting NaN travel.
 */
export function intOption(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new InvalidArgumentError("expected a number");
  }
  return parsed;
}

/** `intOption`, refusing anything below `min` (default 0). */
export function boundedIntOption(min = 0) {
  return (value: string): number => {
    const parsed = intOption(value);
    if (parsed < min) {
      throw new InvalidArgumentError(`must be ${min} or greater`);
    }
    return parsed;
  };
}

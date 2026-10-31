// Months for the listening log (#863), as "YYYY-MM" in the configured display
// time zone, never the browser's.

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

type MonthParts = { year: number; month: number };

function parseMonth(value: string): MonthParts | null {
  const match = MONTH_PATTERN.exec(value);
  if (!match || match[1] === "0000") return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

function formatMonth({ year, month }: MonthParts): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/** The month `now` falls in, in `timeZone`. */
export function currentMonth(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return formatMonth({ year: part("year"), month: part("month") });
}

/** `month` when it is a valid month no later than `latest`; otherwise `latest`. */
export function resolveMonth(month: string | null | undefined, latest: string): string {
  if (!month || !parseMonth(month)) return latest;
  return month > latest ? latest : month;
}

/** The month `delta` months from `month`. */
export function shiftMonth(month: string, delta: number): string {
  const parts = parseMonth(month);
  if (!parts) throw new Error(`Invalid month: ${month}`);
  const index = parts.year * 12 + (parts.month - 1) + delta;
  return formatMonth({ year: Math.floor(index / 12), month: (index % 12) + 1 });
}

// How far `timeZone` is ahead of UTC at `instant`, in ms.
function zoneOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(instant));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

// The instant the month starts in `timeZone`. Corrected once, so a DST change
// between the UTC guess and local midnight still lands on midnight.
function monthStart({ year, month }: MonthParts, timeZone: string): number {
  const guess = Date.UTC(year, month - 1, 1);
  const first = guess - zoneOffset(guess, timeZone);
  return guess - zoneOffset(first, timeZone);
}

/** The month as `from`/`to` for the spin list; `to` is inclusive, so it ends 1 ms early. */
export function monthBounds(month: string, timeZone: string): { from: string; to: string } {
  const parts = parseMonth(month);
  if (!parts) throw new Error(`Invalid month: ${month}`);
  const next = parseMonth(shiftMonth(month, 1)) as MonthParts;
  return {
    from: new Date(monthStart(parts, timeZone)).toISOString(),
    to: new Date(monthStart(next, timeZone) - 1).toISOString(),
  };
}

/** "OCTOBER 2026", or "OCT 2026" when `short`. */
export function formatMonthLabel(month: string, short = false): string {
  const parts = parseMonth(month);
  if (!parts) return month;
  return new Date(Date.UTC(parts.year, parts.month - 1, 1))
    .toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: short ? "short" : "long",
      year: "numeric",
    })
    .toUpperCase();
}

/** "OCTOBER", for the recap heading. */
export function formatMonthName(month: string): string {
  return formatMonthLabel(month).split(" ")[0];
}

/** True for a well-formed "YYYY-MM". */
export function isValidMonth(value: string): boolean {
  return parseMonth(value) !== null;
}

/** "October 2026", for the recap page title. */
export function formatMonthTitle(month: string): string {
  const parts = parseMonth(month);
  if (!parts) return month;
  return new Date(Date.UTC(parts.year, parts.month - 1, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

/** How many days the month has: 28 to 31. */
export function daysInMonth(month: string): number {
  const parts = parseMonth(month);
  if (!parts) throw new Error(`Invalid month: ${month}`);
  return new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
}

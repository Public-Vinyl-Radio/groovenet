// Bucketing and wording for the monthly recap's charts (#865). Pure, so the
// numbers each chart draws and announces are tested in one place.

import type { SpinRecapResponse } from "@/services/internalApi/spins";
import { daysInMonth, formatMonthLabel } from "./spinMonth";

type Genre = SpinRecapResponse["genre_mix"]["current"][number];
type Recap = SpinRecapResponse;
type BpmBin = Recap["bpm"]["histogram"][number];

// Genre bars shade ink into the ground, darkest first, so they follow the
// palette and read without colour; genres past the last step reuse it.
export const GENRE_TINTS = [100, 70, 50, 34, 20, 8];
export const genreTint = (index: number) => GENRE_TINTS[Math.min(index, GENRE_TINTS.length - 1)];

export const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/** Whole hours from 10 up, one decimal below; "≈" when some spins had no duration. */
export function formatRecapHours(hours: number, knownShare: number): string {
  return `${knownShare < 1 ? "≈" : ""}${roundHours(hours)}`;
}

function roundHours(hours: number): number {
  return hours >= 10 ? Math.round(hours) : Math.round(hours * 10) / 10;
}

const signed = (amount: number) => (amount > 0 ? `+${amount}` : `−${Math.abs(amount)}`);

/**
 * The line under a stat tile: "+3 VS SEP", "−2 VS SEP", "SAME AS SEP", or
 * "NO SPINS IN SEP" when last month had no listening to compare with. Hours
 * compare the rounded values the tiles show.
 */
export function describeChange(
  value: number,
  previous: number,
  previousMonth: string,
  options: { hours?: boolean; noPrevious?: boolean } = {},
): string {
  if (options.noPrevious) return `NO SPINS IN ${previousMonth}`;
  const diff = options.hours
    ? Math.round((roundHours(value) - roundHours(previous)) * 10) / 10
    : value - previous;
  return diff === 0 ? `SAME AS ${previousMonth}` : `${signed(diff)} VS ${previousMonth}`;
}

/** "SEP", or "SEPTEMBER" when `long`: the month before `month`. */
export function monthWord(month: string, short = true): string {
  return formatMonthLabel(month, short).split(" ")[0];
}

export type RecapWeek = {
  week: number;
  label: string;
  /** "Oct 1–7"; the last week stops at the month's end. */
  range: string;
  vinyl: number;
  digital: number;
};

/**
 * The month's weeks, day 1–7 as week 1 and so on, the way the recap API counts
 * them. A 28-day February has four; every other month has a short fifth.
 */
export function recapWeeks(month: string, byWeek: Recap["by_week"] = []): RecapWeek[] {
  const days = daysInMonth(month);
  const name = formatMonthLabel(month, true).split(" ")[0];
  const shortName = name.charAt(0) + name.slice(1).toLowerCase();
  return Array.from({ length: Math.ceil(days / 7) }, (_, index) => {
    const first = index * 7 + 1;
    const last = Math.min(first + 6, days);
    const counts = byWeek.find((entry) => entry.week === index + 1);
    return {
      week: index + 1,
      label: `WK ${index + 1}`,
      range: first === last ? `${shortName} ${first}` : `${shortName} ${first}–${last}`,
      vinyl: counts?.vinyl ?? 0,
      digital: counts?.digital ?? 0,
    };
  });
}

/** Share of the whole, 0–100, rounded; 0 when there is no whole. */
export const percent = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

export type GenreMixRow = {
  key: string;
  genreId: string | null;
  name: string;
  tint: number;
  spins: number;
  share: number;
  /** Last month's share; null when it wasn't in last month's top genres. */
  previousShare: number | null;
};

export type GenreMix = {
  rows: GenreMixRow[];
  /** Last month's bar, in this month's order and tints; null with no spins last month. */
  previous: Array<{ key: string; name: string; tint: number; share: number }> | null;
};

const OTHER_KEY = "other";
const genreKey = (genre: Genre) => genre.genre_id ?? OTHER_KEY;

/**
 * Lines last month's mix up with this month's, so a genre keeps its tint in
 * both bars. Last month's genres that aren't in this month's top fold into
 * Other, which is what Other means in this month's bar too.
 */
export function alignGenreMix(current: Genre[], previous: Genre[]): GenreMix {
  const named = current.filter((genre) => genre.genre_id !== null && genre.spins > 0);
  const currentOther = current.find((genre) => genre.genre_id === null);
  const previousTotal = previous.reduce((sum, genre) => sum + genre.spins, 0);
  const keys = new Set(named.map(genreKey));
  const previousShares = new Map<string, number>();
  for (const genre of previous) {
    const key = keys.has(genreKey(genre)) ? genreKey(genre) : OTHER_KEY;
    previousShares.set(key, (previousShares.get(key) ?? 0) + genre.share);
  }
  const shownOther =
    (currentOther?.spins ?? 0) > 0 ||
    (previousTotal > 0 && (previousShares.get(OTHER_KEY) ?? 0) > 0);
  const ordered = [
    ...named,
    ...(shownOther ? [currentOther ?? { genre_id: null, name: "Other", spins: 0, share: 0 }] : []),
  ];
  const rows = ordered.map((genre, index) => ({
    key: genreKey(genre),
    genreId: genre.genre_id,
    name: genre.name,
    tint: genreTint(index),
    spins: genre.spins,
    share: genre.share,
    previousShare: previousTotal > 0 ? (previousShares.get(genreKey(genre)) ?? null) : null,
  }));
  return {
    rows,
    previous:
      previousTotal > 0
        ? rows
            .map((row) => ({ ...row, share: previousShares.get(row.key) ?? 0 }))
            .filter((row) => row.share > 0)
        : null,
  };
}

export type GenreDelta = { text: string; label: string };

/** "▲ 10%" / "▼ 6%" / "— 0%" in share points, "NEW" when it wasn't there last month. */
export function genreDelta(share: number, previousShare: number | null): GenreDelta {
  if (previousShare === null) return { text: "NEW", label: "new this month" };
  const points = Math.round((share - previousShare) * 100);
  if (points > 0) return { text: `▲ ${points}%`, label: `up ${points} points` };
  if (points < 0) return { text: `▼ ${-points}%`, label: `down ${-points} points` };
  return { text: "— 0%", label: "no change" };
}

/** "Latin 34%, Rock 22%" for a genre bar's accessible name. */
export function describeShares(rows: Array<{ name: string; share: number }>): string {
  return rows.map((row) => `${row.name} ${Math.round(row.share * 100)}%`).join(", ");
}

/** Each bar's length as a percentage of the longest; all 0 when nothing counts. */
export function relativeWidths(counts: number[]): number[] {
  const max = Math.max(0, ...counts);
  return counts.map((count) => (max > 0 ? Math.round((count / max) * 100) : 0));
}

// Heatmap cells step through these ink tints; 0 is an empty cell.
export const HEAT_TINTS = [0, 25, 50, 75, 100];

/** Every cell's step, 0 for none and 1–4 by share of the busiest cell. */
export function heatLevels(heatmap: number[][]): number[][] {
  const max = Math.max(0, ...heatmap.flat());
  const top = HEAT_TINTS.length - 1;
  return heatmap.map((row) =>
    row.map((count) => (count > 0 && max > 0 ? Math.max(1, Math.ceil((count / max) * top)) : 0)),
  );
}

const clock = (hour: number) => ({
  hour: hour % 12 === 0 ? 12 : hour % 12,
  half: hour % 24 < 12 ? "AM" : "PM",
});

/** A two-hour block as "8–10 PM", or "10 AM–12 PM" across noon or midnight. */
export function formatBlock(block: number): string {
  const start = clock(block * 2);
  const end = clock(block * 2 + 2);
  return start.half === end.half
    ? `${start.hour}–${end.hour} ${end.half}`
    : `${start.hour} ${start.half}–${end.hour} ${end.half}`;
}

export type BusiestBlock = { weekday: number; block: number; spins: number };

/** The most-spun cell; ties go to the earliest in the week. Null with no spins. */
export function busiestBlock(heatmap: number[][]): BusiestBlock | null {
  let best: BusiestBlock | null = null;
  heatmap.forEach((row, weekday) =>
    row.forEach((spins, block) => {
      if (spins > 0 && (!best || spins > best.spins)) best = { weekday, block, spins };
    }),
  );
  return best;
}

/** "BUSIEST · SAT 8–10 PM". */
export function busiestCaption(heatmap: number[][]): string | null {
  const best = busiestBlock(heatmap);
  return best ? `BUSIEST · ${WEEKDAYS[best.weekday]} ${formatBlock(best.block)}` : null;
}

/** Per-day totals and the busiest block, for the heatmap's accessible name. */
export function describeHeatmap(heatmap: number[][]): string {
  const best = busiestBlock(heatmap);
  const days = heatmap
    .map((row, index) => `${WEEKDAY_NAMES[index]} ${row.reduce((sum, n) => sum + n, 0)}`)
    .join(", ");
  const busiest = best
    ? `Busiest: ${WEEKDAY_NAMES[best.weekday]} ${formatBlock(best.block)}, ${best.spins} spins.`
    : "No spins.";
  return `Spins by day of week and two-hour block. ${busiest} Spins per day: ${days}.`;
}

/** "120–130", with the open-ended first and last bins as "UNDER 90" and "190+". */
export function formatBpmBin(bin: BpmBin, index: number, count: number): string {
  if (index === 0) return `UNDER ${bin.to}`;
  if (index === count - 1) return `${bin.from}+`;
  return `${bin.from}–${bin.to}`;
}

/** "MEDIAN 122 BPM · MOST IN 120–130"; null when no spin had a tempo. */
export function bpmCaption(bpm: Recap["bpm"]): string | null {
  if (bpm.median === null) return null;
  const median = `MEDIAN ${Math.round(bpm.median)} BPM`;
  const index = bpm.busiest ? bpm.histogram.findIndex((bin) => bin.from === bpm.busiest!.from) : -1;
  return index >= 0
    ? `${median} · MOST IN ${formatBpmBin(bpm.histogram[index], index, bpm.histogram.length)}`
    : median;
}

/** Every bin's count, for the histogram's accessible name. */
export function describeBpm(bpm: Recap["bpm"]): string {
  const bins = bpm.histogram
    .map(
      (bin, index, all) => `${formatBpmBin(bin, index, all.length).toLowerCase()} BPM ${bin.spins}`,
    )
    .join(", ");
  const median = bpm.median === null ? "" : ` Median ${Math.round(bpm.median)} BPM.`;
  return `Tempos spun this month.${median} Spins per range: ${bins}.`;
}

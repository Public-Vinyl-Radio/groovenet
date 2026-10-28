/**
 * Which frame fits the terminal. Pure, so every breakpoint is unit-testable;
 * `useTerminalSize` feeds it `stdout.columns` / `rows` and re-runs on resize.
 *
 * The three boards in the design: Full window (120×40), Side pane (40×50) and
 * Bottom strip (120×5).
 */

/** Full window needs this many columns; narrower (but tall) is the side pane. */
export const FULL_MIN_COLUMNS = 80;
/** Full window needs this many rows: its chrome plus a five-row body. */
export const FULL_MIN_ROWS = 24;
/** Side pane needs this many columns: the card's art and a usable text column. */
export const SIDE_MIN_COLUMNS = 32;
/** Side pane needs this many rows: its taller card plus a five-row body. */
export const SIDE_MIN_ROWS = 30;
/** Bottom strip needs this many columns for the now-playing line. */
export const STRIP_MIN_COLUMNS = 60;
/** Bottom strip is exactly this tall: a four-row box and its shadow. */
export const STRIP_ROWS = 5;

export type LayoutKind = "full" | "side" | "strip" | "too-small";

export interface ArtSize { width: number; height: number }

/**
 * Fixed artwork slots, so real art (#829) drops in without relayout. The
 * card's height is sized around them.
 */
export const ART_FULL: ArtSize = { width: 18, height: 8 };
export const ART_SIDE: ArtSize = { width: 14, height: 6 };

/** Outer height of the Now Playing box, borders included (its shadow is one more row). */
export const CARD_ROWS: Record<Exclude<LayoutKind, "too-small">, number> = { full: 10, side: 16, strip: 4 };

/**
 * Rows the frame itself takes in each layout. Full and side: top bar, blank,
 * card, shadow, blank, tabs, rule, status line, rule, hint bar.
 */
const CHROME_ROWS: Record<Exclude<LayoutKind, "too-small">, number> = {
  full: 9 + CARD_ROWS.full,
  side: 9 + CARD_ROWS.side,
  strip: STRIP_ROWS,
};

export interface Layout {
  kind: LayoutKind;
  columns: number;
  rows: number;
  /** Rows left for the view body (0 in the strip and below the minimum). */
  bodyRows: number;
  /** Outer width of a boxed element, leaving a column for its shadow and one spare. */
  boxWidth: number;
  /** The card's artwork slot, or null where the layout has none. */
  art: ArtSize | null;
}

function make(kind: LayoutKind, columns: number, rows: number): Layout {
  const bodyRows = kind === "full" || kind === "side" ? rows - CHROME_ROWS[kind] : 0;
  const art = kind === "full" ? ART_FULL : kind === "side" ? ART_SIDE : null;
  return { kind, columns, rows, bodyRows, boxWidth: Math.max(0, columns - 2), art };
}

/**
 * Wide and tall is the full window; narrow and tall the side pane; anything
 * too short for those but wide enough is the bottom strip (it draws five rows
 * and leaves the rest blank); smaller than every layout is too small.
 */
export function pickLayout(columns: number, rows: number): Layout {
  const cols = Math.max(0, Math.floor(columns || 0));
  const lines = Math.max(0, Math.floor(rows || 0));
  if (cols >= FULL_MIN_COLUMNS && lines >= FULL_MIN_ROWS) return make("full", cols, lines);
  if (cols >= SIDE_MIN_COLUMNS && lines >= SIDE_MIN_ROWS) return make("side", cols, lines);
  if (cols >= STRIP_MIN_COLUMNS && lines >= STRIP_ROWS) return make("strip", cols, lines);
  return make("too-small", cols, lines);
}

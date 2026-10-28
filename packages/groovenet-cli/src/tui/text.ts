/**
 * Text measured in terminal cells. Wide characters (CJK, most emoji) take two
 * cells and combining marks none, so everything here counts display width,
 * never code points. Ink measures with the same `string-width`.
 */
import stringWidth from "string-width";

const segmenter = new Intl.Segmenter();

/** Cells `text` takes on screen. */
export function displayWidth(text: string): number {
  return stringWidth(text);
}

function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), (part) => part.segment);
}

/** The longest prefix of `text` that fits in `max` cells. A wide character is never split. */
export function sliceWidth(text: string, max: number): string {
  let out = "";
  let used = 0;
  for (const grapheme of graphemes(text)) {
    const cells = displayWidth(grapheme);
    if (used + cells > max) break;
    out += grapheme;
    used += cells;
  }
  return out;
}

/** `text` cut to `max` cells, ending in `…` when anything was cut. */
export function truncate(text: string, max: number): string {
  if (displayWidth(text) <= max) return text;
  if (max <= 0) return "";
  return `${sliceWidth(text, max - 1)}…`;
}

/** `text` exactly `width` cells: truncated with `…`, or padded with spaces on the right. */
export function fit(text: string, width: number): string {
  const cut = truncate(text, Math.max(0, width));
  return cut + " ".repeat(Math.max(0, width - displayWidth(cut)));
}

/** `text` exactly `width` cells, right-aligned: padded on the left, truncated with `…`. */
export function fitRight(text: string, width: number): string {
  const cut = truncate(text, Math.max(0, width));
  return " ".repeat(Math.max(0, width - displayWidth(cut))) + cut;
}

/** A `━━────` progress bar, `width` cells wide; all `─` when the duration is unknown. */
export function progressBar(position: number, duration: number | null, width: number): string {
  const cells = Math.max(0, Math.floor(width));
  const fraction = duration && duration > 0 && Number.isFinite(position) ? Math.min(1, Math.max(0, position / duration)) : 0;
  const filled = Math.round(cells * fraction);
  return "━".repeat(filled) + "─".repeat(cells - filled);
}

/**
 * Greedy word wrap to `width` cells. A word wider than the line is broken.
 * Returns one string per screen line, so a caller knows how many rows it takes.
 */
export function wrap(text: string, width: number): string[] {
  if (width <= 0) return [];
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let rest = word;
    const joined = line ? `${line} ${rest}` : rest;
    if (displayWidth(joined) <= width) { line = joined; continue; }
    if (line) lines.push(line);
    line = "";
    while (displayWidth(rest) > width) {
      // A wide character on a one-cell line still has to go somewhere.
      const head = sliceWidth(rest, width) || graphemes(rest)[0]!;
      lines.push(head);
      rest = rest.slice(head.length);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines;
}

// Shelf order for a pulled stack (#1009): records sorted by the code they are
// filed under, so ten records can be pulled in one pass along the shelf.

type ShelfCode = { series: string; number: number; rest: string };

/**
 * "LP-182" → LP, 182. A missing dash ("LP001"), spaces or lower case still
 * land with their series. Anything without letters then digits is unparsed.
 */
export function parseShelfCode(code: string): ShelfCode | null {
  const match = /^([A-Za-z]+)[\s-]*(\d+)(.*)$/.exec(code.trim());
  if (!match) return null;
  return { series: match[1].toUpperCase(), number: Number(match[2]), rest: match[3] };
}

/** Rank: a parsed code, then any other text, then no code at all. */
function rank(code: string | null | undefined): 0 | 1 | 2 {
  if (!code || !code.trim()) return 2;
  return parseShelfCode(code) ? 0 : 1;
}

/** Natural comparison of two shelf codes: series, then number (LP-4 < LP-10), then the rest. */
export function compareShelfCodes(a: string | null | undefined, b: string | null | undefined) {
  const ranks = rank(a) - rank(b);
  if (ranks !== 0) return ranks;
  const left = a ? parseShelfCode(a) : null;
  const right = b ? parseShelfCode(b) : null;
  if (left && right) {
    return (
      left.series.localeCompare(right.series) ||
      left.number - right.number ||
      left.rest.localeCompare(right.rest)
    );
  }
  // Unparsed text sorts as text; two empty codes tie.
  return (a ?? "").localeCompare(b ?? "");
}

/** A copy of the items in shelf order. Equal codes keep their given order. */
export function sortByShelfCode<T>(
  items: T[],
  codeOf: (item: T) => string | null | undefined,
): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compareShelfCodes(codeOf(a.item), codeOf(b.item)) || a.index - b.index)
    .map(({ item }) => item);
}

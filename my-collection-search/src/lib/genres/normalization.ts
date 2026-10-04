/**
 * Produces the canonical lookup key used for taxonomy names and aliases.
 *
 * Display names remain untouched. This deliberately normalises only harmless
 * spelling differences, rather than attempting to decide whether two musical
 * terms mean the same thing; that decision belongs in genre_aliases.
 */
export function normalizeGenreName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

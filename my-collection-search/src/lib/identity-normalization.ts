/**
 * Normalization utilities for music identity embeddings.
 * Provides deterministic, low-noise token generation.
 */

// DJ-function tags to exclude from identity embeddings
// These will be used later in DJ function embeddings
const DJ_FUNCTION_TAGS = new Set([
  "warmup",
  "warm-up",
  "warm up",
  "peak",
  "peak-time",
  "peak time",
  "tool",
  "left-turn",
  "left turn",
  "transition",
  "banger",
  "opener",
  "closer",
  "closing",
  "opening",
  "long intro",
  "long-intro",
  "short intro",
  "short-intro",
  "intro",
  "outro",
  "breakdown",
  "buildup",
  "build-up",
  "build up",
  "drop",
  "filler",
  "interlude",
]);

/**
 * Normalize a single token: lowercase, trim, remove extra punctuation
 */
function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Keep alphanumeric, space, hyphen
    .replace(/\s+/g, " "); // Collapse multiple spaces
}

/**
 * Normalize and deduplicate a list of strings
 * Handles arrays, strings, and comma-separated strings
 */
export function normalizeList(items: string[] | string | null | undefined): string[] {
  if (!items) return [];

  let arr: string[];
  if (Array.isArray(items)) {
    arr = items;
  } else if (typeof items === "string") {
    // Split on comma if it's a comma-separated string
    arr = items.includes(",") ? items.split(",") : [items];
  } else {
    return [];
  }

  const normalized = arr
    .filter((item) => item && typeof item === "string")
    .map(normalizeToken)
    .filter((item) => item.length > 0);

  // Deduplicate while preserving order
  return Array.from(new Set(normalized));
}

/**
 * Format a list as comma-separated string
 */
export function formatList(items: string[]): string {
  return items.join(", ");
}

/**
 * Convert year to era bucket
 */
export function yearToEra(year: string | number | null | undefined): string {
  if (!year) return "unknown-era";

  const yearNum = typeof year === "string" ? parseInt(year, 10) : year;
  if (isNaN(yearNum) || yearNum < 1900) return "unknown-era";

  if (yearNum >= 2020) return "2020s";
  if (yearNum >= 2010) return "2010s";
  if (yearNum >= 2000) return "2000s";
  if (yearNum >= 1990) return "1990s";
  if (yearNum >= 1980) return "1980s";
  if (yearNum >= 1970) return "1970s";
  if (yearNum >= 1960) return "1960s";
  if (yearNum >= 1950) return "1950s";

  return "pre-1950s";
}

/**
 * Filter tags to exclude DJ-function tags
 * Only include tags that look like genre/style/scene descriptors
 */
export function filterIdentityTags(tags: string[] | string | null | undefined): string[] {
  const normalized = normalizeList(tags);
  return normalized.filter((tag) => {
    const lower = tag.toLowerCase();
    return !DJ_FUNCTION_TAGS.has(lower);
  });
}

/**
 * Normalize country/region string
 */
export function normalizeCountry(country: string | null | undefined): string {
  if (!country) return "unknown-country";
  return normalizeToken(country) || "unknown-country";
}

/**
 * Extract first N labels from a label list or string
 */
export function normalizeLabels(
  labels: string[] | string | null | undefined,
  maxLabels = 3
): string[] {
  const normalized = normalizeList(labels);
  return normalized.slice(0, maxLabels);
}

/**
 * Combine and normalize genres from multiple sources
 * Prefer Discogs genres/styles if available, fallback to Apple/iTunes
 */
export function combineGenres(
  discogsGenres: string[] | null | undefined,
  appleGenre: string | null | undefined,
  maxGenres = 8
): string[] {
  let genres: string[] = [];

  // Prefer Discogs genres
  if (discogsGenres && discogsGenres.length > 0) {
    genres = normalizeList(discogsGenres);
  } else if (appleGenre) {
    genres = normalizeList(appleGenre);
  }

  return genres.slice(0, maxGenres);
}

/**
 * Normalize styles list
 */
export function normalizeStyles(
  styles: string[] | string | null | undefined,
  maxStyles = 12
): string[] {
  const normalized = normalizeList(styles);
  return normalized.slice(0, maxStyles);
}

/**
 * Normalize local tags for identity embedding
 */
export function normalizeLocalTags(
  tags: string[] | string | null | undefined,
  maxTags = 12
): string[] {
  const filtered = filterIdentityTags(tags);
  return filtered.slice(0, maxTags);
}

/**
 * Normalize composer name(s)
 */
export function normalizeComposer(composer: string | null | undefined): string[] {
  if (!composer) return [];

  // Split by common delimiters if multiple composers, then normalize each name
  // the same way every other identity field is normalized. Composers used to be
  // trimmed only, so "Steve Reich" and "steve reich" produced different source
  // hashes for the same track and forced a needless re-embed.
  const composers = composer
    .split(/[,;\/&]/)
    .map(normalizeToken)
    .filter((c) => c.length > 0 && c !== "unknown" && c !== "various");

  return Array.from(new Set(composers));
}

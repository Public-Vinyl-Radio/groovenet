/**
 * ISRC and Apple Music link helpers (#1156).
 *
 * An ISRC is 12 characters: a 2-letter country, a 3-character registrant, a
 * 2-digit year and a 5-digit designation. Stored upper case with no hyphens so
 * a lookup on another service compares with `=`.
 */
const ISRC_PATTERN = /^[A-Z0-9]{12}$/;

/** `US-AB1-18-00123` or `usab11800123` to `USAB11800123`; null when it is not an ISRC. */
export function normalizeIsrc(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\s-]/g, "").toUpperCase();
  return ISRC_PATTERN.test(cleaned) ? cleaned : null;
}

export type AppleSongRef = { id: string; storefront: string };

/**
 * The catalog song a link points at. Album links that name a track carry it as
 * `?i=<songId>`; `/song/` links carry it as the last path segment. An album or
 * playlist link alone names no song, so it resolves to null.
 */
export function appleSongFromUrl(url: string | null | undefined): AppleSongRef | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (!/(^|\.)music\.apple\.com$/.test(parsed.hostname)) return null;

  const segments = parsed.pathname.split("/").filter(Boolean);
  const storefront = /^[a-z]{2}$/i.test(segments[0] ?? "") ? segments[0].toLowerCase() : "us";
  const fromQuery = parsed.searchParams.get("i");
  if (fromQuery && /^\d+$/.test(fromQuery)) return { id: fromQuery, storefront };

  const songAt = segments.indexOf("song");
  const last = segments[segments.length - 1];
  if (songAt !== -1 && songAt < segments.length - 1 && /^\d+$/.test(last)) {
    return { id: last, storefront };
  }
  return null;
}
